import assert from 'node:assert/strict'
import test from 'node:test'

import {
  ISOLASI_SOURCE_INDICATORS,
  calculateIsolasiStayDays,
  hasIsolasiLogbookData,
  isIsolasiFormulaError,
  makeIsolasiSubjectKey,
  mapIsolasiLogbookHeaders,
  normalizeIsolasiDate,
  normalizeIsolasiOptionLabel,
  parseIsolasiSourceAnswer,
} from '../lib/aureka/isolasi-inpatient-logbook.ts'

const classified = (code, label, numerator) => ({
  code, label, numerator, denominator: true,
})

test('maps all nine Rawat Inap Isolasi indicators to actual Logbook headers', () => {
  const headers = [
    'No.', 'Nama Pasien', 'No. Rekam Medis', 'Tanggal Masuk', 'Tanggal Keluar',
    'Diagnosa Tegak', 'Kategori Pasien', 'Status Pulang', 'Lenght of Stay',
    'Perawat Penerima', 'DPJP', 'Visite Spesialis',
    'Validitas Asesmen Keperawatan', 'Oksigen Transfer IGD',
    'Kekosongan Linen', 'Kekosongan Obat', 'Terapi OAT',
    'Sputum/TCM', 'SITB Pencatatan', 'Gejala TB Hilang',
  ]
  const result = mapIsolasiLogbookHeaders(headers)
  assert.deepEqual(result.missingHeaders, [])
  assert.deepEqual(result.duplicateHeaders, [])
  assert.equal(result.indexes.sourceNo, 1)
  assert.equal(result.indexes.patientName, 2)
  assert.equal(result.indexes.medicalRecordNo, 3)
  assert.equal(result.indexes.admissionDate, 4)
  assert.equal(result.indexes.dischargeDate, 5)
  assert.equal(result.indexes.diagnosis, 6)
  assert.equal(result.indexes.receivingNurse, 10)
  assert.equal(result.indexes.dpjp, 11)
  assert.deepEqual(
    ISOLASI_SOURCE_INDICATORS.map(item => [item.code, result.indexes['indicator:' + item.code]]),
    [
      ['24.8', 12], ['24.10', 13], ['24.9', 14], ['24.6', 16],
      ['24.5', 15], ['24.1', 17], ['24.2', 18], ['24.3', 19], ['24.4', 20],
    ],
  )
})

test('detects absent required headers and duplicate source columns', () => {
  const headers = [
    'No.', 'Nama Pasien', 'No. Rekam Medis', 'Tanggal Masuk', 'Tanggal Keluar',
    'Diagnosa Tegak', 'Visite Spesialis', 'Validitas Asesmen Keperawatan',
    'Oksigen Transfer IGD', 'Kekosongan Obat', 'Kekosongan Linen',
    'Terapi OAT', 'Sputum/TCM', 'SITB Pencatatan',
  ]
  const missing = mapIsolasiLogbookHeaders(headers)
  assert.deepEqual(missing.missingHeaders, ['Gejala TB Hilang'])
  const duplicate = mapIsolasiLogbookHeaders([...headers, 'Gejala TB Hilang', 'No. Rekam Medis'])
  assert.deepEqual(duplicate.missingHeaders, [])
  assert.deepEqual(duplicate.duplicateHeaders, ['No. Rekam Medis'])
})

test('allows optional operational fields to remain blank or absent', () => {
  const result = mapIsolasiLogbookHeaders([
    'No.', 'Nama Pasien', 'No. Rekam Medis', 'Tanggal Masuk', 'Tanggal Keluar',
    'Diagnosa Tegak', 'Visite Spesialis', 'Validitas Asesmen Keperawatan',
    'Oksigen Transfer IGD', 'Kekosongan Obat', 'Kekosongan Linen',
    'Terapi OAT', 'Sputum/TCM', 'SITB Pencatatan', 'Gejala TB Hilang',
  ])
  assert.deepEqual(result.missingHeaders, [])
  assert.equal(result.indexes.patientCategory, undefined)
  assert.equal(result.indexes.dischargeStatus, undefined)
  assert.equal(result.indexes.receivingNurse, undefined)
  assert.equal(result.indexes.dpjp, undefined)
})

test('ignores formatted rows without patient episode evidence', () => {
  assert.equal(hasIsolasiLogbookData({ sourceNo: '125' }), false)
  assert.equal(hasIsolasiLogbookData({ patientName: 'Pasien' }), true)
  assert.equal(hasIsolasiLogbookData({ medicalRecordNo: '12345' }), true)
  assert.equal(hasIsolasiLogbookData({ admissionDate: '46082' }), true)
})

test('normalizes Excel serials, native Date, ISO and Indonesian dates', () => {
  assert.equal(normalizeIsolasiDate(46055), '2026-02-02')
  assert.equal(normalizeIsolasiDate(new Date('2026-02-02T00:00:00.000Z')), '2026-02-02')
  assert.equal(normalizeIsolasiDate('2026-10-29'), '2026-10-29')
  assert.equal(normalizeIsolasiDate('2/2/2026'), '2026-02-02')
  assert.equal(normalizeIsolasiDate('02-02-26'), '2026-02-02')
})

test('rejects impossible and malformed admission/discharge dates', () => {
  assert.equal(normalizeIsolasiDate('31/02/2026'), null)
  assert.equal(normalizeIsolasiDate('2026-13-01'), null)
  assert.equal(normalizeIsolasiDate('15/7/20260'), null)
  assert.equal(normalizeIsolasiDate('not-a-date'), null)
  assert.equal(normalizeIsolasiDate(Number.NaN), null)
})

test('calculates LOS only for valid closed episodes and leaves open episodes null', () => {
  assert.equal(calculateIsolasiStayDays('2026-02-02', '2026-02-05'), 3)
  assert.equal(calculateIsolasiStayDays('2026-02-02', '2026-02-02'), 0)
  assert.equal(calculateIsolasiStayDays('2026-02-02', null), null)
  assert.equal(calculateIsolasiStayDays('2026-02-05', '2026-02-02'), null)
  assert.equal(calculateIsolasiStayDays('invalid', '2026-02-02'), null)
})

test('keeps seven indicators with no published option set as not-in-master and preserves source codes', () => {
  for (const code of ['24.1', '24.2', '24.3', '24.4', '24.8', '24.9', '24.10']) {
    const answer = parseIsolasiSourceAnswer('Pilihan sumber tertentu (Code 2)', [], code)
    assert.equal(answer?.mappingStatus, 'not_in_master')
    assert.equal(answer?.code, null)
    assert.equal(answer?.numerator, null)
    assert.equal(answer?.denominator, true)
    assert.equal(answer?.sourceCode, 2)
    assert.equal(answer?.sourceLabel, 'Pilihan sumber tertentu (Code 2)')
    assert.equal(answer?.reviewRequired, true)
  }
})

test('maps explicit Linen source wording to existing 24.5 master without changing its classification', () => {
  const options = [
    classified(1, 'Tidak terjadi kekosongan linen', false),
    classified(3, 'Terjadi kekosongan linen', true),
    { code: null, label: 'Lainnya — tuliskan alasan/temuan', numerator: null, denominator: true, review_required: true },
  ]
  const positive = parseIsolasiSourceAnswer('Adanya Kekosongan Linen (Code 3)', options, '24.5')
  assert.equal(positive?.label, 'Terjadi kekosongan linen')
  assert.equal(positive?.code, 3)
  assert.equal(positive?.numerator, true)
  assert.equal(positive?.mappingStatus, 'mapped_existing_master')
  const negative = parseIsolasiSourceAnswer('Tidak Terjadi Kekosongan Linen (Code 1)', options, '24.5')
  assert.equal(negative?.label, 'Tidak terjadi kekosongan linen')
  assert.equal(negative?.numerator, false)
  assert.equal(negative?.mappingStatus, 'mapped_existing_master')
})

test('maps explicit Medicine source wording to existing 24.6 master without changing its classification', () => {
  const options = [
    classified(1, 'Tidak terjadi kekosongan obat', false),
    classified(3, 'Terjadi kekosongan obat', true),
    { code: null, label: 'Lainnya — tuliskan alasan/temuan', numerator: null, denominator: true, review_required: true },
  ]
  const positive = parseIsolasiSourceAnswer('Adanya Kekosongan Obat (Code 3)', options, '24.6')
  assert.equal(positive?.label, 'Terjadi kekosongan obat')
  assert.equal(positive?.code, 3)
  assert.equal(positive?.numerator, true)
  assert.equal(positive?.mappingStatus, 'mapped_existing_master')
  const negative = parseIsolasiSourceAnswer('Tidak Adanya Kekosongan Obat (Code 1)', options, '24.6')
  assert.equal(negative?.label, 'Tidak terjadi kekosongan obat')
  assert.equal(negative?.numerator, false)
})

test('flags source-code mismatch and ambiguous published labels without choosing a category', () => {
  const options = [classified(1, 'Tidak terjadi kekosongan obat', false), classified(3, 'Terjadi kekosongan obat', true)]
  const conflict = parseIsolasiSourceAnswer('Adanya Kekosongan Obat (Code 1)', options, '24.6')
  assert.equal(conflict?.mappingStatus, 'source_code_conflict')
  assert.equal(conflict?.code, null)
  assert.equal(conflict?.numerator, null)
  const ambiguous = parseIsolasiSourceAnswer(
    'Tidak terjadi kekosongan obat (Code 1)',
    [...options, classified(1, 'Tidak terjadi kekosongan obat', false)],
    '24.6',
  )
  assert.equal(ambiguous?.mappingStatus, 'ambiguous_master')
  assert.equal(ambiguous?.code, null)
})

test('normalizes labels without discarding the original source wording', () => {
  const source = 'Adanya Kekosongan Linen (Code 3)'
  assert.equal(normalizeIsolasiOptionLabel(source), 'adanya kekosongan linen')
  const answer = parseIsolasiSourceAnswer(source, [
    classified(3, 'Terjadi kekosongan linen', true),
  ], '24.5')
  assert.equal(answer?.sourceLabel, source)
})

test('creates idempotency keys from physical Excel rows', () => {
  assert.equal(makeIsolasiSubjectKey(2026, 3), 'excel-pmkp-rawat-inap-isolasi-2026:row:3')
  assert.equal(makeIsolasiSubjectKey(2026, 264), 'excel-pmkp-rawat-inap-isolasi-2026:row:264')
  assert.throws(() => makeIsolasiSubjectKey(2025, 3))
  assert.throws(() => makeIsolasiSubjectKey(2026, 2))
})

test('recognizes formula errors without treating ordinary formula values as errors', () => {
  assert.equal(isIsolasiFormulaError('#REF!'), true)
  assert.equal(isIsolasiFormulaError('#DIV/0!'), true)
  assert.equal(isIsolasiFormulaError('#N/A'), true)
  assert.equal(isIsolasiFormulaError('0'), false)
})
