import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assessIgdConsultationFlags,
  calculateIgdElapsedMinutes,
  igdLocalDate,
  normalizeIgdDateTime,
  normalizeIgdMrn,
  parseIgdSourceChoice,
  reconcileIgdConsultation,
} from '../lib/aureka/igd-logbook.ts'

test('preserves the source MRN identifier instead of stripping leading zeroes or punctuation', () => {
  assert.equal(normalizeIgdMrn(' 00-123  '), '00-123')
  assert.notEqual(normalizeIgdMrn('00123'), normalizeIgdMrn('123'))
})

test('parses coded source choices without altering the original response label', () => {
  const parsed = parseIgdSourceChoice('Terlambat (Code 3)')
  assert.equal(parsed.raw, 'Terlambat (Code 3)')
  assert.equal(parsed.label, 'Terlambat')
  assert.equal(parsed.code, 3)
  assert.equal(parseIgdSourceChoice('Terlambat tanpa kode').code, null)
  assert.equal(parseIgdSourceChoice('Kejadian (Code 9)').code, null)
})

test('normalizes Excel serial dates and Pontianak wall-clock timestamps', () => {
  assert.equal(normalizeIgdDateTime(46023), '2026-01-01T00:00:00+07:00')
  assert.equal(normalizeIgdDateTime('31/01/2026 22:08'), '2026-01-31T22:08:00+07:00')
  assert.equal(normalizeIgdDateTime('31/02/2026 22:08'), null)
  assert.equal(igdLocalDate('2026-04-03T12:00:00+07:00'), '2026-04-03')
})

test('derives registration-to-consultation minutes only from valid ordered timestamps', () => {
  assert.equal(calculateIgdElapsedMinutes('2026-01-01T10:00:00+07:00', '2026-01-01T10:30:00+07:00'), 30)
  assert.equal(calculateIgdElapsedMinutes('2026-01-01T10:30:00+07:00', '2026-01-01T10:00:00+07:00'), null)
  assert.equal(calculateIgdElapsedMinutes(null, '2026-01-01T10:00:00+07:00'), null)
})

test('matches by exact MRN, same calendar date and one-minute timestamp tolerance', () => {
  const main = [
    { sourceRow: 4, medicalRecordNo: '00077', admissionAt: '2026-01-02T10:00:00+07:00' },
    { sourceRow: 5, medicalRecordNo: '77', admissionAt: '2026-01-02T10:00:00+07:00' },
    { sourceRow: 6, medicalRecordNo: '00077', admissionAt: '2026-01-03T10:00:00+07:00' },
  ]
  const matched = reconcileIgdConsultation({ medicalRecordNo: '00077', registeredAt: '2026-01-02T10:00:30+07:00' }, main)
  assert.equal(matched.status, 'matched')
  assert.equal(matched.sourceRow, 4)
  const differentMrn = reconcileIgdConsultation({ medicalRecordNo: '77', registeredAt: '2026-01-02T10:00:30+07:00' }, main)
  assert.equal(differentMrn.status, 'matched')
  assert.equal(differentMrn.sourceRow, 5)
})

test('retains ambiguous duplicate episode matches instead of choosing one arbitrarily', () => {
  const main = [
    { sourceRow: 10, medicalRecordNo: '123', admissionAt: '2026-03-01T11:00:00+07:00' },
    { sourceRow: 11, medicalRecordNo: '123', admissionAt: '2026-03-01T11:00:00+07:00' },
  ]
  const result = reconcileIgdConsultation({ medicalRecordNo: '123', registeredAt: '2026-03-01T11:00:00+07:00' }, main)
  assert.equal(result.status, 'ambiguous')
  assert.deepEqual(result.candidateRows, [10, 11])
  assert.equal(result.sourceRow, null)
})

test('does not create a match from a different day or from a long time gap', () => {
  const main = [{ sourceRow: 9, medicalRecordNo: '123', admissionAt: '2026-03-01T11:00:00+07:00' }]
  assert.equal(reconcileIgdConsultation({ medicalRecordNo: '123', registeredAt: '2026-03-01T11:02:00+07:00' }, main).status, 'unmatched')
  assert.equal(reconcileIgdConsultation({ medicalRecordNo: '123', registeredAt: '2026-03-02T11:00:00+07:00' }, main).status, 'unmatched')
})

test('flags unsupported four-hour Door-to-Decision threshold and source status/code conflicts', () => {
  const flags = assessIgdConsultationFlags({
    registeredAt: '2026-02-28T23:45:00+07:00',
    consultationAt: '2026-03-01T00:10:00+07:00',
    sourceDurationMinutes: 99,
    derivedDurationMinutes: 25,
    doorDecisionLabel: 'Keputusan medis ≤ 4 Jam (Code 1)',
    attainment: 'Tidak',
    dpjpReasonCode: 1,
  })
  assert.ok(flags.includes('source_formula_duration_mismatch'))
  assert.ok(flags.includes('door_to_decision_threshold_mismatch'))
  assert.ok(flags.includes('attainment_reason_code_mismatch'))
  assert.ok(flags.includes('source_month_crosses_registration_month'))
})

test('keeps a blank reason code visible for manual review', () => {
  const flags = assessIgdConsultationFlags({
    registeredAt: '2026-05-20T10:00:00+07:00',
    consultationAt: '2026-05-20T11:00:00+07:00',
    derivedDurationMinutes: 60,
    attainment: 'Tidak',
    dpjpReasonCode: null,
  })
  assert.deepEqual(flags, ['missing_reason_code'])
})

test('flags an unreadable formula result instead of treating it as a valid duration', () => {
  const flags = assessIgdConsultationFlags({
    registeredAt: '2026-05-20T10:00:00+07:00',
    consultationAt: '2026-05-20T11:00:00+07:00',
    sourceDurationMinutes: '#VALUE!',
    derivedDurationMinutes: 60,
    attainment: 'Ya',
    dpjpReasonCode: 1,
  })
  assert.ok(flags.includes('source_formula_duration_unreadable'))
})
