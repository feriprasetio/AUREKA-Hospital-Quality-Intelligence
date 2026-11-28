import { randomBytes } from 'node:crypto'
import assert from 'node:assert/strict'
const base = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
assert.ok(base && key, 'Missing public Supabase configuration')
const username = 'audit-' + randomBytes(10).toString('hex')
const response = await fetch(base + '/functions/v1/aureka-username-auth', {
  method: 'POST',
  headers: { apikey: key, 'Content-Type': 'application/json', Origin: 'https://feriprasetio.github.io' },
  body: JSON.stringify({ action: 'login', username, password: randomBytes(20).toString('hex') }),
  signal: AbortSignal.timeout(15000),
})
assert.equal(response.status, 401, 'Unknown synthetic username must be denied')
const body = await response.json()
assert.deepEqual(body, { error: 'Invalid login credentials' })
assert.match(response.headers.get('cache-control') || '', /no-store/)
assert.equal(response.headers.get('access-control-allow-origin'), 'https://feriprasetio.github.io')
console.log('Username gateway negative authorization and privacy check passed.')
