import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PONEK_SOURCE_INDICATORS,
  hasPonekLogbookData,
  isPonekFormulaError,
  makePonekSubjectKey,
  mapPonekLogbookHeaders,
  normalizePonekDate,
  normalizePonekOptionLabel,
  parsePonekSourceAnswer,
} from '../lib/aureka/ponek-logbook.ts'

const pending = (code, label) => ({
  code,
  label,
  numerator: null,
  denominator: true,
  review_required: true,
})

test('maps the actual PONEK Logbook headers to four active indicators', () => {
  const headers = [
    'No.', 'Nama Pasien', 'No. Rekam Medis', 'Tanggal Masuk',
    'Kategori Pasien', 'Diagnosa', 'Asal Kedatangan', 'Kondisi Masuk',
    'Petugas', 'Ruptur Perineum', 'Komunikasi Pra-Kedatangan', 'Stabilisasi Pra-Merujuk',
    'Column27', 'Column28',
  ]
  const result = mapPonekLogbookHeaders(headers)
  assert.deepEqual(result.missingHeaders, [])
  assert.deepEqual(result.duplicateHeaders, [])
  assert.equal(result.indexes.patientName, 2)
  assert.equal(result.indexes.admissionDate, 4)
  assert.equal(result.indexes.arrivalOrigin, 7)
  assert.deepEqual(
    PONEK_SOURCE_INDICATORS.map(item => [item.code, result.indexes['indicator:' + item.code]]),
    [['33.1', 9], ['33.2', 10], ['33.3', 11], ['33.4', 12]],
  )
})

test('detects missing or duplicate PONEK headers without accepting placeholder columns', () => {
  const headers = [
    'No.', 'Nama Pasien', 'No. Rekam Medis', 'Tanggal Masuk',
    'Kategori Pasien', 'Diagnosa', 'Asal Kedatangan', 'Kondisi Masuk',
    'Petugas', 'Ruptur Perineum', 'Komunikasi Pra-Kedatangan',
  ]
  const missing = mapPonekLogbookHeaders(headers)
  assert.deepEqual(missing.missingHeaders, ['Stabilisasi Pra-Merujuk'])

  const duplicate = mapPonekLogbookHeaders([...headers, 'Petugas', 'Stabilisasi Pra-Merujuk'])
  assert.deepEqual(duplicate.missingHeaders, [])
  assert.deepEqual(duplicate.duplicateHeaders, ['Petugas'])
})

test('ignores formula-filled sequence-only rows but recognizes an episode with missing date', () => {
  assert.equal(hasPonekLogbookData({ sourceNo: '215' }), false)
  assert.equal(hasPonekLogbookData({ sourceNo: '215', patientName: 'Nama' }), true)
  assert.equal(hasPonekLogbookData({ 'indicator:33.1': 'Tim Lengkap' }), false)
  assert.equal(hasPonekLogbookData({ sourceNo: '216', 'indicator:33.1': 'Tim Lengkap' }), true)
  assert.equal(hasPonekLogbookData({ diagnosis: 'Diagnosis', 'indicator:33.1': 'Tim Lengkap' }), true)
})

test('normalizes Excel serial, native Date, ISO, Indonesian numeric and two-digit-year dates', () => {
  assert.equal(normalizePonekDate(46023), '2026-01-01')
  assert.equal(normalizePonekDate(new Date('2026-01-01T00:00:00.000Z')), '2026-01-01')
  assert.equal(normalizePonekDate('2026-09-30'), '2026-09-30')
  assert.equal(normalizePonekDate('30/09/2026'), '2026-09-30')
  assert.equal(normalizePonekDate('9/3/26'), '2026-03-09')
})

test('normalizes month names and non-breaking spaces', () => {
  assert.equal(normalizePonekDate('\u00a001 Jan 2026\u00a0'), '2026-01-01')
  assert.equal(normalizePonekDate('30 September 2026'), '2026-09-30')
})

test('rejects impossible or ambiguous dates', () => {
  assert.equal(normalizePonekDate('31/02/2026'), null)
  assert.equal(normalizePonekDate('2026-13-01'), null)
  assert.equal(normalizePonekDate('not-a-date'), null)
  assert.equal(normalizePonekDate(Number.NaN), null)
})

test('maps the source Petugas choice to indicator 33.1 without treating it as a staff attribution', () => {
  const options = [
    pending(1, 'Tim Lengkap & Efektif (Formasi tim lengkap sesuai standar RS (minimal 4 peran utama: Leader, Airway, Circulation, Dokumentasi/Runner) + komunikasi Closed-Loop berjalan baik)'),
    pending(2, 'Tim Merangkap Peran (Dapat Dimaklumi) (Tim berjumlah 3 orang karena keterbatasan SDM pada shift malam/libur, namun tindakan tetap terkoordinasi dan lancar)'),
  ]
  const source = options[0].label + ' (Code 1)'
  const answer = parsePonekSourceAnswer(source, options)
  assert.equal(answer?.label, options[0].label)
  assert.equal(answer?.code, 1)
  assert.equal(answer?.sourceCode, 1)
  assert.equal(answer?.sourceLabel, source)
  assert.equal(answer?.mappingStatus, 'mapped_pending_classification')
  assert.equal(answer?.reviewRequired, true)
})

test('maps the three remaining PONEK indicator headers to their source choices', () => {
  const cases = [
    ['33.2', 'Aman (Perineum Utuh atau hanya Ruptur Derajat I - II) (Code 1)', [
      pending(1, 'Aman (Perineum Utuh atau hanya Ruptur Derajat I - II)'),
    ]],
    ['33.3', 'Sesuai (Data Klinis Lengkap & Diotorisasi via SISRUTE Sebelum Pasien Tiba) (Code 1)', [
      pending(1, 'Sesuai (Data Klinis Lengkap & Diotorisasi via SISRUTE Sebelum Pasien Tiba)'),
    ]],
    ['33.4', 'Stabil (Airway Paten, Perdarahan Terkontrol, Akses Cairan IV Lancar, TTV dalam Toleransi) (Code 1)', [
      pending(1, 'Stabil (Airway Paten, Perdarahan Terkontrol, Akses Cairan IV Lancar, TTV dalam Toleransi)'),
    ]],
  ]
  for (const [code, source, options] of cases) {
    const answer = parsePonekSourceAnswer(source, options)
    assert.equal(answer?.mappingStatus, 'mapped_pending_classification', code)
    assert.equal(answer?.code, 1, code)
    assert.equal(answer?.sourceLabel, source, code)
  }
})

test('supports exact labels without Code suffix and keeps them pending', () => {
  const answer = parsePonekSourceAnswer('Ruptur Derajat III/IV (Faktor Ibu)', [
    pending(2, 'Ruptur Derajat III/IV (Faktor Ibu)'),
  ])
  assert.equal(answer?.sourceCode, null)
  assert.equal(answer?.code, 2)
  assert.equal(answer?.mappingStatus, 'mapped_pending_classification')
})

test('flags conflicting and unknown source choices without guessing', () => {
  const options = [pending(1, 'Pilihan A'), pending(3, 'Pilihan B')]
  const conflict = parsePonekSourceAnswer('Pilihan A (Code 3)', options)
  assert.equal(conflict?.code, null)
  assert.equal(conflict?.sourceCode, 3)
  assert.equal(conflict?.mappingStatus, 'source_code_conflict')

  const unknown = parsePonekSourceAnswer('Pilihan yang tidak ada (Code 2)', options)
  assert.equal(unknown?.mappingStatus, 'not_in_master')
  assert.equal(parsePonekSourceAnswer('', options), null)
})

test('flags duplicate master labels as ambiguous', () => {
  const answer = parsePonekSourceAnswer('Pilihan A (Code 1)', [
    pending(1, 'Pilihan A'),
    pending(1, 'Pilihan A'),
  ])
  assert.equal(answer?.mappingStatus, 'ambiguous_master')
  assert.equal(answer?.code, null)
})

test('normalizes option labels but preserves the full source string', () => {
  assert.equal(normalizePonekOptionLabel('Tim Lengkap  (Code 1)'), 'tim lengkap')
  const source = 'Tim Lengkap (Code 1)'
  const answer = parsePonekSourceAnswer(source, [pending(1, 'Tim Lengkap')])
  assert.equal(answer?.sourceLabel, source)
})

test('uses the physical Excel row for idempotency, not the visible sequence value', () => {
  assert.equal(makePonekSubjectKey(2026, 3), 'excel-pmkp-ponek-2026:row:3')
  assert.equal(makePonekSubjectKey(2026, 217), 'excel-pmkp-ponek-2026:row:217')
  assert.throws(() => makePonekSubjectKey(2025, 3))
  assert.throws(() => makePonekSubjectKey(2026, 2))
  assert.equal(makePonekSubjectKey(2027, 5), 'excel-pmkp-ponek-2027:row:5')
})

test('recognizes formula errors without misclassifying ordinary source labels', () => {
  assert.equal(isPonekFormulaError('#REF!'), true)
  assert.equal(isPonekFormulaError('#VALUE!'), true)
  assert.equal(isPonekFormulaError('Tim Lengkap'), false)
})
