import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('blueprint v2 documents additive rollout and technical identity constraints', () => {
  const doc = read('docs/BLUEPRINT-ARSITEKTUR-FINAL-V2.md')
  assert.match(doc, /Preserve existing production tables/)
  assert.match(doc, /immutable internal `patient_id`/)
  assert.match(doc, /No\. RM/)
  assert.match(doc, /legacy_anonymous/)
  assert.match(doc, /certified electronic signature/)
  assert.match(doc, /default deny/)
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

test('survey UI no longer describes the instrument or its submissions as anonymous', () => {
  const workspace = read('components/PatientSafetyWorkspace.tsx')
  const wizard = read('components/patient-safety/SurveyWizard.tsx')
  assert.doesNotMatch(wizard, /anonim/i)
  assert.match(wizard, /respondentOptions/)
  assert.match(wizard, /identityConfirmed/)
  assert.match(wizard, /Kirim respons bernama/)
  assert.match(workspace, /respondent_person_id: surveyRespondentId/)
  assert.match(workspace, /submitted_by_user_id: authData\.user\.id/)
  assert.match(workspace, /identity_mode: 'named'/)
  assert.match(workspace, /surveyUnitOptions\.includes\(surveyUnit\)/)
  assert.match(workspace, /staffOptions\.filter\(person => person\.room_name === surveyUnit\)/)
})

test('selected person and unit are constrained to active locked staff assignments', () => {
  const workspace = read('components/PatientSafetyWorkspace.tsx')
  const sql = read('supabase/migrations/20261112010000_named_safety_culture_survey.sql')
  assert.match(workspace, /\.eq\('assignment_status', 'active'\)/)
  assert.match(workspace, /\.eq\('is_locked', true\)/)
  assert.match(sql, /assignment_status = 'active'/)
  assert.match(sql, /is_locked = true/)
  assert.match(sql, /r\.is_active = true/)
  assert.match(sql, /respondent_room_id/)
})

test('legacy responses remain readable as legacy while new response export carries identity attribution', () => {
  const workspace = read('components/PatientSafetyWorkspace.tsx')
  assert.match(workspace, /row\.identity_mode \|\| 'legacy_anonymous'/)
  assert.match(workspace, /'Legacy anonim'/)
  assert.match(workspace, /'Akun Pengirim'/)
  assert.match(workspace, /'Waktu Konfirmasi Identitas'/)
  assert.match(workspace, /\.select\('\*'\)/)
})
