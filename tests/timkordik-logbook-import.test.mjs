import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildTimkordikImportPayload,
  createTimkordikSubjectKey,
  normalizeTimkordikDate,
  resolveTimkordikIndicatorOption,
  TIMKORDIK_INDICATORS,
} from '../lib/aureka/timkordik-logbook-import.ts'

const profiles = TIMKORDIK_INDICATORS.map((indicator, index) => ({
  id: '00000000-0000-4000-8000-' + String(index + 1).padStart(12, '0'),
  code: indicator.code,
  room_id: 30,
  profile_year: 2026,
  is_active: true,
  status: 'published',
}))

test('normalizes Excel serials, Date values, ISO dates, and Indonesian dates', () => {
  assert.equal(normalizeTimkordikDate(46027), '2026-01-05')
  assert.equal(normalizeTimkordikDate('2026-11-04'), '2026-11-04')
  assert.equal(normalizeTimkordikDate('4/11/2026'), '2026-11-04')
  assert.equal(normalizeTimkordikDate(new Date('2026-01-05T00:00:00.000Z')), '2026-01-05')
  assert.equal(normalizeTimkordikDate('31/02/2026'), null)
  assert.equal(normalizeTimkordikDate('not a date'), null)
})

test('maps Code suffixes to the exact matching indicator option, including duplicate codes', () => {
  const normal = resolveTimkordikIndicatorOption('30.1', 'Administrasi Lengkap (Awal hingga Akhir) (Code 1)')
  const external = resolveTimkordikIndicatorOption('30.1', 'Tidak Lengkap (Menunggu proses MOU/Legal Institusi - Faktor Eksternal) (Code 2)')
  const medical = resolveTimkordikIndicatorOption('30.3', 'Pernah Terlambat/Absen (Sakit dengan Surat Dokter/Izin Duka) (Code 2)')
  const campus = resolveTimkordikIndicatorOption('30.3', 'Pernah Terlambat/Absen (Tugas Institusi Pendidikan/Ujian Kampus - Ada Surat Tugas) (Code 2)')
  assert.equal(normal?.code, 1)
  assert.equal(external?.code, 2)
  assert.equal(medical?.code, 2)
  assert.equal(campus?.code, 2)
  assert.notEqual(medical?.answer, campus?.answer)
  assert.equal(medical?.review_required, false)
  assert.equal(medical?.source_value, 'Pernah Terlambat/Absen (Sakit dengan Surat Dokter/Izin Duka) (Code 2)')
})

test('does not infer code for any response that is not in the workbook Profil sheet', () => {
  assert.equal(resolveTimkordikIndicatorOption('30.1', 'Administrasi Lengkap (Code 2)'), null)
  assert.equal(resolveTimkordikIndicatorOption('30.2', 'Atribut sesuai (Code 1)'), null)
  assert.equal(resolveTimkordikIndicatorOption('30.5', 'Laporan Selesai Tepat Waktu'), null)
})

test('source number is stable and validated as the idempotency key', () => {
  assert.equal(createTimkordikSubjectKey(1), 'excel-pmkp-timkordik-2026:no:1')
  assert.equal(createTimkordikSubjectKey('196'), createTimkordikSubjectKey(196))
  assert.throws(() => createTimkordikSubjectKey(0))
  assert.throws(() => createTimkordikSubjectKey('1-A'))
})

test('builds an activity payload with five profile responses and source provenance', () => {
  const responses = Object.fromEntries(TIMKORDIK_INDICATORS.map((indicator, index) => {
    const option = indicator.options[0]
    const raw = option.label + ' (Code ' + option.code + ')'
    return [indicator.code, resolveTimkordikIndicatorOption(indicator.code, raw)]
  }))
  const row = {
    sourceRow: 3,
    sourceNo: 1,
    startDate: '2026-01-05',
    endDate: '2026-01-12',
    formFields: {
      'No.': '1',
      'Nama Mahasiswa': 'Nama Contoh',
      'Profesi/Prodi': 'Perawat',
      'Kampus': 'Fak.Keperawatan Untan',
      'Stase Terakhir': 'Manajemen Keperawatan',
      'Tanggal Mulai Praktek': '2026-01-05',
      'Tanggal Selesai Praktek': '2026-01-12',
      'CI/Penanggung Jawab': 'CI Contoh',
      'Administrasi': TIMKORDIK_INDICATORS[0].options[0].label + ' (Code 1)',
      'Atribut': TIMKORDIK_INDICATORS[1].options[0].label + ' (Code 1)',
      'Absensi': TIMKORDIK_INDICATORS[2].options[0].label + ' (Code 1)',
      'Sikap & Perilaku': TIMKORDIK_INDICATORS[3].options[0].label + ' (Code 1)',
      'Laporan': TIMKORDIK_INDICATORS[4].options[0].label + ' (Code 1)',
    },
    responses,
  }
  const result = buildTimkordikImportPayload({
    row,
    fileName: 'PMKP - Timkordik - 2026.xlsx',
    fileSha256: 'a'.repeat(64),
    profiles,
    userId: '00000000-0000-4000-8000-000000000099',
  }) as any

  assert.equal(result.payload.room_id, 30)
  assert.equal(result.payload.profile_year, 2026)
  assert.equal(result.payload.measurement_grain, 'activity')
  assert.equal(result.payload.status, 'ready')
  assert.equal(result.payload.record_date, '2026-01-05')
  assert.equal(result.payload.subject_key, createTimkordikSubjectKey(1))
  assert.equal(result.payload.review_required, false)
  assert.equal(result.responses.length, 5)
  assert.equal(result.attributions.length, 0)
  assert.equal(result.payload.core_data.unit_name, 'Tim Koordinasi Pendidikan')
  assert.equal(result.payload.core_data.form_fields['Nama Mahasiswa'], 'Nama Contoh')
  assert.equal(result.payload.core_data.indicator_values['30.1'].code, 1)
  assert.equal(result.payload.core_data.indicator_values['30.5'].code, 1)
  assert.equal(result.payload.core_data.patient_name, undefined)
  assert.equal(result.payload.core_data.medical_record_no, undefined)
  assert.equal(result.responses[0].indicator_id, profiles[0].id)
  assert.equal(result.payload.core_data.source_import.source_excel_row, 3)
  assert.equal(result.payload.core_data.source_import.source_excel_no, 1)
})
