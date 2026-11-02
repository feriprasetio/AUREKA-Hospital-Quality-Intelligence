import test from 'node:test'
import assert from 'node:assert/strict'
import {
  makeRehabMedikSubjectKey,
  normalizeRehabDate,
  normalizeRehabOptionLabel,
  parseRehabSourceAnswer,
} from '../lib/aureka/rehab-medik-excel-import.ts'

const options = [
  { code: 1, label: 'Waktu Pelayanan Sesuai Standar', numerator: true, denominator: true },
  { code: 2, label: 'Terlambat (Masalah Sistem RS / Jaringan Error / Antrian Admin)', numerator: false, denominator: true },
  { code: null, label: 'Lainnya — tuliskan alasan/temuan', numerator: null, denominator: true, review_required: true },
]

test('normalizes ISO, DMY, native Date and Excel serial dates', () => {
  assert.equal(normalizeRehabDate('2026-01-02'), '2026-01-02')
  assert.equal(normalizeRehabDate('2/1/2026'), '2026-01-02')
  assert.equal(normalizeRehabDate(46024), '2026-01-02')
  assert.equal(normalizeRehabDate(new Date(Date.UTC(2026, 0, 2))), '2026-01-02')
  assert.equal(normalizeRehabDate('31/02/2026'), null)
})

test('normalizes labels without changing their clinical words', () => {
  assert.equal(
    normalizeRehabOptionLabel('  Waktu Pelayanan   Sesuai Standar '),
    normalizeRehabOptionLabel('Waktu Pelayanan Sesuai Standar'),
  )
})

test('maps a coded workbook response to an exact published master option', () => {
  const answer = parseRehabSourceAnswer('Waktu Pelayanan Sesuai Standar (Code 1)', options)
  assert.deepEqual(answer, {
    label: 'Waktu Pelayanan Sesuai Standar',
    code: 1,
    sourceLabel: 'Waktu Pelayanan Sesuai Standar (Code 1)',
    sourceCode: 1,
    reviewRequired: false,
  })
})

test('rejects a source code that conflicts with the published master', () => {
  assert.throws(
    () => parseRehabSourceAnswer('Waktu Pelayanan Sesuai Standar (Code 3)', options),
    /berbeda dengan kode master/,
  )
})

test('keeps no-code source options pending for manual classification', () => {
  const answer = parseRehabSourceAnswer('Lainnya — tuliskan alasan/temuan', options)
  assert.equal(answer?.code, null)
  assert.equal(answer?.reviewRequired, true)
})

test('keeps each source Excel row distinct when two visits share patient/date/provider details', () => {
  assert.equal(makeRehabMedikSubjectKey(2026, 17), '12:2026:source-row:17')
  assert.notEqual(makeRehabMedikSubjectKey(2026, 17), makeRehabMedikSubjectKey(2026, 18))
})
