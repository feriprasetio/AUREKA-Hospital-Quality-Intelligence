import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const root = new URL('../', import.meta.url)
const read = (path) => readFileSync(new URL(path, root), 'utf8')
const retired = [
  'supabase/functions/aureka-spo-analyze/index.ts',
  'supabase/functions/aureka-secretariat-parse/index.ts',
]

function sourceFiles(dir) {
  const absolute = new URL(dir + '/', root)
  const result = []
  for (const entry of readdirSync(absolute, { withFileTypes: true })) {
    const path = join(dir, entry.name).replaceAll('\\', '/')
    if (entry.isDirectory()) result.push(...sourceFiles(path))
    else if (/\.(?:tsx?|jsx?|mjs)$/.test(entry.name)) result.push(path)
  }
  return result
}

test('every active browser/server codepath avoids Supabase Storage client calls', () => {
  const paths = ['app', 'components', 'lib', 'supabase/functions'].flatMap(sourceFiles)
  assert.ok(paths.length > 100, 'all application source directories must be scanned')
  for (const path of paths) {
    const contents = read(path)
    assert.doesNotMatch(contents, /\.storage\s*\.\s*from\s*\(/,
      path + ' must not read or write original binary objects')
    assert.doesNotMatch(contents, /storage\/v1\/object(?:\/|$)/,
      path + ' must not bypass the Storage client through direct object API')
    if (path.startsWith('components/') || path.startsWith('app/') || path.startsWith('lib/')) {
      assert.doesNotMatch(contents, /\.functions\s*\.\s*invoke\s*\(\s*['"]aureka-(?:spo-analyze|secretariat-parse)['"]/,
        path + ' must not call retired binary parsing functions')
    }
  }
})

test('legacy binary parser endpoints return 410 without inspecting request bodies', async () => {
  for (const path of retired) {
    const contents = read(path)
    assert.match(contents, /ENDPOINT_RETIRED_ZERO_FILE/)
    assert.doesNotMatch(contents, /storage\.from|arrayBuffer\(|\.download\(|supabase-js|JSZip|pdfjs/)
    let handler
    const stripped = contents.replace('request: Request', 'request').replace('): Response', ')')
    new Function('Deno', stripped)({ serve: callback => { handler = callback } })
    assert.equal(typeof handler, 'function', path + ' should register a handler')
    const origin = 'https://feriprasetio.github.io'
    const post = handler(new Request('https://example.invalid/functions/v1/' + path, {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ storage_path: 'spo/legacy-document.pdf', raw_base64: 'do-not-read' }),
    }))
    assert.equal(post.status, 410, path)
    assert.equal(post.headers.get('X-Aureka-File-Policy'), 'data-only')
    assert.equal(post.headers.get('Cache-Control'), 'no-store, max-age=0')
    const payload = await post.json()
    assert.equal(payload.error, 'ENDPOINT_RETIRED_ZERO_FILE')
    const options = handler(new Request('https://example.invalid', {
      method: 'OPTIONS', headers: { Origin: origin },
    }))
    assert.equal(options.status, 204)
    assert.equal(options.headers.get('Access-Control-Allow-Origin'), origin)
    const foreign = handler(new Request('https://example.invalid', {
      method: 'POST', headers: { Origin: 'https://attacker.example' },
    }))
    assert.equal(foreign.headers.get('Access-Control-Allow-Origin'), null)
  }
})

test('legacy function deployments keep gateway JWT verification', () => {
  const config = read('supabase/config.toml')
  for (const slug of ['aureka-spo-analyze', 'aureka-secretariat-parse']) {
    const segment = config.split('[functions.' + slug + ']')[1]
    assert.ok(segment, slug + ' section must exist')
    assert.match(segment.split(/^\[/m)[0], /verify_jwt\s*=\s*true/)
  }
})

test('storage policy still blocks authenticated client uploads regardless of older grants', () => {
  const migration = read('supabase/migrations/20261122181000_zero_file_storage_policies.sql')
  for (const verb of ['INSERT', 'UPDATE']) {
    assert.ok(migration.includes('AS RESTRICTIVE FOR ' + verb + ' TO anon, authenticated'))
  }
  assert.match(migration, /WITH CHECK \(false\)/)
})
