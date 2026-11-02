import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateNicuStayDays,
  isNicuFormulaError,
  makeNicuSubjectKey,
  normalizeNicuDate,
  normalizeNicuOptionLabel,
  parseNicuSourceAnswer,
} from '../lib/aureka/nicu-logbook.ts'

const options = [
  { code: 1, label: 'Visite Hari Kerja (06.00-14.00)', numerator: null, denominator: true, review_required: true },
  { code: 3, label: 'Visite Hari Kerja (Diatas 14.00)', numerator: null, denominator: true, review_required: true },
  { code: null, label: 'Visite Hari Libur', numerator: null, denominator: true, review_required: true },
  { code: 3, label: 'Tidak Visite', numerator: null, denominator: true, review_required: true },
  { code: null, label: 'Divisitekan Spesialis Lain', numerator: null, denominator: true, review_required: true },
]

test('normalizes Excel serial, ISO, DMY, Date and invalid NICU dates', () => {
  assert.equal(normalizeNicuDate(46023), '2026-01-01')
  assert.equal(normalizeNicuDate('2026-10-30'), '2026-10-30')
  assert.equal(normalizeNicuDate('30/10/2026'), '2026-10-30')
  assert.equal(normalizeNicuDate(new Date(Date.UTC(2026, 9, 30))), '2026-10-30')
  assert.equal(normalizeNicuDate('31/02/2026'), null)
  assert.equal(normalizeNicuDate(''), null)
})

test('normalizes labels without changing clinically meaningful content', () => {
  assert.equal(
    normalizeNicuOptionLabel(' Visite Hari Kerja (06.00-14.00) (Code 1) '),
    normalizeNicuOptionLabel('Visite Hari Kerja (06.00-14.00)'),
  )
  assert.notEqual(
    normalizeNicuOptionLabel('Terjadi (Faktor Pasien: Self-extubation)'),
    normalizeNicuOptionLabel('Terjadi (Faktor Petugas: Handling)'),
  )
})

test('maps exact source label/code but retains pending numerator-denominator classification', () => {
  const answer = parseNicuSourceAnswer('Visite Hari Kerja (Diatas 14.00) (Code 3)', options)
  assert.deepEqual(answer, {
    label: 'Visite Hari Kerja (Diatas 14.00)',
    code: 3,
    sourceLabel: 'Visite Hari Kerja (Diatas 14.00) (Code 3)',
    sourceCode: 3,
    reviewRequired: true,
    mappingStatus: 'mapped_pending_classification',
  })
})

test('supports exact options with null code when source has no code suffix', () => {
  const answer = parseNicuSourceAnswer('Visite Hari Libur', options)
  assert.equal(answer?.code, null)
  assert.equal(answer?.mappingStatus, 'mapped_pending_classification')
})

test('does not guess unknown, ambiguous or conflicting options', () => {
  const unknown = parseNicuSourceAnswer('Pilihan tidak ditemukan', options)
  const ambiguous = parseNicuSourceAnswer('Visite Hari Libur', [
    ...options,
    { code: 2, label: 'Visite Hari Libur', numerator: null, denominator: true, review_required: true },
  ])
  const conflict = parseNicuSourceAnswer('Visite Hari Kerja (06.00-14.00) (Code 3)', options)
  assert.equal(unknown?.mappingStatus, 'not_in_master')
  assert.equal(ambiguous?.mappingStatus, 'ambiguous_master')
  assert.equal(conflict?.mappingStatus, 'source_code_conflict')
  assert.equal(conflict?.code, null)
})

test('calculates LOS and preserves active episode with no discharge date', () => {
  assert.equal(calculateNicuStayDays('2026-01-01', '2026-01-04'), 3)
  assert.equal(calculateNicuStayDays('2025-12-30', '2026-01-06'), 7)
  assert.equal(calculateNicuStayDays('2026-01-01', '2026-01-01'), 0)
  assert.equal(calculateNicuStayDays('2026-01-01', null), null)
  assert.equal(calculateNicuStayDays('2026-01-04', '2026-01-01'), null)
})

test('uses physical Excel row, not display sequence or medical record number, for idempotency', () => {
  assert.equal(makeNicuSubjectKey(2026, 77), 'excel-pmkp-nicu-2026:row:77')
  assert.notEqual(makeNicuSubjectKey(2026, 77), makeNicuSubjectKey(2026, 78))
  assert.throws(() => makeNicuSubjectKey(2025, 77), /harus 2026/)
  assert.throws(() => makeNicuSubjectKey(2026, 5011), /baris Excel/)
})

test('recognizes cached formula error tokens only', () => {
  assert.equal(isNicuFormulaError('#DIV/0!'), true)
  assert.equal(isNicuFormulaError('#N/A'), true)
  assert.equal(isNicuFormulaError('0'), false)
  assert.equal(isNicuFormulaError('Tidak Ada HIE'), false)
})
