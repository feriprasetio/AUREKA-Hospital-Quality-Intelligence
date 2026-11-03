import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SURGICAL_SOURCE_INDICATORS,
  calculateSurgicalStayDays,
  hasSurgicalLogbookData,
  isSurgicalFormulaError,
  makeSurgicalSubjectKey,
  mapSurgicalLogbookHeaders,
  normalizeSurgicalDate,
  normalizeSurgicalOptionLabel,
  parseSurgicalSourceAnswer,
} from '../lib/aureka/surgical-inpatient-logbook.ts'

const pending = (code, label) => ({
  code,
  label,
  numerator: null,
  denominator: true,
  review_required: true,
})

test('maps Rawat Inap Bedah Logbook headers, including generic Column1 MRN and Dx helper', () => {
  const headers = [
    'No.', 'Nama Pasien', 'Column1', 'Tanggal Masuk', 'Tanggal Keluar',
    'Diagnosa Tegak', 'Kategori Pasien', 'Status Pulang', 'Lenght of Stay',
    'Perawat Penerima', 'DPJP', 'Visite Spesialis',
    'Validitas Asesmen Keperawatan', 'Transfer IGD', 'Batal Operasi',
    'Nyeri Terkontrol', 'Kekosongan Linen', 'Kekosongan Obat',
    'Column8', 'Column9', 'Column10', 'Column11', 'Column12',
    'Column13', 'Column14', 'Column15', 'Column16', 'Column17',
    'Column18', 'Column19', 'Column20', 'Dx',
  ]
  const result = mapSurgicalLogbookHeaders(headers)
  assert.deepEqual(result.missingHeaders, [])
  assert.deepEqual(result.duplicateHeaders, [])
  assert.equal(result.indexes.sourceNo, 1)
  assert.equal(result.indexes.patientName, 2)
  assert.equal(result.indexes.medicalRecordNo, 3)
  assert.equal(result.indexes.admissionDate, 4)
  assert.equal(result.indexes.receivingNurse, 10)
  assert.equal(result.indexes.dpjp, 11)
  assert.equal(result.indexes.diagnosisSearchKey, 33)
  assert.deepEqual(
    SURGICAL_SOURCE_INDICATORS.map(item => [item.code, result.indexes['indicator:' + item.code]]),
    [['23.5', 12], ['23.7', 13], ['23.4', 14], ['23.1', 15], ['23.6', 16], ['23.2', 17], ['23.3', 18]],
  )
})

test('detects missing and duplicate Rawat Inap Bedah headers', () => {
  const headers = [
    'No.', 'Nama Pasien', 'Column1', 'Tanggal Masuk', 'Tanggal Keluar',
    'Diagnosa Tegak', 'Kategori Pasien', 'Status Pulang', 'Lenght of Stay',
    'Perawat Penerima', 'DPJP', 'Visite Spesialis',
    'Validitas Asesmen Keperawatan', 'Transfer IGD', 'Batal Operasi',
    'Nyeri Terkontrol', 'Kekosongan Linen', 'Kekosongan Obat',
    'Column8', 'Column9', 'Column10', 'Column11', 'Column12',
    'Column13', 'Column14', 'Column15', 'Column16', 'Column17',
    'Column18', 'Column19', 'Column20',
  ]
  const missing = mapSurgicalLogbookHeaders(headers)
  assert.deepEqual(missing.missingHeaders, ['Dx'])
  const duplicate = mapSurgicalLogbookHeaders([...headers, 'Dx', 'DPJP'])
  assert.deepEqual(duplicate.missingHeaders, [])
  assert.deepEqual(duplicate.duplicateHeaders, ['DPJP'])
})

test('ignores preformatted template rows without patient identity', () => {
  assert.equal(hasSurgicalLogbookData({ sourceNo: '933' }), false)
  assert.equal(hasSurgicalLogbookData({ patientName: 'Pasien' }), true)
  assert.equal(hasSurgicalLogbookData({ medicalRecordNo: '051919' }), true)
  assert.equal(hasSurgicalLogbookData({ admissionDate: 46129 }), true)
})

test('normalizes Excel serials, native Date values, ISO dates and Indonesian dates', () => {
  assert.equal(normalizeSurgicalDate(46129), '2026-04-17')
  assert.equal(normalizeSurgicalDate(46135), '2026-04-23')
  assert.equal(normalizeSurgicalDate(new Date('2026-04-17T00:00:00.000Z')), '2026-04-17')
  assert.equal(normalizeSurgicalDate('2026-04-17'), '2026-04-17')
  assert.equal(normalizeSurgicalDate('17/4/2026'), '2026-04-17')
})

test('rejects the three malformed source admission dates without inferring corrections', () => {
  assert.equal(normalizeSurgicalDate('15/7/20260'), null)
  assert.equal(normalizeSurgicalDate('13/9/206'), null)
  assert.equal(normalizeSurgicalDate('1809/2026'), null)
})

test('rejects impossible and out-of-range dates', () => {
  assert.equal(normalizeSurgicalDate('31/02/2026'), null)
  assert.equal(normalizeSurgicalDate('2026-13-01'), null)
  assert.equal(normalizeSurgicalDate('not-a-date'), null)
  assert.equal(normalizeSurgicalDate(Number.NaN), null)
})

test('computes length of stay only when discharge is on or after admission', () => {
  assert.equal(calculateSurgicalStayDays('2026-04-17', '2026-04-23'), 6)
  assert.equal(calculateSurgicalStayDays('2026-04-17', '2026-04-17'), 0)
  assert.equal(calculateSurgicalStayDays('2026-05-18', '2026-04-22'), null)
  assert.equal(calculateSurgicalStayDays('2026-04-17', '2029-09-03'), 1256)
  assert.equal(calculateSurgicalStayDays('invalid', '2026-04-23'), null)
})

test('maps coded surgical cancellation choices and keeps numerator pending', () => {
  const options = [
    pending(1, 'Operasi Terlaksana Sesuai Jadwal'),
    pending(2, 'Batal Operasi (Kondisi Pasien Memburuk/Tidak Stabil/Tensi/Gula Darah tidak terkontrol - Demi Keselamatan)'),
    pending(2, 'Batal Operasi (Pasien/Keluarga Berubah Pikiran/Menolak Tindakan)'),
    pending(3, 'Batal Operasi (Masalah Admin/Kamar Operasi Penuh/Dokter Berhalangan/Alat Rusak)'),
  ]
  const answer = parseSurgicalSourceAnswer('Batal Operasi (Pasien/Keluarga Berubah Pikiran/Menolak Tindakan) (Code 2)', options, '23.1')
  assert.equal(answer?.code, 2)
  assert.equal(answer?.numerator, null)
  assert.equal(answer?.mappingStatus, 'mapped_pending_classification')
  assert.equal(answer?.reviewRequired, true)
})

test('maps uncoded Visite source categories without inventing a numeric code', () => {
  const options = [
    pending(1, 'Visite Hari Kerja (06.00-14.00)'),
    pending(3, 'Visite Hari Kerja (Diatas 14.00)'),
    pending(null, 'Visite Hari Libur'),
    pending(3, 'Tidak Visite'),
    pending(null, 'Divisitekan Spesialis Lain'),
  ]
  const answer = parseSurgicalSourceAnswer('Divisitekan Spesialis Lain', options, '23.5')
  assert.equal(answer?.code, null)
  assert.equal(answer?.sourceCode, null)
  assert.equal(answer?.mappingStatus, 'mapped_pending_classification')
})

test('maps the source Linen wording to the existing classified 23.2 master without changing its numerator', () => {
  const options = [
    { code: 1, label: 'Tidak terjadi kekosongan linen', numerator: false, denominator: true },
    { code: 3, label: 'Terjadi kekosongan linen', numerator: true, denominator: true },
    { code: null, label: 'Lainnya — tuliskan alasan/temuan', numerator: null, denominator: true, review_required: true },
  ]
  const positive = parseSurgicalSourceAnswer('Adanya Kekosongan Linen (Code 3)', options, '23.2')
  assert.equal(positive?.label, 'Terjadi kekosongan linen')
  assert.equal(positive?.code, 3)
  assert.equal(positive?.numerator, true)
  assert.equal(positive?.mappingStatus, 'mapped_existing_master')
  const negative = parseSurgicalSourceAnswer('Tidak Terjadi Kekosongan Linen (Code 1)', options, '23.2')
  assert.equal(negative?.label, 'Tidak terjadi kekosongan linen')
  assert.equal(negative?.numerator, false)
  assert.equal(negative?.mappingStatus, 'mapped_existing_master')
})

test('maps the source Medicine wording to the existing classified 23.3 master without changing its numerator', () => {
  const options = [
    { code: 1, label: 'Tidak terjadi kekosongan obat', numerator: false, denominator: true },
    { code: 3, label: 'Terjadi kekosongan obat', numerator: true, denominator: true },
    { code: null, label: 'Lainnya — tuliskan alasan/temuan', numerator: null, denominator: true, review_required: true },
  ]
  const answer = parseSurgicalSourceAnswer('Adanya Kekosongan Obat (Code 3)', options, '23.3')
  assert.equal(answer?.label, 'Terjadi kekosongan obat')
  assert.equal(answer?.numerator, true)
  assert.equal(answer?.mappingStatus, 'mapped_existing_master')
})

test('does not guess when source label is unknown or source code conflicts', () => {
  const options = [pending(1, 'Pilihan A'), pending(3, 'Pilihan B')]
  const unknown = parseSurgicalSourceAnswer('Label tidak dikenal (Code 1)', options, '23.1')
  assert.equal(unknown?.mappingStatus, 'not_in_master')
  const conflict = parseSurgicalSourceAnswer('Pilihan A (Code 3)', options, '23.1')
  assert.equal(conflict?.mappingStatus, 'source_code_conflict')
  assert.equal(conflict?.code, null)
})

test('normalizes option labels but preserves the source label', () => {
  assert.equal(normalizeSurgicalOptionLabel('Adanya Kekosongan Linen (Code 3)'), 'adanya kekosongan linen')
  const source = 'Visite Hari Kerja (06.00-14.00) (Code 1)'
  const answer = parseSurgicalSourceAnswer(source, [pending(1, 'Visite Hari Kerja (06.00-14.00)')], '23.5')
  assert.equal(answer?.sourceLabel, source)
})

test('creates physical Excel row idempotency keys for Rawat Inap Bedah 2026', () => {
  assert.equal(makeSurgicalSubjectKey(2026, 3), 'excel-pmkp-rawat-inap-bedah-2026:row:3')
  assert.equal(makeSurgicalSubjectKey(2026, 934), 'excel-pmkp-rawat-inap-bedah-2026:row:934')
  assert.throws(() => makeSurgicalSubjectKey(2025, 3))
  assert.throws(() => makeSurgicalSubjectKey(2026, 2))
})

test('recognizes workbook formula errors', () => {
  assert.equal(isSurgicalFormulaError('#VALUE!'), true)
  assert.equal(isSurgicalFormulaError('#DIV/0!'), true)
  assert.equal(isSurgicalFormulaError('6'), false)
})
