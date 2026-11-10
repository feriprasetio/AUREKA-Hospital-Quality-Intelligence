import test from 'node:test'
import assert from 'node:assert/strict'
import { parseAuthCallbackError } from '../lib/aureka/auth-callback.ts'

test('recognizes expired or already-used Supabase email links in the URL fragment', () => {
  const result = parseAuthCallbackError('#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired')
  assert.ok(result)
  assert.match(result.message, /kedaluwarsa atau sudah pernah dipakai/)
  assert.equal(result.code, 'otp_expired')
})

test('recognizes Supabase callback errors in the query string', () => {
  const result = parseAuthCallbackError('', '?error=access_denied&error_description=link+expired')
  assert.ok(result)
  assert.match(result.message, /kedaluwarsa/)
})

test('checks the query string when the fragment contains only recovery tokens', () => {
  const result = parseAuthCallbackError('#access_token=token&type=recovery', '?error=access_denied&error_code=otp_expired')
  assert.ok(result)
  assert.match(result.message, /kedaluwarsa/)
})

test('returns a generic actionable message for non-expiry callback errors', () => {
  const result = parseAuthCallbackError('#error=access_denied&error_description=Email+provider+rejected+request')
  assert.ok(result)
  assert.match(result.message, /tidak dapat diproses/)
})

test('returns null when the URL has no Supabase callback error', () => {
  assert.equal(parseAuthCallbackError('#access_token=token&type=recovery', '?next=%2Fworkspace'), null)
})
