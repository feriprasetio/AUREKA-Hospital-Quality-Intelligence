import assert from 'node:assert/strict'
import test from 'node:test'
import ExcelJS from 'exceljs-hardened'
import { readWorkbookSourceColumns, getWorkbookRuleColumn } from '../lib/aureka/quality-workbook-columns.ts'
import { lastPharmacyDailyColumn } from '../lib/aureka/pharmacy-excel-import.ts'
import { inspectEpisodeWorkbook } from '../lib/aureka/patient-episode-workbook.ts'
import { prepareAnnualQualityCatalog } from '../lib/aureka/annual-quality-workbook.ts'
import { parseOutpatientMatrixWorkbook } from '../lib/aureka/outpatient-excel-import.ts'

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

  // Explicitly choosing physical column C must win when both B and C
  // display exactly the same header and their occurrence order is ambiguous.
  const physicalRule = {
    source_header: 'Respons',
    occurrence: 1,
    transform_json: {source_sheet:'Data', header_row:3, column_index:3, column_letter:'C'},
  }
  assert.equal(getWorkbookRuleColumn(columns, 'Data', 3, physicalRule)?.index, 3)

  // A moved unique column is still found by its reviewed header rather than
  // accidentally reusing a now-unrelated column at the old position.
  const moved = workbook.addWorksheet('Reordered')
  moved.getRow(3).values = ['Tanggal', 'Catatan', 'Respons']
  const movedColumns = readWorkbookSourceColumns(moved.getRow(3))
  assert.equal(getWorkbookRuleColumn(movedColumns, 'Reordered', 3, {
    ...physicalRule, transform_json:{source_sheet:'Reordered', header_row:3, column_index:2},
  })?.index, 3)
  assert.equal(getWorkbookRuleColumn(movedColumns, 'Reordered', 2, physicalRule), null)
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
  workbook.addWorksheet('Profil').getRow(2).values = ['Klinik', 'Judul Indikator']
  const sheet = workbook.addWorksheet('Logbook')
  sheet.getRow(1).values = ['Poliklinik', new Date('2026-01-01T00:00:00Z'), {formula:'B1+1'}, {formula:'C1+1'}]
  sheet.mergeCells('A1:A2')
  sheet.getCell('B2').value = {formula:'CONCATENATE(TEXT(B1,"mmm"),", ",TEXT(B1,"dddd"))',result:'Jan, Kamis'}
  sheet.getRow(3).values = ['Klinik Uji']
  sheet.getRow(4).values = ['Dokter Uji', 10, 0, 20]
  sheet.getRow(5).values = ['Month', {formula:'MONTH(B1)',result:1}]
  const result = parseOutpatientMatrixWorkbook(workbook,2026,[{clinic:'Klinik Uji',doctors:['Dokter Uji']}])
  assert.deepEqual(result.errors,[])
  assert.deepEqual(result.rows.map(row=>row.sourceColumn),['B','C','D'])
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

test('provider-day matrix continues after the PMKP February 29 placeholder with or without a leap day', () => {
  for (const year of [2026, 2028]) {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Logbook')
    sheet.getRow(1).values = [
      'Poliklinik', new Date(Date.UTC(year, 1, 28)),
      { formula: 'IF(AND(MONTH(B1)=2,DAY(B1)=28,OR(MOD(YEAR(B1),400)=0,AND(MOD(YEAR(B1),4)=0,MOD(YEAR(B1),100)<>0))),B1+1,"")' },
      { formula: 'IF(C1="",B1+1,C1+1)' },
      { formula: 'D1+1' },
    ]
    sheet.getRow(2).values = ['Klinik Uji']
    sheet.getRow(3).values = ['Dokter Uji', 59, year === 2028 ? 49 : null, 60, 61]
    const result = parseOutpatientMatrixWorkbook(workbook, year, [{ clinic: 'Klinik Uji', doctors: ['Dokter Uji'] }])
    assert.deepEqual(result.errors, [])
    assert.deepEqual(result.rows.map(row => [row.date, row.sourceColumn]), [
      [year + '-02-28', 'B'],
      ...(year === 2028 ? [[year + '-02-29', 'C']] : []),
      [year + '-03-01', 'D'],
      [year + '-03-02', 'E'],
    ])
  }
})


test('reports numeric matrix cells without a provider instead of dropping them silently', () => {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Logbook')
  sheet.getRow(1).values = ['Poliklinik', new Date('2026-01-01T00:00:00Z')]
  sheet.getRow(2).values = ['Klinik Uji']
  sheet.getRow(3).values = ['Dokter Uji', 30]
  sheet.getRow(4).values = [null, 60]
  const result = parseOutpatientMatrixWorkbook(workbook, 2026, [{ clinic: 'Klinik Uji', doctors: ['Dokter Uji'] }])
  assert.equal(result.rows.length, 1)
  assert.deepEqual(result.errors, ['Sheet "Logbook" · sel B4: nilai harian tidak memiliki identitas dokter.'])
})
