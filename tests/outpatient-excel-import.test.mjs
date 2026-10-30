import test from 'node:test'
import assert from 'node:assert/strict'
import { parseOutpatientWorkbook, normalizeOutpatientDate } from '../lib/aureka/outpatient-excel-import.ts'

async function workbookBuffer() {
  const module = await import('exceljs-hardened')
  const ExcelJS = module.default ?? module
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Logbook')
  sheet.getCell('A1').value = 'Poliklinik'
  sheet.getCell('B1').value = new Date(Date.UTC(2026, 0, 1))
  sheet.getCell('C1').value = 46024
  sheet.getCell('D1').value = new Date(Date.UTC(2025, 11, 31))
  sheet.getCell('A2').value = 'Klinik Anak'
  sheet.getCell('B2').value = 999
  sheet.getCell('A3').value = 'dr. A'
  sheet.getCell('B3').value = 40
  sheet.getCell('C3').value = { formula: '20+10', result: 30 }
  sheet.getCell('D3').value = 500
  sheet.getCell('A4').value = 'dr. B'
  sheet.getCell('B4').value = 0
  sheet.getCell('C4').value = '12,5'
  sheet.getCell('A5').value = 'Klinik Mata'
  sheet.getCell('B5').value = 12345
  sheet.getCell('A6').value = 'dr. C'
  sheet.getCell('B6').value = 'invalid'
  sheet.getCell('C6').value = 25
  return workbook.xlsx.writeBuffer()
}

test('normalizes Excel serials, ISO dates, and Indonesian date strings', () => {
  assert.equal(normalizeOutpatientDate(46023), '2026-01-01')
  assert.equal(normalizeOutpatientDate('02/01/2026'), '2026-01-02')
  assert.equal(normalizeOutpatientDate('2026-01-03'), '2026-01-03')
  assert.equal(normalizeOutpatientDate('31/02/2026'), null)
})

test('reads Logbook matrix dates, clinics, doctors, formula cached values and numeric minutes', async () => {
  const parsed = await parseOutpatientWorkbook(await workbookBuffer(), 2026)
  assert.equal(parsed.rows.length, 5)
  assert.deepEqual(parsed.clinics, ['Klinik Anak', 'Klinik Mata'])
  assert.deepEqual(parsed.doctors, ['dr. A', 'dr. B', 'dr. C'])
  assert.deepEqual(parsed.dates, ['2026-01-01', '2026-01-02'])
  assert.deepEqual(parsed.rows.slice(0, 3).map(row => row.waitingMinutes), [40, 30, 0])
  assert.equal(parsed.invalidCellCount, 1)
  assert.ok(parsed.warnings.some(item => item.includes('invalid')))
})

test('rejects workbooks without a Logbook sheet', async () => {
  const module = await import('exceljs-hardened')
  const ExcelJS = module.default ?? module
  const workbook = new ExcelJS.Workbook()
  workbook.addWorksheet('Dashboard')
  const buffer = await workbook.xlsx.writeBuffer()
  await assert.rejects(
    () => parseOutpatientWorkbook(buffer, 2026),
    /Sheet "Logbook" tidak ditemukan/,
  )
})
