import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const load = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const source = load('lib/aureka/supabase.ts')
const begin = source.indexOf('const fetchWithSessionRetry: typeof fetch =')
const end = source.indexOf('\n\nexport const aurekaSupabase', begin)
assert.ok(begin >= 0 && end > begin, 'network wrapper must be present')

// Evaluate the actual wrapper, not an approximate reimplementation. Its only
// TypeScript annotation is on the const declaration and is stripped here.
const wrapperCode = source.slice(begin, end).replace('const fetchWithSessionRetry: typeof fetch =', 'const fetchWithSessionRetry =')
const makeWrapper = new Function(
  'isLegacyTrainingMode', 'fetch', 'refreshAccessToken',
  'Request', 'URL', 'Headers', 'ReadableStream',
  wrapperCode + '\nreturn fetchWithSessionRetry;',
)

test('expired-JWT retry replays the entire Request POST body exactly once', async () => {
  const calls = []
  let refreshCount = 0
  const wrapped = makeWrapper(
    () => false,
    async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init)
      calls.push({
        body: await request.text(),
        authorization: new Headers(init?.headers ?? request.headers).get('authorization'),
      })
      return calls.length === 1
        ? new Response('jwt expired', { status: 401 })
        : new Response('ok', { status: 200 })
    },
    async () => { refreshCount += 1; return 'renewed-access-token' },
    Request, URL, Headers, ReadableStream,
  )
  const input = new Request('https://example.com/rest/v1/quality_records', {
    method: 'POST',
    headers: { authorization: 'Bearer expired-access-token', 'content-type': 'application/json' },
    body: '{"audit":"same-payload"}',
  })
  const response = await wrapped(input)
  assert.equal(response.status, 200)
  assert.equal(refreshCount, 1)
  assert.deepEqual(calls.map(c => c.body), ['{"audit":"same-payload"}', '{"audit":"same-payload"}'])
  assert.equal(calls[0].authorization, 'Bearer expired-access-token')
  assert.equal(calls[1].authorization, 'Bearer renewed-access-token')
})

test('a non-expired 401 is returned without refresh or repeat', async () => {
  let calls = 0
  let refreshes = 0
  const wrapped = makeWrapper(
    () => false,
    async () => { calls++; return new Response('access denied', { status: 401 }) },
    async () => { refreshes++; return 'token' },
    Request, URL, Headers, ReadableStream,
  )
  const response = await wrapped('https://example.com/rest/v1/quality_records')
  assert.equal(response.status, 401)
  assert.equal(calls, 1)
  assert.equal(refreshes, 0)
})

test('legacy training refuses reads and writes without calling the network', async () => {
  const wrapped = makeWrapper(
    () => true,
    () => assert.fail('must not reach the network'),
    () => assert.fail('must not refresh the session'),
    Request, URL, Headers, ReadableStream,
  )
  for (const method of ['GET', 'POST', 'PATCH', 'DELETE']) {
    const response = await wrapped('https://example.invalid/rest/v1/staff_directory', { method })
    assert.equal(response.status, 503)
  }
})

test('migration allocates recommendation codes atomically without wrapping after 999', () => {
  const migration = load('supabase/migrations/20261122140000_recommendation_code_sequence_integrity.sql')
  assert.match(migration, /CREATE SEQUENCE IF NOT EXISTS aureka_governance\.recommendation_code_seq/)
  assert.match(migration, /nextval\('aureka_governance\.recommendation_code_seq'/)
  assert.match(migration, /greatest\(3,pg_catalog\.length\(v_serial::text\)\)/)
  assert.match(migration, /REVOKE ALL ON SEQUENCE .* FROM PUBLIC, anon, authenticated/)
  assert.doesNotMatch(migration, /count\(\*\)\s*\+\s*1/, 'count-based allocation races across concurrent requests')
  assert.match(migration, /v_max > v_last/, 'sequence high-water mark must survive repeat deployments')
})
