import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildOppeResponseIndex,
  buildOppeScore,
  evaluateClinicalIndicator,
  isInPeriod,
  recordFields,
  responseFor,
} from '../lib/aureka/oppe-engine.ts'

const profileBase = {
  id: 'profile-1',
  code: 'OPPE-TEST-01',
  title: 'Indikator uji OPPE',
  room_id: 1,
  unit_name: 'IGD',
  profile_year: 2026,
  unit_of_measure: 'Persentase (%)',
  target_text: '≥ 80%',
  target_operator: '>=',
  target_value: 80,
  numerator_definition: 'Observasi yang memenuhi',
  denominator_definition: 'Seluruh observasi valid',
  measurement_grain: 'patient_episode',
  options_json: [
    { label: 'Memenuhi', code: 1, numerator: true, denominator: true },
    { label: 'Tidak memenuhi', code: 0, numerator: false, denominator: true },
    { label: 'Tidak berlaku', code: 9, numerator: false, denominator: false },
  ],
  schema_json: {},
}

const ruleBase = {
  profile_id: 'profile-1',
  room_id: 1,
  profile_year: 2026,
  is_oppe_eligible: true,
  profession_label: 'Perawat',
  responsibility_field: 'Perawat Penerima',
  measurement_method: 'option_response',
  minimum_observations: 2,
  criticality: 'standard',
  status: 'active',
  notes: 'Aturan uji dengan atribusi perawat yang eksplisit.',
}

const record = (id, overrides = {}) => ({
  id,
  room_id: 1,
  profile_year: 2026,
  record_date: '2026-01-15',
  status: 'validated',
  core_data: { form_fields: { 'Perawat Penerima': 'Siti' } },
  subject_json: {},
  ...overrides,
})

const responseRow = (recordId, rawValue, more = {}) => ({
  record_id: recordId,
  indicator_id: 'profile-1',
  raw_value: rawValue,
  ...more,
})

test('accepts Indonesian dates and does not assign cross-quarter aggregates to either quarter', () => {
  assert.equal(isInPeriod(record('q4-local', { record_date: '27/10/2026' }), 2026, 4), true)
  const crossQuarter = record('cross-quarter', {
    record_date: null,
    period_start: '2026-03-31',
    period_end: '2026-04-01',
  })
  assert.equal(isInPeriod(crossQuarter, 2026, 1), false)
  assert.equal(isInPeriod(crossQuarter, 2026, 2), false)
})

test('uses subject_json fields when core_data is present but partial', () => {
  const item = record('subject-fallback', {
    core_data: { audit_metadata: { source: 'legacy' } },
    subject_json: { form_fields: { 'Perawat Penerima': 'Siti', 'Tanggal Audit': '15/01/2026' } },
  })
  assert.equal(recordFields(item)['Perawat Penerima'], 'Siti')
  assert.equal(isInPeriod(item, 2026, 1), true)
})

test('recovers response label when the raw response object is empty', () => {
  const item = record('label-fallback')
  const profile = { ...profileBase }
  const index = buildOppeResponseIndex([
    responseRow(item.id, {}, { response_label: 'Memenuhi', response_code: 1 }),
  ])
  assert.deepEqual(responseFor(item, profile, index), {
    answer: 'Memenuhi',
    code: 1,
    response_code: 1,
  })
})

test('calculates option-response rates from indexed validated records only', () => {
  const records = [
    record('pass-1'),
    record('fail-1'),
    record('draft-ignored', { status: 'draft' }),
  ]
  const index = buildOppeResponseIndex([
    responseRow('pass-1', { answer: 'Memenuhi' }),
    responseRow('fail-1', { answer: 'Tidak memenuhi' }),
    responseRow('draft-ignored', { answer: 'Memenuhi' }),
  ])
  const result = evaluateClinicalIndicator({
    profile: profileBase,
    rule: ruleBase,
    records,
    responseRows: index,
    staffName: 'Siti',
    profession: 'Perawat',
    year: 2026,
    quarter: 1,
  })
  assert.equal(result.observations, 2)
  assert.equal(result.numerator, 1)
  assert.equal(result.denominator, 2)
  assert.equal(result.rate, 50)
  assert.equal(result.status, 'below_target')
})

test('parses Indonesian decimal values and exposes the calculated metric with its unit', () => {
  const profile = {
    ...profileBase,
    target_text: '≤ 60 menit',
    target_operator: '<=',
    target_value: 60,
    unit_of_measure: 'menit',
  }
  const rule = { ...ruleBase, measurement_method: 'numeric_target' }
  const records = [record('time-1'), record('time-2')]
  const index = buildOppeResponseIndex([
    responseRow('time-1', { value: '55,5' }),
    responseRow('time-2', { value: '56,5' }),
  ])
  const result = evaluateClinicalIndicator({
    profile,
    rule,
    records,
    responseRows: index,
    staffName: 'Siti',
    profession: 'Perawat',
    year: 2026,
    quarter: 1,
  })
  assert.equal(result.numericMean, 56)
  assert.equal(result.unitOfMeasure, 'menit')
  assert.equal(result.targetMet, true)
  assert.equal(result.status, 'meets_target')
})

test('does not convert inadequate evidence into a zero overall OPPE score', () => {
  const pending = (id, label) => ({ id, label, target: '', status: 'insufficient_data', count: '', evidence: '', notes: 'Bukti belum tersedia pada periode penilaian.' })
  const score = buildOppeScore({
    behavior: [pending('behavior-1', 'Perilaku')],
    professionalism: [pending('professionalism-1', 'Pengembangan')],
    clinical: [],
    quarter: 1,
  })
  assert.equal(score.overall, null)
  assert.equal(score.category, 'Belum dapat dinilai')
  assert.equal(score.decision, 'insufficient_data')
})
