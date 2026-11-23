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

test('the dropdown and Rehab import share canonical matching, including a unique label without a code suffix', async () => {
  const { buildIndicatorDropdownOptions } = await import('../lib/aureka/indicator-dropdown.ts')
  const source = ' Waktu   Pelayanan Sesuai Standar '
  const dropdown = buildIndicatorDropdownOptions({ options_json: options }, [source])[0]
  assert.equal(dropdown.source_only, false)
  assert.equal(dropdown.code, parseRehabSourceAnswer(source, options).code)
  assert.throws(() => parseRehabSourceAnswer(source, [...options, { ...options[0], code: 3 }]), /beberapa opsi/)
})

test('the published Rehab catalog includes workbook dropdown choices that previously blocked valid rows', async () => {
  const { readFile } = await import('node:fs/promises')
  const catalog = JSON.parse(await readFile(new URL('../data/quality-profile-2026/chunk-03.json', import.meta.url), 'utf8'))
    .concat(JSON.parse(await readFile(new URL('../data/quality-profile-2026/chunk-04.json', import.meta.url), 'utf8')))
  const profile = catalog.find(row => row.code === '12.2')
  for (const [label, code] of [
    ['Drop Out Tanpa Alasan', 3],
    ['Drop Out (Perubahan Program Terapi Atas Permintaan Dokter)', 2],
    ['Drop Out (Pasien merasa perbaikan namun tidak sesuai program)', 3],
  ]) {
    const answer = parseRehabSourceAnswer(label + ' (Code ' + code + ')', profile.options_json)
    assert.equal(answer.code, code)
    assert.equal(answer.reviewRequired, false)
  }
})
