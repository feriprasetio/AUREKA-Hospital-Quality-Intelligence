import test from 'node:test'
import assert from 'node:assert/strict'

test('hardened XLSX reader can load a workbook with a Logbook sheet', async () => {
  const module = await import('exceljs-hardened')
  const ExcelJS = module.default ?? module
  assert.equal(typeof ExcelJS.Workbook, 'function')

  const source = new ExcelJS.Workbook()
  const sheet = source.addWorksheet('Logbook')
  sheet.getCell('B2').value = 'Nama Pasien'
  sheet.getCell('C2').value = 'No RM'
  sheet.getCell('F2').value = 'Tanggal Aduan'
  sheet.getCell('B3').value = 'Contoh Uji'
  sheet.getCell('C3').value = 'TEST-0001'
  sheet.getCell('F3').value = new Date(Date.UTC(2026, 0, 7, 14, 28))

  const buffer = await source.xlsx.writeBuffer()
  const destination = new ExcelJS.Workbook()
  await destination.xlsx.load(buffer)
  const parsed = destination.getWorksheet('Logbook')
  assert.ok(parsed)
  assert.equal(parsed.getCell('B2').value, 'Nama Pasien')
  assert.equal(parsed.getCell('C3').value, 'TEST-0001')
  assert.ok(parsed.getCell('F3').value instanceof Date)
  assert.equal(parsed.getCell('F3').value.toISOString().slice(0, 16), '2026-01-07T14:28')
})
