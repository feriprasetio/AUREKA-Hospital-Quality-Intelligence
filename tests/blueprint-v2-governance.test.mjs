import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('blueprint v2 documents additive rollout and technical identity constraints', () => {
  const doc = read('docs/BLUEPRINT-ARSITEKTUR-FINAL-V2.md')
  assert.match(doc, /Preserve existing production tables/)
  assert.match(doc, /immutable internal `patient_id`/)
  assert.match(doc, /No\. RM/)
  assert.match(doc, /Preserve historical anonymous records as legacy/)
  assert.match(doc, /certified electronic signature/)
  assert.match(doc, /default deny/i)
})

test('named survey migration preserves historical anonymity and requires person, unit and submitter for new responses', () => {
  const sql = read('supabase/migrations/20261112010000_named_safety_culture_survey.sql')
  assert.match(sql, /add column if not exists respondent_person_id/)
  assert.match(sql, /add column if not exists respondent_room_id/)
  assert.match(sql, /add column if not exists submitted_by_user_id/)
  assert.match(sql, /default 'legacy_anonymous'/)
  assert.match(sql, /new\.identity_mode <> 'named'/)
  assert.match(sql, /new\.submitted_by_user_id is distinct from auth\.uid\(\)/)
  assert.match(sql, /new\.respondent_person_id is null/)
  assert.match(sql, /new\.respondent_room_id is null/)
  assert.match(sql, /respondent_identity_confirmed/)
  assert.match(sql, /assignment_status = 'active'/)
  assert.match(sql, /is_locked = true/)
  assert.match(sql, /survey response records are append-only/i)
  assert.doesNotMatch(sql, /update .*culture_responses set respondent_person_id/i)
})

test('legacy survey data is never assigned guessed respondent identities', () => {
  const sql = read('supabase/migrations/20261112010000_named_safety_culture_survey.sql')
  assert.match(sql, /Existing rows are deliberately left legacy_anonymous|historical responses remain legacy anonymous/i)
  assert.doesNotMatch(sql, /update\s+aureka_patient_safety\.culture_responses\s+set/i)
})

test('named survey records distinguish the respondent from the authenticated submitter', () => {
  const doc = read('docs/BLUEPRINT-ARSITEKTUR-FINAL-V2.md')
  assert.match(doc, /may submit only with explicit respondent selection and confirmation/)
  assert.match(doc, /not proof that the selected person physically entered the response/i)
  const sql = read('supabase/migrations/20261112010000_named_safety_culture_survey.sql')
  assert.match(sql, /submitted_by_user_id/)
  assert.match(sql, /respondent_person_id/)
})

test('new safety-culture survey submissions and user interface are anonymous', () => {
  const workspace = read('components/PatientSafetyWorkspace.tsx')
  const wizard = read('components/patient-safety/SurveyWizard.tsx')
  const migration = read('supabase/migrations/20261120142226_anonymous_safety_culture_survey.sql')
  assert.match(wizard, /Survei anonim/)
  assert.match(wizard, /minimum 5 responden/)
  assert.doesNotMatch(wizard, /Nama responden|Konfirmasi identitas responden|Kirim respons bernama/)
  assert.match(workspace, /identity_mode: 'anonymous'/)
  assert.match(workspace, /aggregateSafetyCultureResponses/)
  assert.match(workspace, /const canReadResponses = isSuperAdmin/)
  assert.doesNotMatch(workspace, /survey\.read\.named_response/)
  assert.doesNotMatch(workspace, /Identitas Responden|Akun Pengirim|Waktu Konfirmasi Identitas/)
  assert.match(migration, /new\.identity_mode is distinct from 'anonymous'/)
  assert.match(migration, /new\.respondent_person_id is not null/)
  assert.match(migration, /new\.submitted_by_user_id is not null/)
  assert.match(migration, /aureka_patient_safety\.can_export_survey\(\)/)
  assert.match(migration, /aureka_system\.has_quality_room_access\(v_room_id\)/)
})

test('legacy named survey records are preserved without being exposed as row-level results', () => {
  const workspace = read('components/PatientSafetyWorkspace.tsx')
  const migration = read('supabase/migrations/20261120142226_anonymous_safety_culture_survey.sql')
  assert.match(migration, /array\['legacy_anonymous'::text, 'anonymous'::text, 'named'::text\]/)
  assert.doesNotMatch(migration, /update\s+aureka_patient_safety\.culture_responses\s+set/i)
  assert.match(workspace, /Respons historis bernama tetap tersimpan sebagai data lama/)
  assert.match(workspace, /aggregateSafetyCultureResponses/)
  assert.match(workspace, /responseRows\.map\(row => <tr/)
  assert.doesNotMatch(workspace, /row\.identity_mode === 'named' \? \(respondent\?\.display_name/)
})

test('anonymous survey submissions are constrained to the signed-in user unit scope', () => {
  const migration = read('supabase/migrations/20261120142226_anonymous_safety_culture_survey.sql')
  assert.match(migration, /auth\.uid\(\) is null/)
  assert.match(migration, /aureka_system\.has_quality_room_access\(v_room_id\)/)
  assert.match(migration, /r\.is_active = true/)
  assert.match(migration, /new\.respondent_person_id is not null/)
  assert.match(migration, /new\.respondent_room_id is not null/)
  assert.match(migration, /new\.submitted_by_user_id is not null/)
})

