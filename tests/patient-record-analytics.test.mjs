import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Patient module reads episode data but never creates a second episode-entry path', () => {
  const registry = read('components/PatientRegistryWorkspace.tsx')
  const analytics = read('components/patient-registry/PatientRecordAnalytics.tsx')
  const quality = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(registry, /PatientIndexTab/)
  assert.match(registry, /PatientRecordAnalytics/)
  assert.doesNotMatch(registry, /QualityIndicatorWorkspace|patientRegistryMode|Daftar Episode|Input Episode/)
  assert.match(analytics, /aureka_patient_episode_stats/)
  assert.match(analytics, /Tidak ada formulir input atau perubahan logbook/)
  assert.doesNotMatch(analytics, /save_quality_logbook|archive_quality_logbook|\.rpc\(['"]save/)
  assert.doesNotMatch(quality, /patientRegistryMode/)
})

test('Patient analytics exposes LOS and ICD-10 while marking estimated readmission as non-official', () => {
  const analytics = read('components/patient-registry/PatientRecordAnalytics.tsx')
  const migration = read('supabase/migrations/20261118110000_patient_record_analytics_and_index_repair.sql')
  for (const label of ['Rata-rata LOS rawat inap', 'Distribusi Length of Stay', 'ICD-10 teridentifikasi', 'Diagnosis dan ICD-10 terbanyak', 'No. RM tidak valid / kosong']) {
    assert.ok(analytics.includes(label), 'Missing medical-record analysis: ' + label)
  }
  assert.match(analytics, /Estimasi seluruh periode logbook/)
  assert.match(analytics, /bukan indikator resmi SIMRS/)
  for (const key of ['patients_unique', 'icd10_coded', 'icd10_uncoded', 'diagnosis_missing', 'rm_invalid', 'los_bands', 'readmission_30']) {
    assert.ok(migration.includes("'" + key + "'"), 'Missing aggregate output key ' + key)
  }
  assert.match(migration, /when end_raw is not null and trim\(los_raw\)/)
  assert.ok(migration.includes("end_raw ~ '^"))
})

test('Patient index edit synchronization does not increment episode counts again', () => {
  const migration = read('supabase/migrations/20261118110000_patient_record_analytics_and_index_repair.sql')
  assert.match(migration, /if tg_op = 'INSERT' then[\s\S]*patient_index_touch/)
  assert.match(migration, /elsif tg_op = 'UPDATE' then[\s\S]*patient_index_update_metadata/)
  assert.match(migration, /total_episode = p\.total_episode/)
  assert.match(migration, /revoke all on function aureka_quality\.patient_index_touch\(jsonb, bigint, date\) from public, anon, authenticated/)
  assert.match(migration, /revoke all on function aureka_quality\.patient_index_on_record\(\) from public, anon, authenticated/)
  assert.doesNotMatch(migration, /create temporary table patient_index_rebuild|update aureka_quality\.patient_index p\s+set first_seen = null/)
})
