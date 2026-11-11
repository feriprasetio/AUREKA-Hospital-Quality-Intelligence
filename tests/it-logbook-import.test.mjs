import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildItImportPayload,
  createItSubjectKey,
  normalizeItDateTime,
  resolveItIndicatorOption,
} from '../lib/aureka/it-logbook-import.ts'

const options = [
  { label: 'Gangguan Selesai ≤ 1 Jam (Sistem/Perangkat normal kembali)', code: 1, numerator: true, denominator: true },
  { label: 'Penyelesaian > 1 Jam (Gangguan Pihak Ketiga: Provider Internet / Server BPJS / PLN Down)', code: 2, numerator: false, denominator: true },
  { label: 'Penyelesaian > 1 Jam (Menunggu Pengadaan / Pembelian Sparepart Hardware baru)', code: 2, numerator: false, denominator: true },
  { label: 'Penyelesaian > 1 Jam (Petugas IT terlambat merespon tiket / Lupa follow-up)', code: 3, numerator: false, denominator: true },
  { label: 'Lainnya — tuliskan alasan/temuan', code: null, denominator: true, review_required: true },
]

test('normalizes Excel Date, serial, ISO, and Indonesian date-time values', () => {
  assert.equal(normalizeItDateTime('2026-01-02 08:30'), '2026-01-02T08:30')
  assert.equal(normalizeItDateTime('2/1/2026 8:30'), '2026-01-02T08:30')
  assert.equal(normalizeItDateTime('2026-01-02'), '2026-01-02T00:00')
  assert.equal(normalizeItDateTime(46024.3541666667), '2026-01-02T08:30')
  assert.equal(normalizeItDateTime('31/02/2026'), null)
  assert.equal(normalizeItDateTime('not a date'), null)
})

test('matches explicit Code suffixes without confusing duplicate code 2 options', () => {
  const first = resolveItIndicatorOption(options[1].label + ' (Code 2)', options)
  const second = resolveItIndicatorOption(options[2].label + ' (Code 2)', options)
  assert.equal(first?.answer, options[1].label)
  assert.equal(second?.answer, options[2].label)
  assert.equal(first?.code, 2)
  assert.equal(second?.code, 2)
  assert.equal(first?.source_option, false)
})

test('does not guess code for a source-only dropdown option', () => {
  const result = resolveItIndicatorOption('Pilihan belum ada di master (Code 3)', options)
  assert.equal(result?.code, null)
  assert.equal(result?.source_option, true)
  assert.equal(result?.review_required, true)
  assert.equal(result?.answer, 'Pilihan belum ada di master (Code 3)')
})

test('subject key remains stable by source report number for idempotent re-upload', () => {
  assert.equal(createItSubjectKey(12), 'excel-pmkp-informatika-teknologi-2026:no:12')
  assert.equal(createItSubjectKey('12'), createItSubjectKey(12))
  assert.throws(() => createItSubjectKey('0'))
  assert.throws(() => createItSubjectKey('12-A'))
})

test('creates an activity import payload with source provenance and one indicator response', () => {
  const response = resolveItIndicatorOption(options[0].label, options)
  assert.ok(response)
  const item = buildItImportPayload({
    row: {
      sourceRow: 3,
      sourceNo: 1,
      recordDateTime: '2026-01-02T08:30',
      formFields: {
        'No.': '1',
        'Gangguan IT': 'Gangguan jaringan',
        'Asal Ruangan': 'IGD',
        'Tanggal Keluhan': '2026-01-02T08:30',
        'Petugas IT': 'Petugas IT',
        'Tingkat Kesulitan': 'Sedang',
        'Tindak Lanjut': options[0].label,
      },
      response,
    },
    fileName: 'PMKP - Informatika dan Teknologi - 2026.xlsx',
    fileSha256: 'a'.repeat(64),
    profile: { id: '00000000-0000-4000-8000-000000000001' },
    userId: '00000000-0000-4000-8000-000000000002',
  }) as any

  assert.equal(item.payload.room_id, 2)
  assert.equal(item.payload.measurement_grain, 'activity')
  assert.equal(item.payload.status, 'ready')
  assert.equal(item.payload.review_required, false)
  assert.equal(item.payload.record_date, '2026-01-02')
  assert.equal(item.payload.subject_key, createItSubjectKey(1))
  assert.equal(item.payload.core_data.indicator_values['2.1'].code, 1)
  assert.equal(item.responses.length, 1)
  assert.equal(item.responses[0].indicator_id, '00000000-0000-4000-8000-000000000001')
  assert.equal(item.attributions.length, 0)
  assert.equal(item.payload.core_data.patient_name, undefined)
  assert.equal(item.payload.core_data.medical_record_no, undefined)
})
