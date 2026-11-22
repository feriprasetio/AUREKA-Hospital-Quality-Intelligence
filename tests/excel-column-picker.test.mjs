import test from 'node:test'
import assert from 'node:assert/strict'
import { detectExcelHeaderColumns, resolveExcelSourceColumn, excelColumnLetter, describeExcelSourceColumn } from '../lib/aureka/excel-column-picker.ts'

test('picker lists actual letters, retains duplicate headers with an occurrence, and ignores blanks', () => {
  const columns = detectExcelHeaderColumns([
    {index:1,value:'Tanggal'}, {index:2,value:'No. RM'},
    {index:6,value:'STEMI'}, {index:7,value:'STEMI'},
    {index:8,value:''}, {index:9,value:'  Stroke  '},
    {index:27,value:'Pemeriksaan'}, {index:28,value:null},
  ])
  assert.deepEqual(columns.map(x=>[x.letter,x.header,x.occurrence]),[
    ['A','Tanggal',1],['B','No. RM',1],['F','STEMI',1],['G','STEMI',2],
    ['I','Stroke',1],['AA','Pemeriksaan',1],
  ])
  assert.equal(resolveExcelSourceColumn(columns,'STEMI',2)?.letter,'G')
  assert.match(describeExcelSourceColumn(columns[3]),/G · STEMI.*#2/)
  assert.equal(resolveExcelSourceColumn(columns,'Tidak Ada'),null)
  assert.equal(excelColumnLetter(702),'ZZ')
  assert.equal(excelColumnLetter(703),'AAA')
})
test('header and occurrence survive column reordering while preserving intended source',()=>{
  const previous=detectExcelHeaderColumns([{index:4,value:'Kepatuhan'},{index:10,value:'Kepatuhan'}])
  const current=detectExcelHeaderColumns([{index:2,value:'Tanggal'},{index:9,value:'Kepatuhan'},{index:19,value:'Kepatuhan'}])
  const target=resolveExcelSourceColumn(current,previous[1].header,previous[1].occurrence)
  assert.equal(target?.letter,'S')
})
