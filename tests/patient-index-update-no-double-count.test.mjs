import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Patient Index increments episode count on INSERT but never on UPDATE', () => {
  const migration = read('supabase/migrations/20261119110000_patient_index_update_no_double_count.sql')
  assert.match(migration, /if tg_op = 'INSERT' then[\s\S]*patient_index_touch/)
  assert.match(migration, /elsif tg_op = 'UPDATE' then[\s\S]*patient_index_update_metadata/)
  assert.match(migration, /total_episode = p\.total_episode/)
  assert.doesNotMatch(migration, /total_episode\s*=\s*p\.total_episode\s*\+/)
})

test('Patient Index trigger covers metadata transitions and is not callable by API roles', () => {
  const migration = read('supabase/migrations/20261119110000_patient_index_update_no_double_count.sql')
  for (const field of ['core_data', 'room_id', 'record_date', 'measurement_grain', 'archived_at', 'status']) {
    assert.ok(migration.includes(field), 'Missing trigger coverage: ' + field)
  }
  assert.match(migration, /revoke all on function aureka_quality\.patient_index_update_metadata\(jsonb, bigint, date\)[\s\S]*from public, anon, authenticated, service_role/i)
  assert.match(migration, /revoke all on function aureka_quality\.patient_index_touch\(jsonb, bigint, date\)[\s\S]*from public, anon, authenticated, service_role/i)
  assert.match(migration, /revoke all on function aureka_quality\.patient_index_on_record\(\)[\s\S]*from public, anon, authenticated, service_role/i)
  assert.match(migration, /set search_path = ''/i)
})

test('Patient Index metadata refresh preserves the MPI and never rebuilds or deletes historical rows', () => {
  const migration = read('supabase/migrations/20261119110000_patient_index_update_no_double_count.sql')
  assert.match(migration, /first_seen[\s\S]*least\(p\.first_seen, excluded\.first_seen\)/)
  assert.match(migration, /last_seen = greatest/)
  assert.match(migration, /room_ids =/)
  assert.match(migration, /diagnosis_terakhir = case/)
  assert.doesNotMatch(migration, /delete from aureka_quality\.patient_index/i)
  assert.doesNotMatch(migration, /truncate\s+aureka_quality\.patient_index/i)
  assert.doesNotMatch(migration, /update aureka_quality\.patient_index\s+set\s+total_episode\s*=\s*0/i)
})
