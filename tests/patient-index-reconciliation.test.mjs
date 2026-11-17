import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('patient index derives episode counts from source records instead of incrementing on each edit', () => {
  const migration = read('supabase/migrations/20261118040000_patient_index_reconciliation.sql')
  assert.match(migration, /create or replace function aureka_quality\.patient_index_refresh/)
  assert.match(migration, /count\(\*\)::integer/)
  assert.match(migration, /total_episode = excluded\.total_episode/)
  assert.match(migration, /after insert or update or delete/i)
  assert.match(migration, /old\.measurement_grain = 'patient_episode'/)
  assert.match(migration, /new\.measurement_grain = 'patient_episode'/)
  assert.match(migration, /v_new_rm is distinct from v_old_rm/)
  assert.match(migration, /patient_index_refresh\(item\.no_rm\)/)
  assert.doesNotMatch(migration, /total_episode = p\.total_episode \+ 1/)
})

test('patient index refresh retains external identity and SIMRS bridging attributes', () => {
  const migration = read('supabase/migrations/20261118040000_patient_index_reconciliation.sql')
  assert.match(migration, /insert into aureka_quality\.patient_index/)
  assert.match(migration, /nama_pasien = coalesce\(excluded\.nama_pasien, current_index\.nama_pasien\)/)
  assert.doesNotMatch(migration, /set\s+nik\s*=/i)
  assert.doesNotMatch(migration, /set\s+no_ihs\s*=/i)
  assert.doesNotMatch(migration, /set\s+simrs_patient_id\s*=/i)
  assert.doesNotMatch(migration, /set\s+bridging_status\s*=/i)
})
