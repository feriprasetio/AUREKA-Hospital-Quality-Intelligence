import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs-hardened'
import { readWorkbookSourceColumns, getWorkbookRuleColumn } from '../lib/aureka/quality-workbook-columns.ts'
import { lastPharmacyDailyColumn } from '../lib/aureka/pharmacy-excel-import.ts'
import { inspectEpisodeWorkbook } from '../lib/aureka/patient-episode-workbook.ts'
import { prepareAnnualQualityCatalog } from '../lib/aureka/annual-quality-workbook.ts'
import { parseOutpatientMatrixSheet } from '../lib/aureka/outpatient-excel-import.ts'

test('retains physical duplicate headers and checks source provenance', () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Data')
  sheet.getRow(3).values = ['Tanggal', 'Respons', 'Respons']
  const columns = readWorkbookSourceColumns(sheet.getRow(3))
  assert.deepEqual(columns.map(({key})=>key), ['A: Tanggal', 'B: Respons', 'C: Respons'])
  const rule = { source_header:'Respons', occurrence:2, transform_json:{source_sheet:'Data', header_row:3} }
  assert.equal(getWorkbookRuleColumn(columns, 'Data', 3, rule).index, 3)
  assert.equal(getWorkbookRuleColumn(columns, 'Data', 2, rule), null)
  assert.equal(getWorkbookRuleColumn(columns, 'Data', 3, {...rule,mapping_status:'needs_review'}), null)
})

test('annual master retains reviewed codes and reports unknown owners', () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Indikator')
  sheet.addRows([
    ['No.', 'Unit Penanggung Jawab', 'Unit Pengumpul Data', 'Judul Indikator'],
    [1, 'Unit Uji', '', 'Indikator uji'],
    [2, 'Unit Baru', '', 'Indikator unit belum terdaftar'],
  ])
  const plan = prepareAnnualQualityCatalog(workbook,[{code:'99.1',room_id:99,unit_name:'Unit Uji',title:'Indikator uji'}])
  assert.equal(plan.profiles[0].code,'99.1')
  assert.equal(plan.profiles[0].schema_json.source_excel_row,2)
  assert.equal(plan.unresolved[0].row,3)
})

test('provider-day matrix walks only consecutive date formulas and imports measured zero', () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Logbook')
  sheet.getRow(1).values = ['Poliklinik', new Date('2026-01-01T00:00:00Z'), {formula:'B1+1'}, {formula:'C1+1'}]
  sheet.getRow(2).values = ['Klinik Uji']
  sheet.getRow(3).values = ['Dokter Uji', 10, 0, 20]
  const result = parseOutpatientMatrixSheet(sheet,2026,[{clinic:'Klinik Uji',doctors:['Dokter Uji']}],new Set())
  assert.deepEqual(result.errors,[])
  assert.deepEqual(result.rows.map(row=>[row.date,row.waitingMinutes]),[['2026-01-01',10],['2026-01-02',0],['2026-01-03',20]])
})


test('pharmacy excludes the duplicate headers in the monthly summary block', () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Copy Resep Rajal')
  sheet.mergeCells('F9:J9')
  sheet.getCell('F9').value = 'Monthly Report'
  sheet.getCell('C10').value = 'Jumlah Copy Resep'
  sheet.getCell('G10').value = 'Jumlah Copy Resep'
  assert.equal(lastPharmacyDailyColumn(sheet), 5)
})


test('reads the PMKP numbered profile table beside the duplicate instrument header', () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Profil')
  sheet.getRow(2).values = ['No.','Unit','Judul Indikator','Numerator','Denumerator','Jenis Indikator','Standar',null,'Dropdown 1']
  sheet.getCell('U2').value = 'Judul Indikator'
  sheet.getRow(3).values = [1,null,'Kelengkapan Uji','Terisi','Total','(INM)',0.8,null,'Lengkap (Code 1)']
  sheet.getCell('G3').numFmt = '0%'
  const profile = inspectEpisodeWorkbook(workbook).entries[0]
  assert.equal(profile.code,'')
  assert.equal(profile.title,'Kelengkapan Uji')
  assert.equal(profile.metadata.denominator_definition,'Total')
  assert.equal(profile.metadata.target_value,80)
  assert.deepEqual(profile.options.map(option=>option.code),[1])
})
