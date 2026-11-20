import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const migration = readFileSync(new URL('../supabase/migrations/20261120140200_anonymous_safety_culture_survey.sql', import.meta.url), 'utf8')
const workspace = readFileSync(new URL('../components/PatientSafetyWorkspace.tsx', import.meta.url), 'utf8')

test('new safety-culture responses are anonymous and unit-scoped at the database boundary', () => {
  assert.match(migration, /identity_mode is distinct from 'anonymous'/i)
  assert.match(migration, /respondent_person_id is not null/i)
  assert.match(migration, /respondent_room_id is not null/i)
  assert.match(migration, /submitted_by_user_id is not null/i)
  assert.match(migration, /has_quality_room_access\(v_room_id\)/i)
  assert.match(migration, /culture_responses_select_superadmin/i)
  assert.match(migration, /using \(aureka_patient_safety\.can_export_survey\(\)\)/i)
  assert.doesNotMatch(migration, /update aureka_patient_safety\.culture_responses\s+set/i)
})

test('survey workspace does not grant raw response access to named-response permission holders', () => {
  assert.match(workspace, /const canReadResponses = isSuperAdmin/)
  assert.doesNotMatch(workspace, /survey\.read\.named_response/)
})
