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

test('named survey migration preserves legacy data and requires person + submitting account for new writes', () => {
  const sql = read('supabase/migrations/20261112010000_named_safety_culture_survey.sql')
  assert.match(sql, /add column if not exists respondent_person_id/)
  assert.match(sql, /add column if not exists submitted_by_user_id/)
  assert.match(sql, /default 'legacy_anonymous'/)
  assert.match(sql, /new\.identity_mode <> 'named'/)
  assert.match(sql, /new\.submitted_by_user_id is distinct from auth\.uid\(\)/)
  assert.match(sql, /new\.respondent_person_id is null/)
  assert.match(sql, /directory_status = 'available'/)
  assert.match(sql, /legacy anonymous survey responses are immutable/i)
  assert.match(sql, /grant insert on aureka_patient_safety\.culture_responses to authenticated/)
  assert.doesNotMatch(sql, /update .*culture_responses set respondent_person_id/i)
})

test('new safety survey identity never equates a shared login with the selected respondent', () => {
  const doc = read('docs/BLUEPRINT-ARSITEKTUR-FINAL-V2.md')
  assert.match(doc, /may submit only with explicit respondent selection and confirmation/)
  assert.match(doc, /It is not proof that the selected person physically entered the response/)
})
