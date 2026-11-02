import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculatePerinatologyStayDays,
  isPerinatologyFormulaError,
  makePerinatologySubjectKey,
  normalizePerinatologyDate,
  normalizePerinatologyOptionLabel,
  parsePerinatologySourceAnswer,
} from '../lib/aureka/perinatology-logbook.ts'

const options = [
  { code: 1, label: 'Visite Hari Kerja (06.00-14.00)', numerator: null, denominator: true, review_required: true },
  { code: 3, label: 'Visite Hari Kerja (Diatas 14.00)', numerator: null, denominator: true, review_required: true },
  { code: null, label: 'Visite Hari Libur', numerator: null, denominator: true, review_required: true },
  { code: null, label: 'Divisitekan Spesialis Lain', numerator: null, denominator: true, review_required: true },
]

test('normalizes Excel serial, ISO, DMY, Date and invalid admission/discharge dates', () => {
  assert.equal(normalizePerinatologyDate(46023), '2026-01-01')
  assert.equal(normalizePerinatologyDate(46024), '2026-01-02')
  assert.equal(normalizePerinatologyDate('2026-10-30'), '2026-10-30')
  assert.equal(normalizePerinatologyDate('30/10/2026'), '2026-10-30')
  assert.equal(normalizePerinatologyDate(new Date(Date.UTC(2026, 9, 30))), '2026-10-30')
  assert.equal(normalizePerinatologyDate('31/02/2026'), null)
  assert.equal(normalizePerinatologyDate(''), null)
})

test('normalizes source labels while preserving clinically meaningful wording', () => {
  assert.equal(
    normalizePerinatologyOptionLabel('  Visite Hari Kerja (06.00-14.00) (Code 1) '),
    normalizePerinatologyOptionLabel('Visite Hari Kerja (06.00-14.00)'),
  )
  assert.notEqual(
    normalizePerinatologyOptionLabel('Bayi Meninggal (DOA)'),
    normalizePerinatologyOptionLabel('Bayi Hidup/Pulang Perbaikan'),
  )
})

test('maps a coded source label to an exact master option but keeps N/D classification pending', () => {
  const answer = parsePerinatologySourceAnswer('Visite Hari Kerja (06.00-14.00)', options)
  assert.deepEqual(answer, {
    label: 'Visite Hari Kerja (06.00-14.00)',
    code: 1,
    sourceLabel: 'Visite Hari Kerja (06.00-14.00)',
    sourceCode: null,
    reviewRequired: true,
    mappingStatus: 'mapped_pending_classification',
  })
})

test('preserves explicit source code without treating the code as a numerator decision', () => {
  const answer = parsePerinatologySourceAnswer('Visite Hari Kerja (Diatas 14.00) (Code 3)', options)
  assert.equal(answer?.code, 3)
  assert.equal(answer?.sourceCode, 3)
  assert.equal(answer?.reviewRequired, true)
  assert.equal(answer?.mappingStatus, 'mapped_pending_classification')
})

test('supports exact source options that have no source code', () => {
  const answer = parsePerinatologySourceAnswer('Visite Hari Libur', options)
  assert.equal(answer?.code, null)
  assert.equal(answer?.mappingStatus, 'mapped_pending_classification')
})

test('keeps unknown, ambiguous and conflicting choices pending rather than guessing', () => {
  const unknown = parsePerinatologySourceAnswer('Pilihan yang tidak ada pada master', options)
  const ambiguous = parsePerinatologySourceAnswer('Visite Hari Libur', [
    ...options,
    { code: 2, label: 'Visite Hari Libur', numerator: null, denominator: true, review_required: true },
  ])
  const conflict = parsePerinatologySourceAnswer('Visite Hari Kerja (06.00-14.00) (Code 3)', options)
  assert.equal(unknown?.mappingStatus, 'not_in_master')
  assert.equal(ambiguous?.mappingStatus, 'ambiguous_master')
  assert.equal(conflict?.mappingStatus, 'source_code_conflict')
  assert.equal(unknown?.reviewRequired, true)
  assert.equal(ambiguous?.code, null)
  assert.equal(conflict?.code, null)
})

test('calculates LOS from complete dates and retains an active episode with no discharge date', () => {
  assert.equal(calculatePerinatologyStayDays('2026-01-01', '2026-01-04'), 3)
  assert.equal(calculatePerinatologyStayDays('2026-01-01', '2026-01-01'), 0)
  assert.equal(calculatePerinatologyStayDays('2026-01-01', null), null)
  assert.equal(calculatePerinatologyStayDays('2026-01-04', '2026-01-01'), null)
})

test('uses physical Excel row for idempotency when displayed source sequence repeats', () => {
  assert.equal(makePerinatologySubjectKey(2026, 429), 'excel-pmkp-perinatologi-2026:row:429')
  assert.notEqual(makePerinatologySubjectKey(2026, 429), makePerinatologySubjectKey(2026, 430))
  assert.throws(() => makePerinatologySubjectKey(2025, 429), /harus 2026/)
})

test('recognizes cached spreadsheet formula errors without classifying ordinary text as an error', () => {
  assert.equal(isPerinatologyFormulaError('#DIV/0!'), true)
  assert.equal(isPerinatologyFormulaError('#N/A'), true)
  assert.equal(isPerinatologyFormulaError('Pulang/APD'), false)
})
