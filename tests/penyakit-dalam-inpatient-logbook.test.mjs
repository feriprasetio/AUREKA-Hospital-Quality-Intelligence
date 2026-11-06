import assert from 'node:assert/strict'
import test from 'node:test'

import {
  INTERNAL_MEDICINE_SOURCE_INDICATORS,
  calculateInternalMedicineStayDays,
  hasInternalMedicineLogbookData,
  isInternalMedicineFormulaError,
  makeInternalMedicineSubjectKey,
  mapInternalMedicineLogbookHeaders,
  normalizeInternalMedicineDate,
  normalizeInternalMedicineOptionLabel,
  parseInternalMedicineSourceAnswer,
} from '../lib/aureka/penyakit-dalam-inpatient-logbook.ts'

const pending = (code, label) => ({
  code,
  label,
  numerator: null,
  denominator: true,
  review_required: true,
})

test('maps all 18 Rawat Inap Penyakit Dalam Logbook source columns to the 2026 profile codes', () => {
  const headers = [
    'No.', 'Nama Pasien', 'No. Rekam Medis', 'Tanggal Masuk', 'Tanggal Keluar',
    'Diagnosa Tegak', 'Kategori Pasien', 'Status Pulang', 'Lenght of Stay',
    'Perawat Penerima', 'DPJP', 'Visite Spesialis', 'Clinical Pathway',
    'Validitas Asesmen Keperawatan', 'Transfer IGD', 'Kekosongan Linen Hari Pertama',
    'Kekosongan Obat Selama Dirawat', 'Fungsi Ginjal/eGFR', 'USG Perawatan',
    'Hemodialisis ≤48 Jam', 'Klinis PGTA', 'Lab PGTA', 'Anemia', 'Komponen Darah',
    'Obat Vasoaktif', 'Koagulasi Lengkap', 'EGD + Terapi', 'HB Pulang >10',
    'Perdarahan Henti', 'Column19', 'Column20', '', 'Dx',
  ]
  const result = mapInternalMedicineLogbookHeaders(headers)
  assert.deepEqual(result.missingHeaders, [])
  assert.deepEqual(result.duplicateHeaders, [])
  assert.equal(result.indexes.sourceNo, 1)
  assert.equal(result.indexes.patientName, 2)
  assert.equal(result.indexes.medicalRecordNo, 3)
  assert.equal(result.indexes.admissionDate, 4)
  assert.equal(result.indexes.diagnosisSearchKey, 33)
  assert.deepEqual(
    INTERNAL_MEDICINE_SOURCE_INDICATORS.map(item => item.code),
    ['25.12','25.13','25.18','25.11','25.9','25.10','25.5','25.6','25.7','25.14','25.15','25.17','25.1','25.2','25.3','25.4','25.8','25.16'],
  )
  assert.equal(Object.keys(result.indexes).filter(key => key.startsWith('indicator:')).length, 18)
})

test('detects missing and duplicate mandatory headers without treating empty template fields as data', () => {
  const missing = mapInternalMedicineLogbookHeaders(['No.','Nama Pasien','No. Rekam Medis'])
  assert.ok(missing.missingHeaders.includes('Tanggal Masuk'))
  const headers = ['No.','Nama Pasien','No. Rekam Medis','Tanggal Masuk','Tanggal Keluar','Diagnosa Tegak','Kategori Pasien','Status Pulang','Lenght of Stay','Perawat Penerima','DPJP',...INTERNAL_MEDICINE_SOURCE_INDICATORS.map(x=>x.sourceHeader),'DPJP']
  const duplicate = mapInternalMedicineLogbookHeaders(headers)
  assert.ok(duplicate.duplicateHeaders.includes('DPJP'))
  assert.equal(hasInternalMedicineLogbookData({ sourceNo: '1980' }), false)
  assert.equal(hasInternalMedicineLogbookData({ patientName: 'Nama' }), true)
  assert.equal(hasInternalMedicineLogbookData({ medicalRecordNo: '000321' }), true)
  assert.equal(hasInternalMedicineLogbookData({ admissionDate: 46200 }), true)
})

test('normalizes Excel serials, native Date values, ISO, Indonesian numeric and named-month dates', () => {
  assert.equal(normalizeInternalMedicineDate(46129), '2026-04-17')
  assert.equal(normalizeInternalMedicineDate(new Date('2026-04-17T00:00:00.000Z')), '2026-04-17')
  assert.equal(normalizeInternalMedicineDate('2026-04-17'), '2026-04-17')
  assert.equal(normalizeInternalMedicineDate('17/4/2026'), '2026-04-17')
  assert.equal(normalizeInternalMedicineDate('17/04/26'), '2026-04-17')
  assert.equal(normalizeInternalMedicineDate('17 Agu 2026'), '2026-08-17')
  assert.equal(normalizeInternalMedicineDate('03-Okt-26'), '2026-10-03')
  assert.equal(normalizeInternalMedicineDate('9 September 2026'), '2026-09-09')
})

test('rejects malformed, impossible and unsupported date strings without auto-correction', () => {
  assert.equal(normalizeInternalMedicineDate('31/02/2026'), null)
  assert.equal(normalizeInternalMedicineDate('1809/2026'), null)
  assert.equal(normalizeInternalMedicineDate('not-a-date'), null)
  assert.equal(normalizeInternalMedicineDate(Number.NaN), null)
})

test('computes stay days only for valid admission and discharge pairs; open episodes remain null', () => {
  assert.equal(calculateInternalMedicineStayDays('2026-04-17', '2026-04-23'), 6)
  assert.equal(calculateInternalMedicineStayDays('2026-04-17', '2026-04-17'), 0)
  assert.equal(calculateInternalMedicineStayDays('2026-10-20', '2026-09-21'), null)
  assert.equal(calculateInternalMedicineStayDays('2026-04-17', null), null)
  assert.equal(calculateInternalMedicineStayDays('invalid', '2026-04-23'), null)
})

test('maps coded and uncoded Visite categories without inferring classification', () => {
  const options = [
    pending(1, 'Visite Hari Kerja (06.00-14.00)'),
    pending(3, 'Visite Hari Kerja (Diatas 14.00)'),
    pending(null, 'Visite Hari Libur'),
    pending(3, 'Tidak Visite'),
    pending(null, 'Divisitekan Spesialis Lain'),
  ]
  const answer = parseInternalMedicineSourceAnswer('Visite Hari Libur', options, '25.12')
  assert.equal(answer?.code, null)
  assert.equal(answer?.sourceCode, null)
  assert.equal(answer?.numerator, null)
  assert.equal(answer?.mappingStatus, 'mapped_pending_classification')
})

test('maps clinical pathway choice with no numeric suffix and leaves numerator pending', () => {
  const options = [pending(null, 'Belum Tersedia CP untuk Diagnosa Ini')]
  const answer = parseInternalMedicineSourceAnswer('Belum Tersedia CP untuk Diagnosa Ini', options, '25.13')
  assert.equal(answer?.code, null)
  assert.equal(answer?.mappingStatus, 'mapped_pending_classification')
})

test('maps Linen and Medicine source aliases to existing classified masters', () => {
  const linen = [
    { code: 1, label: 'Tidak terjadi kekosongan linen', numerator: false, denominator: true },
    { code: 3, label: 'Terjadi kekosongan linen', numerator: true, denominator: true },
    { code: null, label: 'Lainnya — tuliskan alasan/temuan', numerator: null, denominator: true, review_required: true },
  ]
  const medicine = [
    { code: 1, label: 'Tidak terjadi kekosongan obat', numerator: false, denominator: true },
    { code: 3, label: 'Terjadi kekosongan obat', numerator: true, denominator: true },
    { code: null, label: 'Lainnya — tuliskan alasan/temuan', numerator: null, denominator: true, review_required: true },
  ]
  const linenAnswer = parseInternalMedicineSourceAnswer('Adanya Kekosongan Linen (Code 3)', linen, '25.9')
  assert.equal(linenAnswer?.label, 'Terjadi kekosongan linen')
  assert.equal(linenAnswer?.numerator, true)
  assert.equal(linenAnswer?.mappingStatus, 'mapped_existing_master')
  const medicineAnswer = parseInternalMedicineSourceAnswer('Tidak Adanya Kekosongan Obat (Code 1)', medicine, '25.10')
  assert.equal(medicineAnswer?.label, 'Tidak terjadi kekosongan obat')
  assert.equal(medicineAnswer?.numerator, false)
  assert.equal(medicineAnswer?.mappingStatus, 'mapped_existing_master')
})

test('maps medicine free text and blank drug cells to code 3 and code 1 respectively', () => {
  const options = [
    {code:1,label:'Tidak terjadi kekosongan obat',numerator:false,denominator:true,review_required:false},
    {code:3,label:'Terjadi kekosongan obat',numerator:true,denominator:true,review_required:false},
  ]
  const shortage = parseInternalMedicineSourceAnswer('Ceftriaxone 1 g',options,'25.10')
  assert.equal(shortage?.code,3)
  assert.equal(shortage?.numerator,true)
  assert.equal(shortage?.denominator,true)
  assert.equal(shortage?.freeText,'Ceftriaxone 1 g')
  assert.equal(shortage?.reviewRequired,false)
  const noShortage = parseInternalMedicineSourceAnswer('',options,'25.10')
  assert.equal(noShortage?.code,1)
  assert.equal(noShortage?.numerator,false)
  assert.equal(noShortage?.freeText,'')
  assert.equal(noShortage?.reviewRequired,false)
})

test('does not silently map labels absent from Profil or conflicting numeric suffixes', () => {
  const nursing = [pending(1, 'Seluruh Data Pasien Baru Akurat')]
  const sourceCode55 = parseInternalMedicineSourceAnswer('Seluruh Data Pasien Baru Akurat (Code 55)', nursing, '25.18')
  assert.equal(sourceCode55?.mappingStatus, 'source_code_conflict')
  const wrongTransfer = parseInternalMedicineSourceAnswer('Seluruh Data Pasien Baru Akurat (Code 1)', [pending(1, 'Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan)')], '25.11')
  assert.equal(wrongTransfer?.mappingStatus, 'not_in_master')
  const unlistedEgf = parseInternalMedicineSourceAnswer('Tidak Lengkap (Sudah Lab namun Tidak dihitung eGFR) (Code 3)', [pending(3, 'Tidak Lengkap (Lupa order/Tidak dihitung eGFR)')], '25.5')
  assert.equal(unlistedEgf?.mappingStatus, 'not_in_master')
})

test('preserves source labels and normalizes only the trailing code suffix for matching', () => {
  const source = 'Visite Hari Kerja (06.00-14.00) (Code 1)'
  const answer = parseInternalMedicineSourceAnswer(source, [pending(1, 'Visite Hari Kerja (06.00-14.00)')], '25.12')
  assert.equal(normalizeInternalMedicineOptionLabel(source), 'visite hari kerja (06.00-14.00)')
  assert.equal(answer?.sourceLabel, source)
  assert.equal(answer?.mappingStatus, 'mapped_pending_classification')
})

test('creates physical Excel row idempotency keys for Rawat Inap Penyakit Dalam 2026', () => {
  assert.equal(makeInternalMedicineSubjectKey(2026, 3), 'excel-pmkp-rawat-inap-penyakit-dalam-2026:row:3')
  assert.equal(makeInternalMedicineSubjectKey(2026, 1971), 'excel-pmkp-rawat-inap-penyakit-dalam-2026:row:1971')
  assert.throws(() => makeInternalMedicineSubjectKey(2025, 3))
  assert.throws(() => makeInternalMedicineSubjectKey(2026, 2))
})

test('recognizes workbook formula errors', () => {
  assert.equal(isInternalMedicineFormulaError('#REF!'), true)
  assert.equal(isInternalMedicineFormulaError('#DIV/0!'), true)
  assert.equal(isInternalMedicineFormulaError('6'), false)
})
