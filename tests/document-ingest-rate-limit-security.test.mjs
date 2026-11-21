import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../supabase/functions/aureka-document-ingest/index.ts', import.meta.url), 'utf8')

test('document ingestion rate limiting uses the atomic shared database limiter', () => {
  assert.match(source, /db\.rpc\(\s*"aureka_consume_user_rate_limit"/)
  assert.match(source, /p_bucket: "document_ingest"/)
  assert.match(source, /rateLimitError \|\| typeof rateLimited !== "boolean"/)
  assert.match(source, /return reply\(503, \{ error: "Layanan pembatasan/)
  assert.match(source, /if \(rateLimited\) \{/)
  assert.doesNotMatch(source, /new Map<string, number\[\]>\(\)/)
  assert.doesNotMatch(source, /function rateLimited\(/)
})

test('document ingestion rejects deactivated and password-rotation profiles', () => {
  assert.match(source, /select\("is_active, deactivated_at, role_id, must_change_password"\)/)
  assert.match(source, /profileError \|\| !profile\?\.is_active \|\| profile\.deactivated_at \|\| profile\.must_change_password/)
  assert.match(source, /role\?\.is_active/)
  assert.match(source, /claim_document_ingestion_job/)
})

test('legacy ingest does not expose service-role credentials or permit anonymous invocation', () => {
  assert.match(source, /db\.auth\.getUser\(jwt\)/)
  assert.match(source, /if \(!jwt\) return reply\(401/)
  assert.doesNotMatch(source, /SUPABASE_SERVICE_ROLE_KEY|service_role/i)
})
