import assert from 'node:assert/strict'
import test from 'node:test'

import {
  PEDIATRIC_SOURCE_INDICATORS,
  PEDIATRIC_SOURCE_ONLY_FIELDS,
  calculatePediatricStayDays,
  hasPediatricLogbookData,
  isPediatricFormulaError,
  makePediatricSubjectKey,
  mapPediatricLogbookHeaders,
  normalizePediatricDate,
  normalizePediatricOptionLabel,
  parsePediatricSourceAnswer,
} from '../lib/aureka/pediatric-inpatient-logbook.ts'

const pending = (code, label) => ({
  code,
  label,
  numerator: null,
  denominator: true,
  review_required: true,
})

test('maps the actual Rawat Inap Anak Logbook headers to six indicator fields and six source-only fields', () => {
  const headers = [
    'No.', 'Nama Pasien', 'No. Rekam Medis', 'Tanggal Masuk', 'Tanggal Keluar',
    'Diagnosa Tegak', 'Kategori Pasien', 'Status Pulang', 'Berat Badan', 'Tinggi Badan',
    'Tanggal Lahir', 'Umur (Rumus)', 'Lenght of Stay', 'Perawat Penerima', 'DPJP',
    'Visite Spesialis', 'Validitas Asesmen Keperawatan', 'Transfer IGD',
    'Infus Vena Perifer', 'Ketenangan Pasien', 'Kekosongan Linen', 'Kekosongan Obat',
    'Assessment Stunting Wasting2',
    'Demam 2–7H + Trombositopenia + ↑Ht',
    'DR ≥1×/Hari',
    'Kristaloid ≥500 cc/8J',
    'Tidak DSS',
  ]
  const result = mapPediatricLogbookHeaders(headers)
  assert.deepEqual(result.missingHeaders, [])
  assert.deepEqual(result.duplicateHeaders, [])
  assert.equal(result.indexes.sourceNo, 1)
  assert.equal(result.indexes.patientName, 2)
  assert.equal(result.indexes.admissionDate, 4)
  assert.equal(result.indexes.receivingNurse, 14)
  assert.equal(result.indexes.dpjp, 15)
  assert.equal(result.indexes['22.4_source_only'], 21)
  assert.equal(result.indexes['22.5_source_only'], 22)
  assert.equal(result.indexes['22.9_source_only'], 24)
  assert.equal(result.indexes['22.10_source_only'], 25)
  assert.equal(result.indexes['22.11_source_only'], 26)
  assert.equal(result.indexes['22.12_source_only'], 27)
  assert.deepEqual(
    PEDIATRIC_SOURCE_INDICATORS.map(item => [item.code, result.indexes['indicator:' + item.code]]),
    [['22.7', 16], ['22.8', 17], ['22.6', 18], ['22.3', 19], ['22.2', 20], ['22.1', 23]],
  )
  assert.equal(PEDIATRIC_SOURCE_ONLY_FIELDS.length, 6)
  assert.deepEqual(PEDIATRIC_SOURCE_ONLY_FIELDS.slice(2).map(item => item.code), ['22.9', '22.10', '22.11', '22.12'])
  assert.ok(PEDIATRIC_SOURCE_ONLY_FIELDS.slice(2).every(item => item.mappingStatus === 'clinical_definition_pending_source_only'))
})

test('allows older workbooks without optional source-only columns while requiring all formal indicators', () => {
  const headers = [
    'No.', 'Nama Pasien', 'No. Rekam Medis', 'Tanggal Masuk', 'Tanggal Keluar',
    'Diagnosa Tegak', 'Kategori Pasien', 'Status Pulang', 'Berat Badan', 'Tinggi Badan',
    'Tanggal Lahir', 'Umur (Rumus)', 'Lenght of Stay', 'Perawat Penerima', 'DPJP',
    'Visite Spesialis', 'Validitas Asesmen Keperawatan', 'Transfer IGD',
    'Infus Vena Perifer', 'Ketenangan Pasien', 'Assessment Stunting Wasting2',
  ]
  const result = mapPediatricLogbookHeaders(headers)
  assert.deepEqual(result.missingHeaders, [])
  assert.deepEqual(result.duplicateHeaders, [])
  for (const item of PEDIATRIC_SOURCE_ONLY_FIELDS) {
    assert.equal(result.indexes[item.key], undefined)
  }
})

test('reports missing and duplicated source headers precisely', () => {
  const headers = [
    'No.', 'Nama Pasien', 'No. Rekam Medis', 'Tanggal Masuk', 'Tanggal Keluar',
    'Diagnosa Tegak', 'Kategori Pasien', 'Status Pulang', 'Berat Badan', 'Tinggi Badan',
    'Tanggal Lahir', 'Umur (Rumus)', 'Lenght of Stay', 'Perawat Penerima', 'DPJP',
    'Visite Spesialis', 'Validitas Asesmen Keperawatan', 'Transfer IGD',
    'Infus Vena Perifer', 'Ketenangan Pasien', 'Kekosongan Linen', 'Kekosongan Obat',
    'Demam 2–7H + Trombositopenia + ↑Ht', 'DR ≥1×/Hari', 'Kristaloid ≥500 cc/8J', 'Tidak DSS',
  ]
  const missing = mapPediatricLogbookHeaders(headers)
  assert.deepEqual(missing.missingHeaders, ['Assessment Stunting Wasting2'])

  const duplicate = mapPediatricLogbookHeaders([...headers, 'DPJP', 'Assessment Stunting Wasting2'])
  assert.deepEqual(duplicate.missingHeaders, [])
  assert.deepEqual(duplicate.duplicateHeaders, ['DPJP'])
})

test('ignores formula-only template rows but keeps open inpatient episodes with patient identity', () => {
  assert.equal(hasPediatricLogbookData({ sourceNo: '1250' }), false)
  assert.equal(hasPediatricLogbookData({ sourceNo: '1250', patientName: 'Anak' }), true)
  assert.equal(hasPediatricLogbookData({ medicalRecordNo: '12345' }), true)
  assert.equal(hasPediatricLogbookData({ admissionDate: '46082' }), true)
})

test('normalizes Excel serials, native Dates, ISO, Indonesian D/M/Y and two-digit years', () => {
  assert.equal(normalizePediatricDate(46082), '2026-03-01')
  assert.equal(normalizePediatricDate(new Date('2026-02-01T00:00:00.000Z')), '2026-02-01')
  assert.equal(normalizePediatricDate('2026-02-01'), '2026-02-01')
  assert.equal(normalizePediatricDate('01/02/2026'), '2026-02-01')
  assert.equal(normalizePediatricDate('1/2/26'), '2026-02-01')
})

test('normalizes month names and non-breaking spaces', () => {
  assert.equal(normalizePediatricDate('\u00a001 Feb 2026\u00a0'), '2026-02-01')
  assert.equal(normalizePediatricDate('30 September 2026'), '2026-09-30')
})

test('rejects invalid and impossible dates', () => {
  assert.equal(normalizePediatricDate('31/02/2026'), null)
  assert.equal(normalizePediatricDate('2026-13-01'), null)
  assert.equal(normalizePediatricDate('not-a-date'), null)
  assert.equal(normalizePediatricDate(Number.NaN), null)
})

test('maps Visite Spesialis with and without Code suffix', () => {
  const options = [
    pending(1, 'Visite Hari Kerja (06.00-14.00)'),
    pending(3, 'Visite Hari Kerja (Diatas 14.00)'),
    pending(null, 'Visite Hari Libur'),
    pending(3, 'Tidak Visite'),
    pending(null, 'Divisitekan Spesialis Lain/Dokter Jaga Ruangan'),
    pending(null, 'Pasien APS Tidak Sempat Visite'),
  ]
  const coded = parsePediatricSourceAnswer('Visite Hari Kerja (06.00-14.00) (Code 1)', options)
  assert.equal(coded?.code, 1)
  assert.equal(coded?.mappingStatus, 'mapped_pending_classification')
  const uncoded = parsePediatricSourceAnswer('Visite Hari Libur', options)
  assert.equal(uncoded?.code, null)
  assert.equal(uncoded?.sourceCode, null)
  assert.equal(uncoded?.mappingStatus, 'mapped_pending_classification')
})

test('maps Validitas Asesmen Keperawatan options without inferring numerator', () => {
  const options = [
    pending(1, 'Seluruh Data Pasien Baru Akurat'),
    pending(3, 'Tanda Vital dan Tingkat Kesadaran Tidak Sesuai Fisik'),
    pending(3, 'Tanda Vital atau Tingkat Kesadaran Tidak Sesuai Fisik'),
    pending(3, 'Skor Risiko Jatuh Tidak Akurat'),
    pending(3, 'Skrining Nyeri Tidak Sesuai'),
    pending(3, 'Riwayat Alergi Tidak Tercatat'),
  ]
  const answer = parsePediatricSourceAnswer('Skor Risiko Jatuh Tidak Akurat (Code 3)', options)
  assert.equal(answer?.code, 3)
  assert.equal(answer?.mappingStatus, 'mapped_pending_classification')
  assert.equal(answer?.reviewRequired, true)
})

test('maps Transfer IGD and preserves a cross-indicator source label as not-in-master', () => {
  const options = [
    pending(1, 'Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan)'),
    pending(2, 'Tidak Lengkap (Situasi Life Saving/Cito - Transfer dipercepat demi keselamatan, admin menyusul)'),
    pending(2, 'Tidak Lengkap (Gangguan Sistem E-RM/Jaringan)'),
    pending(3, 'Tidak Lengkap (Dokter/Perawat Lupa mengisi item penting)'),
    pending(3, 'Tidak Ada Formulir Transfer'),
  ]
  const matched = parsePediatricSourceAnswer('Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan) (Code 1)', options)
  assert.equal(matched?.mappingStatus, 'mapped_pending_classification')
  const unmatched = parsePediatricSourceAnswer('Seluruh Data Pasien Baru Akurat (Code 1)', options)
  assert.equal(unmatched?.mappingStatus, 'not_in_master')
  assert.equal(unmatched?.sourceCode, 1)
  assert.equal(unmatched?.sourceLabel, 'Seluruh Data Pasien Baru Akurat (Code 1)')
})

test('maps peripheral infusion choices and flags cross-column labels', () => {
  const options = [
    pending(3, 'Infus Gagal Dipasang'),
    pending(1, '1 Kali Percobaan'),
    pending(1, '2 Kali Percobaan'),
    pending(3, '3 Kali Percobaan'),
    pending(3, '4 Kali Percobaan'),
    pending(3, '5 Kali Percobaan'),
    pending(3, '6 Kali Percobaan'),
    pending(null, 'Pemasangan Infus dari IGD Bertahan Sampai Pasien Pulang'),
  ]
  const answer = parsePediatricSourceAnswer('Pemasangan Infus dari IGD Bertahan Sampai Pasien Pulang', options)
  assert.equal(answer?.mappingStatus, 'mapped_pending_classification')
  assert.equal(answer?.code, null)
  const unmatched = parsePediatricSourceAnswer('Formulir Transfer Terisi Lengkap (SBAR, TTV, Terapi, Tindakan) (Code 1)', options)
  assert.equal(unmatched?.mappingStatus, 'not_in_master')
})

test('maps child calmness choices and flags the shorter source wording as not-in-master', () => {
  const options = [
    pending(1, 'Pasien Tenang/Kooperatif selama tindakan dan perawatan'),
    pending(2, 'Pasien Menangis/Gelisah Wajar (Takut/Nyeri) tapi petugas sudah melakukan upaya distraksi/pendampingan orang tua'),
    pending(2, 'Pasien Gelisah/Rewel akibat kondisi patologis (Demam tinggi/Sesak/Kejang/Nyeri hebat)'),
    pending(3, 'Pasien Menangis Histeris/Trauma akibat tindakan kasar/Petugas tidak ramah/Tanpa pendekatan yang sesuai'),
    pending(2, 'Pasien Menangis Histeris Trauma Tindakan'),
  ]
  const answer = parsePediatricSourceAnswer('Pasien Menangis/Gelisah Wajar (Takut/Nyeri) tapi petugas sudah melakukan upaya distraksi/pendampingan orang tua (Code 2)', options)
  assert.equal(answer?.mappingStatus, 'mapped_pending_classification')
  const unmapped = parsePediatricSourceAnswer('Pemasangan Infus dari IGD Bertahan Sampai Pasien Pulang', options)
  assert.equal(unmapped?.mappingStatus, 'not_in_master')
})

test('maps Stunting Wasting including the uncoded over-five-years exclusion', () => {
  const options = [
    pending(null, 'Pasien Berusia Diatas 5 Tahun Tidak Dilakukan Screening'),
    pending(1, 'Tinggi Badan dan Berat Badan Sudah Diisi'),
    pending(2, 'Hanya Tinggi Badan Diisi'),
    pending(2, 'Hanya Berat Badan Diisi'),
    pending(3, 'Tinggi Badan dan Berat Badan Tidak Terisi'),
  ]
  const uncoded = parsePediatricSourceAnswer('Pasien Berusia Diatas 5 Tahun Tidak Dilakukan Screening', options)
  assert.equal(uncoded?.code, null)
  assert.equal(uncoded?.mappingStatus, 'mapped_pending_classification')
  const coded = parsePediatricSourceAnswer('Tinggi Badan dan Berat Badan Sudah Diisi (Code 1)', options)
  assert.equal(coded?.code, 1)
})

test('classifies exact child-inpatient source answers by positive and negative direction', () => {
  const positive = [
    {code:1,label:'Tinggi Badan dan Berat Badan Sudah Diisi',numerator:true,denominator:true,review_required:false},
    {code:2,label:'Hanya Tinggi Badan Diisi',numerator:false,denominator:true,review_required:false},
    {code:3,label:'Tinggi Badan dan Berat Badan Tidak Terisi',numerator:false,denominator:true,review_required:false},
    {code:2,label:'Pasien Berusia Diatas 5 Tahun Tidak Dilakukan Screening',numerator:false,denominator:true,review_required:false},
  ]
  const complete = parsePediatricSourceAnswer('Tinggi Badan dan Berat Badan Sudah Diisi',positive,'positive')
  assert.equal(complete?.code,1)
  assert.equal(complete?.numerator,true)
  assert.equal(complete?.reviewRequired,false)
  assert.equal(complete?.mappingStatus,'mapped')

  const exception = parsePediatricSourceAnswer('Pasien Berusia Diatas 5 Tahun Tidak Dilakukan Screening',positive,'positive')
  assert.equal(exception?.code,2)
  assert.equal(exception?.numerator,false)
  assert.equal(exception?.reviewRequired,false)

  const negative = [
    {code:1,label:'Tidak terjadi kekosongan obat',numerator:false,denominator:true,review_required:false},
    {code:3,label:'Terjadi kekosongan obat',numerator:true,denominator:true,review_required:false},
  ]
  const adverse = parsePediatricSourceAnswer('Terjadi kekosongan obat',negative,'negative')
  assert.equal(adverse?.code,3)
  assert.equal(adverse?.numerator,true)
  assert.equal(adverse?.reviewRequired,false)
})

test('flags conflicting source codes and duplicate master labels without guessing', () => {
  const options = [pending(1, 'Pilihan A'), pending(2, 'Pilihan B')]
  const conflict = parsePediatricSourceAnswer('Pilihan A (Code 3)', options)
  assert.equal(conflict?.mappingStatus, 'source_code_conflict')
  assert.equal(conflict?.code, null)
  const ambiguous = parsePediatricSourceAnswer('Pilihan A (Code 1)', [...options, pending(1, 'Pilihan A')])
  assert.equal(ambiguous?.mappingStatus, 'ambiguous_master')
  assert.equal(ambiguous?.code, null)
})

test('keeps linen, free-text drug, and unsigned Dengue source fields outside formal indicator mapping', () => {
  assert.deepEqual(
    PEDIATRIC_SOURCE_ONLY_FIELDS.map(item => [item.code, item.header, item.mappingStatus]),
    [
      ['22.4', 'Kekosongan Linen', 'source_semantics_not_mapped'],
      ['22.5', 'Kekosongan Obat', 'free_text_source_not_mapped'],
      ['22.9', 'Demam 2–7H + Trombositopenia + ↑Ht', 'clinical_definition_pending_source_only'],
      ['22.10', 'DR ≥1×/Hari', 'clinical_definition_pending_source_only'],
      ['22.11', 'Kristaloid ≥500 cc/8J', 'clinical_definition_pending_source_only'],
      ['22.12', 'Tidak DSS', 'clinical_definition_pending_source_only'],
    ],
  )
})

test('normalizes option labels but preserves source labels', () => {
  assert.equal(normalizePediatricOptionLabel('Visite Hari Kerja (06.00-14.00) (Code 1)'), 'visite hari kerja (06.00-14.00)')
  const source = 'Pasien APS Tidak Sempat Visite'
  const answer = parsePediatricSourceAnswer(source, [pending(null, source)])
  assert.equal(answer?.sourceLabel, source)
})

test('computes length of stay from dates and preserves open episodes as null', () => {
  assert.equal(calculatePediatricStayDays('2026-03-01', '2026-03-06'), 5)
  assert.equal(calculatePediatricStayDays('2026-03-01', '2026-03-01'), 0)
  assert.equal(calculatePediatricStayDays('2026-03-02', '2026-03-01'), null)
  assert.equal(calculatePediatricStayDays('invalid', '2026-03-06'), null)
  assert.equal(calculatePediatricStayDays('2026-03-01', null), null)
})

test('builds physical-row idempotency keys only for Rawat Inap Anak 2026', () => {
  assert.equal(makePediatricSubjectKey(2026, 3), 'excel-pmkp-rawat-inap-anak-2026:row:3')
  assert.equal(makePediatricSubjectKey(2026, 1251), 'excel-pmkp-rawat-inap-anak-2026:row:1251')
  assert.throws(() => makePediatricSubjectKey(2025, 3))
  assert.throws(() => makePediatricSubjectKey(2026, 2))
})

test('recognizes known formula errors only', () => {
  assert.equal(isPediatricFormulaError('#VALUE!'), true)
  assert.equal(isPediatricFormulaError('#REF!'), true)
  assert.equal(isPediatricFormulaError('5'), false)
})
