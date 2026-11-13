import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRekamMedisImportPayload,
  createRekamMedisSubjectKey,
  normalizeRekamMedisDate,
  resolveRekamMedisIndicatorOption,
} from '../lib/aureka/rekam-medis-logbook.ts'

const claimOptions = [
  { label: 'Klaim Layak / Lolos Verifikasi', code: 1, numerator: false, denominator: true },
  { label: 'Klaim Pending/Dispute', code: 2, numerator: true, denominator: true },
]
const klpcmOptions = [
  { label: 'Lengkap (Terisi lengkap ≤ 24 jam setelah pasien pulang)', code: 1, numerator: false, denominator: true },
  { label: 'Tidak Lengkap (Resume Medis belum diisi/Diagnosa Utama kosong)', code: 3, numerator: true, denominator: true },
]

test('normalizes Excel serials, Date values, ISO and Indonesian dates', () => {
  assert.equal(normalizeRekamMedisDate(46084), '2026-03-03')
  assert.equal(normalizeRekamMedisDate('2026-03-03'), '2026-03-03')
  assert.equal(normalizeRekamMedisDate('3/3/2026'), '2026-03-03')
  assert.equal(normalizeRekamMedisDate(new Date('2026-03-03T00:00:00.000Z')), '2026-03-03')
  assert.equal(normalizeRekamMedisDate('31/02/2026'), null)
  assert.equal(normalizeRekamMedisDate('not a date'), null)
})

test('matches source Code suffix to the exact master option without losing the source label', () => {
  const resolved = resolveRekamMedisIndicatorOption(
    'Klaim Layak / Lolos Verifikasi (Code 1)',
    claimOptions,
  )
  assert.equal(resolved?.answer, 'Klaim Layak / Lolos Verifikasi')
  assert.equal(resolved?.source_value, 'Klaim Layak / Lolos Verifikasi (Code 1)')
  assert.equal(resolved?.code, 1)
  assert.equal(resolved?.source_option, false)
  assert.equal(resolved?.review_required, false)
})

test('keeps unrecognized source labels unclassified and marks them for review', () => {
  const resolved = resolveRekamMedisIndicatorOption('Pilihan sumber di luar master (Code 2)', claimOptions)
  assert.equal(resolved?.answer, 'Pilihan sumber di luar master (Code 2)')
  assert.equal(resolved?.code, null)
  assert.equal(resolved?.source_option, true)
  assert.equal(resolved?.review_required, true)
})

test('subject keys are stable by worksheet row and reject invalid rows', () => {
  assert.equal(createRekamMedisSubjectKey(3), 'excel-pmkp-rekam-medis-2026:row:3')
  assert.equal(createRekamMedisSubjectKey('184'), createRekamMedisSubjectKey(184))
  assert.throws(() => createRekamMedisSubjectKey(2))
  assert.throws(() => createRekamMedisSubjectKey(5004))
})

test('builds a 2026 event payload with two indicator responses and idempotent provenance', () => {
  const claimResponse = resolveRekamMedisIndicatorOption('Klaim Layak / Lolos Verifikasi (Code 1)', claimOptions)
  const klpcmResponse = resolveRekamMedisIndicatorOption('Lengkap (Terisi lengkap ≤ 24 jam setelah pasien pulang) (Code 1)', klpcmOptions)
  const payload = buildRekamMedisImportPayload({
    row: {
      sourceRow: 3,
      sourceNo: 1,
      patientName: 'Pasien Contoh',
      medicalRecordNo: '00-00-00',
      admissionDate: '2026-03-03',
      sep: '0000000000000',
      dpjp: 'Dokter Contoh',
      claim: 'Klaim Layak / Lolos Verifikasi (Code 1)',
      klpcm: 'Lengkap (Terisi lengkap ≤ 24 jam setelah pasien pulang) (Code 1)',
      claimResponse,
      klpcmResponse,
    },
    fileName: 'PMKP - Instalasi Rekam Medis - 2026.xlsx',
    fileSha256: 'a'.repeat(64),
    profiles: [
      { id: '00000000-0000-4000-8000-000000000013', code: '13.1' },
      { id: '00000000-0000-4000-8000-000000000014', code: '13.2' },
    ],
    userId: '00000000-0000-4000-8000-000000000099',
  })
  assert.equal(payload.payload.room_id, 13)
  assert.equal(payload.payload.measurement_grain, 'event')
  assert.equal(payload.payload.status, 'ready')
  assert.equal(payload.payload.review_required, false)
  assert.equal(payload.payload.record_date, '2026-03-03')
  assert.equal(payload.payload.subject_key, createRekamMedisSubjectKey(3))
  assert.equal(payload.payload.core_data.indicator_values['13.1'].code, 1)
  assert.equal(payload.payload.core_data.indicator_values['13.2'].code, 1)
  assert.equal(payload.responses.length, 2)
  assert.equal(payload.responses[0].indicator_id, '00000000-0000-4000-8000-000000000013')
  assert.equal(payload.responses[1].indicator_id, '00000000-0000-4000-8000-000000000014')
  assert.equal(payload.attributions.length, 0)
})
