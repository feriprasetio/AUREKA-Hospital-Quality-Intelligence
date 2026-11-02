import test from 'node:test'
import assert from 'node:assert/strict'
import {
  calculateIcuStayDays,
  isIcuFormulaError,
  makeIcuSubjectKey,
  normalizeIcuDate,
  normalizeIcuOptionLabel,
  parseIcuSourceAnswer,
} from '../lib/aureka/icu-logbook.ts'

const transferOptions = [
  { code: 1, label: 'Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan)', numerator: true, denominator: true },
  { code: 2, label: 'Tidak Lengkap (Situasi Life Saving/Cito - Transfer dipercepat demi keselamatan, admin menyusul)', numerator: false, denominator: true },
]

test('normalizes Excel serial, ISO, DMY, Date and invalid ICU dates', () => {
  assert.equal(normalizeIcuDate(46024), '2026-01-02')
  assert.equal(normalizeIcuDate('2026-10-30'), '2026-10-30')
  assert.equal(normalizeIcuDate('30/10/2026'), '2026-10-30')
  assert.equal(normalizeIcuDate(new Date(Date.UTC(2026, 9, 30))), '2026-10-30')
  assert.equal(normalizeIcuDate('31/02/2026'), null)
  assert.equal(normalizeIcuDate(''), null)
})

test('normalizes labels for exact matching without fuzzy clinical substitutions', () => {
  assert.equal(
    normalizeIcuOptionLabel('  Formulir Transfer Terisi Lengkap   (SBAR, TTV, Terapi, Tindakan) '),
    normalizeIcuOptionLabel('Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan)'),
  )
  assert.notEqual(
    normalizeIcuOptionLabel('Tidak Lengkap (Situasi Life Saving)'),
    normalizeIcuOptionLabel('Tidak Lengkap (Dokter/Perawat Lupa mengisi item penting)'),
  )
})

test('maps an exact label and code to a published master option', () => {
  assert.deepEqual(
    parseIcuSourceAnswer('Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan) (Code 1)', transferOptions),
    {
      label: 'Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan)',
      code: 1,
      sourceLabel: 'Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan) (Code 1)',
      sourceCode: 1,
      reviewRequired: false,
      mappingStatus: 'mapped',
    },
  )
})

test('maps a unique exact label when the source omits its code', () => {
  const answer = parseIcuSourceAnswer('Visite Hari Libur', [
    { code: 1, label: 'Visite Hari Libur', numerator: true, denominator: true },
  ])
  assert.equal(answer?.code, 1)
  assert.equal(answer?.reviewRequired, false)
})

test('does not force a conflicting source code into the published master', () => {
  const answer = parseIcuSourceAnswer('Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan) (Code 3)', transferOptions)
  assert.equal(answer?.code, null)
  assert.equal(answer?.sourceCode, 3)
  assert.equal(answer?.reviewRequired, true)
  assert.equal(answer?.mappingStatus, 'source_master_conflict')
})

test('keeps responses pending when a published profile has no choices', () => {
  const answer = parseIcuSourceAnswer('APD Lengkap & Sesuai Indikasi (Code 1)', [])
  assert.equal(answer?.code, null)
  assert.equal(answer?.sourceCode, 1)
  assert.equal(answer?.reviewRequired, true)
  assert.equal(answer?.mappingStatus, 'not_in_master')
})

test('keeps duplicate master labels and master options requiring review unresolved', () => {
  const ambiguous = parseIcuSourceAnswer('Visite', [
    { code: 1, label: 'Visite', numerator: true, denominator: true },
    { code: 3, label: 'Visite', numerator: false, denominator: true },
  ])
  const pending = parseIcuSourceAnswer('Temuan lain', [
    { code: null, label: 'Temuan lain', numerator: null, denominator: true, review_required: true },
  ])
  assert.equal(ambiguous?.mappingStatus, 'ambiguous_master')
  assert.equal(ambiguous?.code, null)
  assert.equal(pending?.mappingStatus, 'master_pending')
  assert.equal(pending?.reviewRequired, true)
})

test('computes source LOS as discharge minus admission and rejects reversed dates', () => {
  assert.equal(calculateIcuStayDays('2026-01-02', '2026-01-06'), 4)
  assert.equal(calculateIcuStayDays('2026-01-02', '2026-01-02'), 0)
  assert.equal(calculateIcuStayDays('2026-01-06', '2026-01-02'), null)
})

test('uses the Excel row, not the duplicated sequence number, for idempotency', () => {
  assert.equal(makeIcuSubjectKey(2026, 214), 'excel-pmkp-icu-2026:row:214')
  assert.notEqual(makeIcuSubjectKey(2026, 214), makeIcuSubjectKey(2026, 215))
  assert.throws(() => makeIcuSubjectKey(2025, 214), /Tahun profil/)
})

test('recognizes only cached Excel formula error tokens as errors', () => {
  assert.equal(isIcuFormulaError('#VALUE!'), true)
  assert.equal(isIcuFormulaError('#DIV/0!'), true)
  assert.equal(isIcuFormulaError('0'), false)
  assert.equal(isIcuFormulaError('Lainnya'), false)
})
