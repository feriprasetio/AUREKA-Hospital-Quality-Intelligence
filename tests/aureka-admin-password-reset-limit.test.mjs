import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const load = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const edge = load('supabase/functions/aureka-admin-reset-unit-password/index.ts')
const migration = load('supabase/migrations/20261122160000_admin_password_reset_server_rate_limit.sql')

test('only an authenticated active admin can consume privileged reset quota', () => {
  const roleCheck = edge.indexOf('callerRole?.code !== "ADMIN"')
  const limit = edge.indexOf('"aureka_consume_user_rate_limit"')
  const reset = edge.indexOf('admin.auth.admin.updateUserById(')
  assert.ok(roleCheck > 0 && limit > roleCheck && reset > limit,
    'rate limiting must run after authorization, before credential mutation')
  assert.match(edge, /global: \{ headers: \{ Authorization: `Bearer \$\{jwt\}` \} \}/)
  assert.match(edge, /if \(limitError\) return reply\(503/)
  assert.match(edge, /if \(overLimit\) return reply\(429/)
  assert.match(edge, /headers\["Retry-After"\] = "600"/)
})

test('rate limiting is database-atomic and does not scan all windows per request', () => {
  assert.match(migration, /CHECK \(bucket IN \('tanya','document_ingest','admin_password_reset'\)\)/)
  assert.match(migration, /WHEN 'admin_password_reset' THEN/)
  assert.match(migration, /v_limit := 10/)
  assert.match(migration, /v_window_seconds := 600/)
  assert.match(migration, /ON CONFLICT \(user_id, bucket\)/)
  assert.doesNotMatch(migration, /DELETE FROM aureka_private\.edge_rate_limit_windows/)
  assert.doesNotMatch(migration, /GRANT .* TO anon/)
})
