import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { aggregateSafetyCultureResponses } from '../lib/patient-safety/survey-aggregation.ts'

const response = (period, unit, rating = 4, extra = {}) => ({
  survey_period: period,
  unit_name: unit,
  answers: { E1: rating },
  ...extra,
})

test('small safety-culture groups are suppressed below minimum cell size five', () => {
  const result = aggregateSafetyCultureResponses([
    response('2026-Q4', 'IGD', 4),
    response('2026-Q4', 'IGD', 3),
    response('2026-Q4', 'IGD', 5),
    response('2026-Q4', 'IGD', 4),
  ])
  assert.equal(result.length, 1)
  assert.equal(result[0].suppressed, true)
  assert.equal(result[0].respondentCount, null)
  assert.equal(result[0].meanSafetyRating, null)
})

test('only groups with at least five responses and five valid ratings are aggregated', () => {
  const result = aggregateSafetyCultureResponses([
    response('2026-Q4', 'IGD', 4),
    response('2026-Q4', 'IGD', 3),
    response('2026-Q4', 'IGD', 5),
    response('2026-Q4', 'IGD', 4),
    response('2026-Q4', 'IGD', 4),
    response('2026-Q4', 'ICU', 5),
  ])
  const igd = result.find(row => row.unit === 'IGD')
  const icu = result.find(row => row.unit === 'ICU')
  assert.equal(igd?.suppressed, false)
  assert.equal(igd?.respondentCount, 5)
  assert.equal(igd?.meanSafetyRating, 4)
  assert.equal(icu?.suppressed, true)
  assert.equal(icu?.respondentCount, null)
})

test('aggregate output contains no row-level identifiers or answer payloads', () => {
  const [row] = aggregateSafetyCultureResponses(Array.from({ length: 5 }, () => response('2026-Q4', 'IGD')))
  assert.deepEqual(Object.keys(row).sort(), ['meanSafetyRating', 'period', 'respondentCount', 'suppressed', 'unit'])
  assert.equal('response_id' in row, false)
  assert.equal('submitted_by_user_id' in row, false)
})

test('minimum cell size must be a safe integer of at least two', () => {
  assert.throws(() => aggregateSafetyCultureResponses([], 1), RangeError)
  assert.throws(() => aggregateSafetyCultureResponses([], 2.5), RangeError)
})

test('survey workspace no longer renders named respondent or account identifiers', () => {
  const source = readFileSync(new URL('../components/PatientSafetyWorkspace.tsx', import.meta.url), 'utf8')
  const wizard = readFileSync(new URL('../components/patient-safety/SurveyWizard.tsx', import.meta.url), 'utf8')
  assert.match(wizard, /Survei anonim/)
  assert.match(wizard, /minimum 5/)
  assert.doesNotMatch(wizard, /Nama responden|Konfirmasi identitas responden|Kirim respons bernama/)
  assert.doesNotMatch(source, /Identitas Responden|Akun Pengirim|respondent\?\.display_name/)
  assert.match(source, /aggregateSafetyCultureResponses/)
  assert.match(source, /identity_mode: 'anonymous'/)
})
