import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const layoutPath = fileURLToPath(new URL('../data/quality-audit-layout-2026.json', import.meta.url))
const layouts = JSON.parse(readFileSync(layoutPath, 'utf8'))
const room = layouts.find(entry => Number(entry.roomId) === 1)

test('Informasi dan Pengaduan uses dropdowns matching native Logbook validation', () => {
  assert.ok(room)
  assert.deepEqual(room.fieldOptions['Level Masalah'], ['Ringan', 'Sedang', 'Berat'])
  assert.deepEqual(room.fieldOptions['Sumber Aduan'], [
    'Aduan Langsung Tatap Muka',
    'Contact Person Pengaduan',
    'Instansi Lain (Misal: Kantor BPJS)',
    'Sosial Media (FB, IG, dll)',
    'Website Rumah Sakit',
    'Sumber Lainnya',
  ])
  assert.ok(room.fieldOptions['Status Aduan'].includes('Aduan Tidak Selesai Ditindaklanjuti'))
  assert.ok(room.fieldOptions['Status Aduan'].includes('Aduan Selesai Dengan Mediasi Manajemen'))
})

test('free-text service unit is not silently constrained to observed historical values', () => {
  assert.equal(Object.hasOwn(room.fieldOptions, 'Unit Pelayanan'), false)
  assert.ok(room.fields.includes('Unit Pelayanan'))
})

test('only the two indicators with populated master option lists are active in this workbook', () => {
  assert.deepEqual(room.indicators, ['Respon Komplain', 'Mengerti Informasi'])
  assert.equal(room.indicatorControl, 'select')
  assert.equal(room.fieldTypes['Tanggal Aduan'], 'datetime-local')
  assert.equal(room.fieldTypes['Tanggal Tindak Lanjut'], 'datetime-local')
})
