import assert from 'node:assert/strict'
import test from 'node:test'

import {
  NIFAS_SOURCE_INDICATORS,
  calculateNifasStayDays,
  hasNifasLogbookData,
  isNifasFormulaError,
  makeNifasSubjectKey,
  mapNifasLogbookHeaders,
  normalizeNifasDate,
  normalizeNifasOptionLabel,
  parseNifasSourceAnswer,
} from '../lib/aureka/nifas-logbook.ts'

test('maps the actual Nifas Logbook header row to nine active indicators and one preserved combined source', () => {
  const headers = [
    'No.', 'Nama Pasien', 'No. Rekam Medis', 'Tanggal Masuk', 'Tanggal Keluar',
    'Diagnosa Tegak', 'Kategori Pasien', 'Status Pulang', 'Lenght of Stay',
    'Bidan Penerima', 'DPJP', 'Visite Spesialis', 'Validitas Asesmen Kebidanan',
    'Transfer IGD', 'Kekosongan BHP/Linen', 'Antibiotik Profilaksis', 'IMD',
    'Anestesi Regional', 'Hemostasis', 'Indikasi SC POGI', 'LOS Post SC <3',
    'Column11', 'Column12',
  ]
  const mapped = mapNifasLogbookHeaders(headers)

  assert.deepEqual(mapped.missingHeaders, [])
  assert.deepEqual(mapped.duplicateHeaders, [])
  assert.equal(mapped.indexes.sourceNo, 1)
  assert.equal(mapped.indexes.admissionDate, 4)
  assert.equal(mapped.indexes.receivingBidan, 10)
  assert.equal(mapped.indexes.unmappedBhpLinen, 15)
  assert.deepEqual(
    NIFAS_SOURCE_INDICATORS.map(item => [item.code, mapped.indexes['indicator:' + item.code]]),
    [['19.8', 12], ['19.9', 13], ['19.7', 14], ['19.1', 16], ['19.2', 17], ['19.3', 18], ['19.4', 19], ['19.5', 20], ['19.10', 21]],
  )
})

test('reports missing and duplicated headers precisely', () => {
  const headers = [
    'No.', 'Nama Pasien', 'No. Rekam Medis', 'Tanggal Masuk', 'Tanggal Keluar',
    'Diagnosa Tegak', 'Kategori Pasien', 'Status Pulang', 'Lenght of Stay',
    'Bidan Penerima', 'DPJP', 'Visite Spesialis', 'Validitas Asesmen Kebidanan',
    'Transfer IGD', 'Kekosongan BHP/Linen', 'Antibiotik Profilaksis', 'IMD',
    'Anestesi Regional', 'Hemostasis', 'Indikasi SC POGI',
  ]
  const incomplete = mapNifasLogbookHeaders(headers)
  assert.ok(incomplete.missingHeaders.includes('LOS Post SC <3'))

  const duplicate = mapNifasLogbookHeaders([...headers, 'DPJP', 'LOS Post SC <3'])
  assert.ok(duplicate.duplicateHeaders.includes('DPJP'))
  assert.deepEqual(duplicate.missingHeaders, [])
})

test('ignores formula-filled blank rows but recognizes partial episode rows', () => {
  assert.equal(hasNifasLogbookData({ sourceNo: '438', sourceLos: '#VALUE!' }), false)
  assert.equal(hasNifasLogbookData({ patientName: 'Nama', admissionDate: '46021' }), true)
  assert.equal(hasNifasLogbookData({ 'indicator:19.8': 'Visite Hari Libur' }), true)
})

test('normalizes Excel serials, native Dates, ISO, Indonesian numeric dates and two-digit years', () => {
  assert.equal(normalizeNifasDate(46021), '2025-12-30')
  assert.equal(normalizeNifasDate(new Date('2026-02-02T00:00:00.000Z')), '2026-02-02')
  assert.equal(normalizeNifasDate('2026-02-04'), '2026-02-04')
  assert.equal(normalizeNifasDate('02/02/2026'), '2026-02-02')
  assert.equal(normalizeNifasDate('21/7/26'), '2026-07-21')
})

test('normalizes non-breaking spaces and English month names', () => {
  assert.equal(normalizeNifasDate('\u00a004 Jun 2026\u00a0'), '2026-06-04')
  assert.equal(normalizeNifasDate('13/06/2026 '), '2026-06-13')
  assert.equal(normalizeNifasDate('25/07/2026'), '2026-07-25')
})

test('rejects invalid or ambiguous date values instead of coercing them', () => {
  assert.equal(normalizeNifasDate('31/02/2026'), null)
  assert.equal(normalizeNifasDate('2026-13-01'), null)
  assert.equal(normalizeNifasDate('not a date'), null)
  assert.equal(normalizeNifasDate(Number.NaN), null)
})

test('maps source options but keeps source-code classifications pending for N/D review', () => {
  const options = [
    { code: 1, label: 'Visite Hari Kerja (06.00-14.00)', numerator: null, denominator: true, review_required: true },
    { code: 3, label: 'Tidak Visite', numerator: null, denominator: true, review_required: true },
    { code: null, label: 'Visite Hari Libur', numerator: null, denominator: true, review_required: true },
  ]

  const coded = parseNifasSourceAnswer('Visite Hari Kerja (06.00-14.00) (Code 1)', options)
  assert.equal(coded?.label, 'Visite Hari Kerja (06.00-14.00)')
  assert.equal(coded?.code, 1)
  assert.equal(coded?.sourceCode, 1)
  assert.equal(coded?.mappingStatus, 'mapped_pending_classification')
  assert.equal(coded?.reviewRequired, true)

  const codeFromMaster = parseNifasSourceAnswer('Visite Hari Kerja (06.00-14.00)', options)
  assert.equal(codeFromMaster?.code, 1)
  assert.equal(codeFromMaster?.sourceCode, null)
  assert.equal(codeFromMaster?.mappingStatus, 'mapped_pending_classification')

  const noCode = parseNifasSourceAnswer('Visite Hari Libur', options)
  assert.equal(noCode?.code, null)
  assert.equal(noCode?.mappingStatus, 'mapped_pending_classification')
})

test('maps source labels from the uploaded Nifas Profil sheet for all nine active indicators', () => {
  const cases = [
    ['19.8', 'Visite Hari Kerja (06.00-14.00) (Code 1)', [
      { code: 1, label: 'Visite Hari Kerja (06.00-14.00)', numerator: null, denominator: true, review_required: true },
    ], 1],
    ['19.9', 'Seluruh Data Pasien Baru Akurat (Code 1)', [
      { code: 1, label: 'Seluruh Data Pasien Baru Akurat', numerator: null, denominator: true, review_required: true },
    ], 1],
    ['19.7', 'Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan) (Code 1)', [
      { code: 1, label: 'Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan)', numerator: null, denominator: true, review_required: true },
    ], 1],
    ['19.1', 'Diberikan Sefazolin 2 gr (30-60 menit sebelum insisi) (Code 1)', [
      { code: 1, label: 'Diberikan Sefazolin 2 gr (30-60 menit sebelum insisi)', numerator: null, denominator: true, review_required: true },
    ], 1],
    ['19.2', 'Dilakukan IMD (Ibu dan Bayi kontak kulit minimal 1 jam) (Code 1)', [
      { code: 1, label: 'Dilakukan IMD (Ibu dan Bayi kontak kulit minimal 1 jam)', numerator: null, denominator: true, review_required: true },
    ], 1],
    ['19.3', 'Dilakukan Anestesi Regional (Spinal/Epidural) (Code 1)', [
      { code: 1, label: 'Dilakukan Anestesi Regional (Spinal/Epidural)', numerator: null, denominator: true, review_required: true },
    ], 1],
    ['19.4', 'Dilakukan Pemeriksaan Hemostasis (Code 1)', [
      { code: 1, label: 'Dilakukan Pemeriksaan Hemostasis', numerator: null, denominator: true, review_required: true },
    ], 1],
    ['19.5', 'Tidak Sesuai Pedoman (Atas Permintaan Sendiri tanpa indikasi medis - Disetujui DPJP) (Code 2)', [
      { code: 2, label: 'Tidak Sesuai Pedoman (Atas Permintaan Sendiri tanpa indikasi medis - Disetujui DPJP)', numerator: null, denominator: true, review_required: true },
    ], 2],
    ['19.10', 'Lama Rawat >3 Hari (Sudah Atas Persetujuan Dokter) (Code 3)', [
      { code: 3, label: 'Lama Rawat >3 Hari (Sudah Atas Persetujuan Dokter)', numerator: null, denominator: true, review_required: true },
    ], 3],
  ] as const

  for (const [code, source, options, expectedCode] of cases) {
    const answer = parseNifasSourceAnswer(source, [...options])
    assert.equal(answer?.mappingStatus, 'mapped_pending_classification', code)
    assert.equal(answer?.code, expectedCode, code)
    assert.equal(answer?.sourceLabel, source, code)
    assert.equal(answer?.reviewRequired, true, code)
  }
})

test('flags source-code conflicts and unrecognized or ambiguous labels without guessing', () => {
  const options = [
    { code: 1, label: 'Pilihan A', numerator: null, denominator: true, review_required: true },
    { code: 2, label: 'Pilihan B', numerator: null, denominator: true, review_required: true },
  ]
  const conflict = parseNifasSourceAnswer('Pilihan A (Code 3)', options)
  assert.equal(conflict?.code, null)
  assert.equal(conflict?.sourceCode, 3)
  assert.equal(conflict?.mappingStatus, 'source_code_conflict')

  const missing = parseNifasSourceAnswer('Pilihan baru (Code 2)', options)
  assert.equal(missing?.mappingStatus, 'not_in_master')

  const ambiguous = parseNifasSourceAnswer('Pilihan A', [...options, { ...options[0] }])
  assert.equal(ambiguous?.mappingStatus, 'ambiguous_master')
  assert.equal(parseNifasSourceAnswer('', options), null)
})

test('normalizes option labels without changing the stored source label', () => {
  assert.equal(normalizeNifasOptionLabel('Lama Rawat ≤ 3 Hari (Code 1)'), 'lama rawat ≤ 3 hari')
  const answer = parseNifasSourceAnswer('Lama Rawat ≤ 3 Hari (Code 1)', [
    { code: 1, label: 'Lama Rawat ≤ 3 Hari', numerator: null, denominator: true, review_required: true },
  ])
  assert.equal(answer?.sourceLabel, 'Lama Rawat ≤ 3 Hari (Code 1)')
})

test('computes LOS from calendar dates and rejects reversed ranges', () => {
  assert.equal(calculateNifasStayDays('2025-12-30', '2026-01-02'), 3)
  assert.equal(calculateNifasStayDays('2026-07-01', '2026-07-01'), 0)
  assert.equal(calculateNifasStayDays('2026-07-02', '2026-07-01'), null)
  assert.equal(calculateNifasStayDays('invalid', '2026-07-01'), null)
  assert.equal(calculateNifasStayDays('2026-07-01', null), null)
})

test('builds physical-row idempotency keys only for Nifas 2026', () => {
  assert.equal(makeNifasSubjectKey(2026, 3), 'excel-pmkp-nifas-2026:row:3')
  assert.equal(makeNifasSubjectKey(2026, 438), 'excel-pmkp-nifas-2026:row:438')
  assert.throws(() => makeNifasSubjectKey(2025, 3))
  assert.throws(() => makeNifasSubjectKey(2026, 2))
})

test('recognizes known formula errors in source LOS cells', () => {
  assert.equal(isNifasFormulaError('#VALUE!'), true)
  assert.equal(isNifasFormulaError('#DIV/0!'), true)
  assert.equal(isNifasFormulaError('3'), false)
})
