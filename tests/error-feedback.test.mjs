import test from 'node:test'
import assert from 'node:assert/strict'
import { toUserFacingError } from '../lib/aureka/error-feedback.ts'
import { readFileSync } from 'node:fs'

test('maps common Supabase/PostgreSQL codes to safe Indonesian guidance', () => {
  assert.match(toUserFacingError({ code: '23505', message: 'duplicate key value violates unique constraint' }), /sudah tersedia/i)
  assert.match(toUserFacingError({ code: '42501', message: 'permission denied' }), /tidak memiliki izin/i)
  assert.match(toUserFacingError({ code: 'PGRST202', message: 'schema cache function not found' }), /belum tersedia/i)
  assert.match(toUserFacingError({ status: 401, message: 'Unauthorized' }), /sesi login/i)
})

test('does not expose SQL, schema details, raw URLs, or UUIDs', () => {
  const technical = { message: 'permission denied for schema aureka_quality at https://db.example.test 123e4567-e89b-42d3-a456-426614174000' }
  const result = toUserFacingError(technical, { fallback: 'Data belum dapat diproses.' })
  assert.equal(result, 'Data belum dapat diproses.')
  assert.doesNotMatch(result, /aureka_quality|https|123e4567/i)
})

test('preserves concise application validation messages', () => {
  const message = 'Nama unit dan kode wajib diisi.'
  assert.equal(toUserFacingError(new Error(message)), message)
})

test('maps connectivity, timeout and authentication failures', () => {
  assert.match(toUserFacingError(new TypeError('Failed to fetch')), /koneksi/i)
  assert.match(toUserFacingError(new Error('Request timed out')), /lebih lama/i)
  assert.match(toUserFacingError(new Error('Invalid login credentials')), /password salah/i)
  assert.match(toUserFacingError(new Error('Email not confirmed')), /belum diverifikasi/i)
})

test('uses the supplied fallback for unknown service objects', () => {
  assert.equal(toUserFacingError({ message: 'unexpected database failure' }, { fallback: 'Belum berhasil.' }), 'Belum berhasil.')
})

test('async state panel exposes loading, empty, and error semantics with retry', () => {
  const source = readFileSync(new URL('../components/AsyncStatePanel.tsx', import.meta.url), 'utf8')
  assert.match(source, /role=\{isError \? 'alert' : 'status'\}/)
  assert.match(source, /aria-live=\{isError \? 'assertive' : 'polite'\}/)
  assert.match(source, /aria-busy=\{isLoading \|\| retrying\}/)
  assert.match(source, /onClick=\{onRetry\}/)
  assert.match(source, /prefers-reduced-motion/)
})
