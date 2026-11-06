import assert from 'node:assert/strict'
import test from 'node:test'

import {
  SARAF_SOURCE_INDICATORS,
  calculateSarafStayDays,
  hasSarafLogbookData,
  isSarafFormulaError,
  makeSarafSubjectKey,
  mapSarafLogbookHeaders,
  normalizeSarafDate,
  normalizeSarafOptionLabel,
  parseSarafSourceAnswer,
} from '../lib/aureka/saraf-inpatient-logbook.ts'

const option = (code, label, numerator, review_required = false) => ({
  code, label, numerator, denominator: true, review_required,
})

test('maps the 16 Rawat Inap Saraf indicators to their clinical master codes, not column order', () => {
  const headers = [
    'No.', 'Nama Pasien', 'No. Rekam Medis', 'Tanggal Masuk', 'Tanggal Keluar',
    'Diagnosa Tegak', 'Kategori Pasien', 'Status Pulang', 'Lenght of Stay',
    'Perawat Penerima', 'DPJP', 'Visite Spesialis',
    'Validitas Asesmen Keperawatan', 'Transfer IGD', 'Kekosongan Linen',
    'Kekosongan Obat', '(STEMI) EKG di IGD', '(STEMI) Killip Stratifikasi2',
    '(STEMI) Door-to-Balloon ≤90 Menit', '(STEMI) Revaskularisasi',
    '(STEMI) LOS <5 Hari', '(STEMI) Survival RS', '(SNH) rTPA <4,5h',
    '(SNH) CT Scan ≤30’', '(SNH) Antiplatelet/Antikoagulan',
    '(SNH) Pulang Hidup', '(SNH) LOS <7',
  ]
  const result = mapSarafLogbookHeaders(headers)
  assert.deepEqual(result.missingHeaders, [])
  assert.deepEqual(result.duplicateHeaders, [])
  assert.equal(result.indexes.patientName, 2)
  assert.equal(result.indexes.medicalRecordNo, 3)
  assert.equal(result.indexes.admissionDate, 4)
  assert.deepEqual(
    SARAF_SOURCE_INDICATORS.map(item => [item.code, result.indexes['indicator:' + item.code]]),
    [
      ['26.7', 12], ['26.16', 13], ['26.6', 14], ['26.4', 15],
      ['26.5', 16], ['26.1', 17], ['26.2', 18], ['26.3', 19],
      ['26.15', 20], ['26.8', 21], ['26.14', 22], ['26.10', 23],
      ['26.11', 24], ['26.12', 25], ['26.13', 26], ['26.9', 27],
    ],
  )
})

test('detects missing required headers and duplicated source columns', () => {
  const result = mapSarafLogbookHeaders([
    'Nama Pasien', 'No. Rekam Medis', 'Tanggal Masuk', 'Tanggal Keluar',
    'Diagnosa Tegak', 'Visite Spesialis', 'Validitas Asesmen Keperawatan',
    'Transfer IGD', 'Kekosongan Linen', 'Kekosongan Obat',
    '(STEMI) EKG di IGD', '(STEMI) Killip Stratifikasi2',
    '(STEMI) Door-to-Balloon ≤90 Menit', '(STEMI) Revaskularisasi',
    '(STEMI) LOS <5 Hari', '(STEMI) Survival RS', '(SNH) rTPA <4,5h',
    '(SNH) CT Scan ≤30’', '(SNH) Antiplatelet/Antikoagulan',
    '(SNH) Pulang Hidup',
  ])
  assert.deepEqual(result.missingHeaders, ['(SNH) LOS <7'])
  const duplicate = mapSarafLogbookHeaders([
    'No.', 'Nama Pasien', 'No. Rekam Medis', 'Tanggal Masuk', 'Tanggal Keluar',
    'Diagnosa Tegak', 'Visite Spesialis', 'Validitas Asesmen Keperawatan',
    'Transfer IGD', 'Kekosongan Linen', 'Kekosongan Obat',
    '(STEMI) EKG di IGD', '(STEMI) Killip Stratifikasi2',
    '(STEMI) Door-to-Balloon ≤90 Menit', '(STEMI) Revaskularisasi',
    '(STEMI) LOS <5 Hari', '(STEMI) Survival RS', '(SNH) rTPA <4,5h',
    '(SNH) CT Scan ≤30’', '(SNH) Antiplatelet/Antikoagulan',
    '(SNH) Pulang Hidup', '(SNH) LOS <7', 'No. Rekam Medis',
  ])
  assert.deepEqual(duplicate.missingHeaders, [])
  assert.deepEqual(duplicate.duplicateHeaders, ['No. Rekam Medis'])
})

test('source sequence number is optional; identity and admission date determine episode presence', () => {
  assert.equal(hasSarafLogbookData({ sourceNo: '' }), false)
  assert.equal(hasSarafLogbookData({ patientName: 'Pasien' }), true)
  assert.equal(hasSarafLogbookData({ medicalRecordNo: '12345' }), true)
  assert.equal(hasSarafLogbookData({ admissionDate: 46055 }), true)
})

test('normalizes Excel serials, native Date, ISO and Indonesian dates', () => {
  assert.equal(normalizeSarafDate(46049), '2026-01-27')
  assert.equal(normalizeSarafDate(new Date('2026-01-27T00:00:00.000Z')), '2026-01-27')
  assert.equal(normalizeSarafDate('2026-10-22'), '2026-10-22')
  assert.equal(normalizeSarafDate('27/01/2026'), '2026-01-27')
  assert.equal(normalizeSarafDate('27-1-26'), '2026-01-27')
})

test('rejects impossible or malformed dates and keeps chronology check separate', () => {
  assert.equal(normalizeSarafDate('31/02/2026'), null)
  assert.equal(normalizeSarafDate('2026-13-01'), null)
  assert.equal(normalizeSarafDate('15/7/20260'), null)
  assert.equal(normalizeSarafDate('not-a-date'), null)
  assert.equal(calculateSarafStayDays('2026-11-09', '2026-09-16'), null)
})

test('calculates LOS from dates and preserves open episode nulls', () => {
  assert.equal(calculateSarafStayDays('2026-02-02', '2026-02-05'), 3)
  assert.equal(calculateSarafStayDays('2026-02-02', '2026-02-02'), 0)
  assert.equal(calculateSarafStayDays('2026-02-02', null), null)
  assert.equal(calculateSarafStayDays('2026-02-05', '2026-02-02'), null)
})

test('maps Linen and Medicine source wording to existing classified master options', () => {
  const linen = [
    option(1, 'Tidak terjadi kekosongan linen', false),
    option(3, 'Terjadi kekosongan linen', true),
    option(null, 'Lainnya — tuliskan alasan/temuan', null, true),
  ]
  const med = [
    option(1, 'Tidak terjadi kekosongan obat', false),
    option(3, 'Terjadi kekosongan obat', true),
    option(null, 'Lainnya — tuliskan alasan/temuan', null, true),
  ]
  const linenPositive = parseSarafSourceAnswer('Adanya Kekosongan Linen (Code 3)', linen, '26.4')
  const medicinePositive = parseSarafSourceAnswer('Adanya Kekosongan Obat (Code 3)', med, '26.5')
  const medicineNegative = parseSarafSourceAnswer('Tidak Adanya Kekosongan Obat (Code 1)', med, '26.5')
  assert.equal(linenPositive?.label, 'Terjadi kekosongan linen')
  assert.equal(linenPositive?.numerator, true)
  assert.equal(linenPositive?.mappingStatus, 'mapped_existing_master')
  assert.equal(medicinePositive?.label, 'Terjadi kekosongan obat')
  assert.equal(medicinePositive?.numerator, true)
  assert.equal(medicineNegative?.numerator, false)
  assert.equal(medicineNegative?.mappingStatus, 'mapped_existing_master')
})

test('maps coded and uncoded Visit responses but leaves numerator pending review', () => {
  const visit = [
    option(1, 'Visite Hari Kerja (06.00-14.00)', null, true),
    option(3, 'Visite Hari Kerja (Diatas 14.00)', null, true),
    option(null, 'Visite Hari Libur', null, true),
    option(3, 'Tidak Visite', null, true),
    option(null, 'Divisitekan Spesialis Lain', null, true),
  ]
  const coded = parseSarafSourceAnswer('Visite Hari Kerja (06.00-14.00) (Code 1)', visit, '26.7')
  const uncoded = parseSarafSourceAnswer('Divisitekan Spesialis Lain', visit, '26.7')
  assert.equal(coded?.code, 1)
  assert.equal(coded?.mappingStatus, 'mapped_pending_classification')
  assert.equal(coded?.numerator, null)
  assert.equal(uncoded?.code, null)
  assert.equal(uncoded?.mappingStatus, 'mapped_pending_classification')
})

test('keeps source values not matching 26.8 Door-to-Balloon options as not_in_master', () => {
  const doorToBalloon = [
    option(1, 'Door to Balloon ≤ 90 Menit', true),
    option(2, 'Door to Balloon > 90 Menit (Onset > 12 jam/Rescue PCI)', false),
  ]
  const answer = parseSarafSourceAnswer('Hidup/Pulang Perbaikan (Code 1)', doorToBalloon, '26.8')
  assert.equal(answer?.mappingStatus, 'not_in_master')
  assert.equal(answer?.code, null)
  assert.equal(answer?.sourceCode, 1)
  assert.equal(answer?.numerator, null)
})

test('keeps STEMI Revaskularisasi and nursing validity pending when master options are empty', () => {
  for (const code of ['26.15', '26.16']) {
    const answer = parseSarafSourceAnswer('Respons sumber (Code 3)', [], code)
    assert.equal(answer?.mappingStatus, 'not_in_master')
    assert.equal(answer?.code, null)
    assert.equal(answer?.numerator, null)
    assert.equal(answer?.sourceCode, 3)
  }
})

test('detects a conflict between the source suffix and the matched master code', () => {
  const answer = parseSarafSourceAnswer(
    'Sudah Dilakukan di IGD (Code 2)',
    [option(1, 'Sudah Dilakukan di IGD', true)],
    '26.1',
  )
  assert.equal(answer?.mappingStatus, 'source_code_conflict')
  assert.equal(answer?.code, null)
  assert.equal(answer?.numerator, null)
})

test('preserves exact source labels while normalizing option labels', () => {
  const source = 'Adanya Kekosongan Linen (Code 3)'
  assert.equal(normalizeSarafOptionLabel(source), 'adanya kekosongan linen')
  const answer = parseSarafSourceAnswer(
    source,
    [option(3, 'Terjadi kekosongan linen', true)],
    '26.4',
  )
  assert.equal(answer?.sourceLabel, source)
})

test('generates physical Excel-row idempotency keys and enforces the workbook bounds', () => {
  assert.equal(makeSarafSubjectKey(2026, 3), 'excel-pmkp-rawat-inap-saraf-2026:row:3')
  assert.equal(makeSarafSubjectKey(2026, 1315), 'excel-pmkp-rawat-inap-saraf-2026:row:1315')
  assert.equal(makeSarafSubjectKey(2026, 5102), 'excel-pmkp-rawat-inap-saraf-2026:row:5102')
  assert.throws(() => makeSarafSubjectKey(2025, 3))
  assert.throws(() => makeSarafSubjectKey(2026, 2))
  assert.throws(() => makeSarafSubjectKey(2026, 5103))
})

test('recognizes formula errors without treating normal values as errors', () => {
  assert.equal(isSarafFormulaError('#REF!'), true)
  assert.equal(isSarafFormulaError('#DIV/0!'), true)
  assert.equal(isSarafFormulaError('#N/A'), true)
  assert.equal(isSarafFormulaError('6'), false)
})
