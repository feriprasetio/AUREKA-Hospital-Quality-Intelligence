import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20261118120000_nara_patient_diagnosis_intelligence.sql')
const completenessMigration = read('supabase/migrations/20261118130000_nara_diagnosis_completeness_and_patient_index_sync.sql')
const gateway = read('supabase/functions/aureka-tanya/index.ts')
const tanya = read('components/TanyaAureka.tsx')
const review = read('components/NaraIcd10ReviewWorkspace.tsx')
const workspace = read('components/NaraAIWorkspace.tsx')

test('patient-index diagnoses are primary even when episode records exist', () => {
  const patientPriority = migration.indexOf('if v_patient_source_rows > 0 then')
  const episodeFallback = migration.indexOf('elsif v_episode_diagnosis_rows > 0 then')
  assert.ok(patientPriority >= 0 && episodeFallback > patientPriority)
  assert.match(migration, /from aureka_quality\.patient_index p[\s\S]*?diagnosis_terakhir/)
})

test('episode metrics remain a separate context and are not joined to patient denominators', () => {
  assert.match(migration, /'episode_context', v_episode_context/)
  assert.match(migration, /'total_episode_records', v_episode_count/)
  assert.match(migration, /'unique_patients_with_mrn', v_episode_patient_count/)
  assert.match(migration, /'episode_count', null/)
})

test('diagnosis normalizer removes punctuation and supports the governed dictionary key', () => {
  assert.match(migration, /nara_normalize_diagnosis\(p_label text\)[\s\S]*?\[\^\[:alnum:\]\]\+/)
  assert.match(migration, /v_key text := aureka_quality\.nara_normalize_diagnosis/)
  assert.match(migration, /diagnosis_key = g\.diagnosis_key/)
})

test('ICD-10 queue is patient-index first, role restricted, room scoped, and keeps the five-patient threshold', () => {
  assert.match(migration, /v_role not in \('ADMIN','PMKP'\)/)
  assert.match(migration, /aureka_system\.has_quality_room_access/)
  assert.match(migration, /from aureka_quality\.patient_index p[\s\S]*?diagnosis_terakhir/)
  assert.match(migration, /having pg_catalog\.count\(distinct internal_no_rm\) >= 5/)
  assert.match(migration, /mapping_status.*<> 'validated'/)
})

test('AI ICD-10 proposals only consume aggregate unmapped terms in bounded batches', () => {
  assert.match(gateway, /p_limit: 200/)
  assert.match(gateway, /String\(r\.mapping_status \|\| "unmapped"\) !== "unmapped"/)
  assert.match(gateway, /const safeRows = unmappedRows\.slice\(0, 15\)/)
  assert.match(gateway, /patient_count: Number\(r\.patient_count\) \|\| 0/)
  assert.match(gateway, /p_status: "proposed"/)
  assert.match(gateway, /validation_reference: null/)
})

test('NARA chat routes explicit ICD-10 proposal requests to the guarded task', () => {
  assert.match(tanya, /requestsIcd10Proposal/)
  assert.match(tanya, /task: 'icd10_suggest'/)
  assert.match(tanya, /body: requestBody/)
})

test('ICD-10 review requires official code title and validation reference before approval', () => {
  assert.match(review, /if \(status === 'validated'\)/)
  assert.match(review, /if \(!title \|\| !reference\)/)
  assert.match(review, /p_validation_reference: status === 'validated' \? reference : null/)
  assert.match(review, /p_status: status/)
})

test('NARA exposes a clinical diagnosis starter and a dedicated ICD-10 review workspace', () => {
  assert.match(workspace, /Analisis diagnosis & ICD-10/)
  assert.match(workspace, /NaraIcd10ReviewWorkspace/)
  assert.match(workspace, /Validasi ICD-10/)
})

test('patient index sync recognizes primary and main diagnosis field variants', () => {
  assert.match(completenessMigration, /patient_index_touch\(p_core jsonb[\s\S]*?Diagnosa Primer/)
  assert.match(completenessMigration, /patient_index_touch\(p_core jsonb[\s\S]*?Diagnosa Utama/)
})

test('NARA reports patient-index diagnosis completeness and unit-level data gaps separately', () => {
  assert.match(completenessMigration, /'patient_index_context', v_patient_index_context/)
  assert.match(completenessMigration, /'total_patients', totals.total_patients/)
  assert.match(completenessMigration, /'diagnosed_patients', totals.diagnosed_patients/)
  assert.match(completenessMigration, /'missing_diagnosis', totals.missing_diagnosis/)
  assert.match(completenessMigration, /'by_unit'/)
  assert.match(gateway, /const completenessLine/)
  assert.match(gateway, /const unitCoverage/)
  assert.match(gateway, /Baris kosong tidak boleh ditafsirkan sebagai pasien tanpa penyakit/)
})
