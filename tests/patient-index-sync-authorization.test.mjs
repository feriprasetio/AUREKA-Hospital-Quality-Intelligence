import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(
  new URL('../supabase/migrations/20261120164200_fix_patient_index_sync_null_role_guard.sql', import.meta.url),
  'utf8',
)

test('patient index sync rejects missing identity and NULL/non-Admin roles', () => {
  assert.match(migration, /if auth\.uid\(\) is null then[\s\S]*?errcode\s*=\s*'28000'/i)
  assert.match(migration, /coalesce\(aureka_system\.current_role_code\(\),\s*''\)\s*<>\s*'ADMIN'/i)
  assert.match(migration, /errcode\s*=\s*'42501'/i)
})

test('patient index sync keeps its definer search path and synchronization contract', () => {
  assert.match(migration, /security definer/i)
  assert.match(migration, /set search_path to 'aureka_quality', 'aureka_system', 'public'/i)
  assert.match(migration, /measurement_grain\s*=\s*'patient_episode'/i)
  assert.match(migration, /on conflict\s*\(no_rm\)\s*do update/i)
  assert.match(migration, /get diagnostics v_count = row_count/i)
  assert.match(migration, /return v_count/i)
})
