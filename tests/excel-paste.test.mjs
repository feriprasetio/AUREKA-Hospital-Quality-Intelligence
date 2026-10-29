import test from 'node:test'
import assert from 'node:assert/strict'
import { parseExcelPaste, normalizeExactHeader } from '../lib/aureka/excel-paste.ts'

const headers = ['Nama Pasien', 'No. Rekam Medis', 'Tanggal Masuk', 'Kepatuhan Identifikasi Pasien']

test('maps exact unit headers and preserves tabular row values', () => {
  const parsed = parseExcelPaste(
    'Nama Pasien\tNo. Rekam Medis\tTanggal Masuk\tKepatuhan Identifikasi Pasien\nPasien Contoh\tRM-001\t29/10/2026\tSesuai',
    headers,
  )
  assert.deepEqual(parsed.errors, [])
  assert.deepEqual(parsed.unknownHeaders, [])
  assert.deepEqual(parsed.duplicateHeaders, [])
  assert.equal(parsed.rows.length, 1)
  assert.equal(parsed.rows[0].sourceRow, 2)
  assert.equal(parsed.rows[0].values['Nama Pasien'], 'Pasien Contoh')
  assert.equal(parsed.rows[0].values['Kepatuhan Identifikasi Pasien'], 'Sesuai')
})

test('normalizes case and spacing without fuzzy matching', () => {
  assert.equal(normalizeExactHeader('  NAMA   PASIEN '), normalizeExactHeader('Nama Pasien'))
  const parsed = parseExcelPaste('nama pasien\tNo. Rekam Medis\nA\tRM1', headers)
  assert.equal(parsed.errors.length, 0)
  assert.equal(parsed.rows[0].values['Nama Pasien'], 'A')
})

test('blocks unknown headers instead of guessing their meaning', () => {
  const parsed = parseExcelPaste('Nama Pasien\tNo RM\nA\tRM1', headers)
  assert.ok(parsed.unknownHeaders.includes('No RM'))
  assert.ok(parsed.errors.some((message) => message.includes('tidak cocok')))
  assert.equal(parsed.rows[0].values['No. Rekam Medis'], undefined)
})

test('blocks duplicate headers after normalization', () => {
  const parsed = parseExcelPaste('Nama Pasien\t nama   pasien \nA\tB', headers)
  assert.ok(parsed.duplicateHeaders.length > 0)
  assert.ok(parsed.errors.some((message) => message.includes('ganda')))
})

test('requires clipboard TSV and at least one data row', () => {
  assert.ok(parseExcelPaste('plain text', headers).errors.length > 0)
  assert.ok(parseExcelPaste('Nama Pasien\tNo. Rekam Medis', headers).errors.length > 0)
})

test('caps the import payload to 500 data rows', () => {
  const body = ['Nama Pasien\tNo. Rekam Medis', ...Array.from({ length: 520 }, (_, i) => 'Pasien ' + (i + 1) + '\tRM-' + (i + 1))].join('\n')
  const parsed = parseExcelPaste(body, headers)
  assert.equal(parsed.rows.length, 500)
  assert.ok(parsed.errors.some((message) => message.includes('Maksimal 500')))
})
