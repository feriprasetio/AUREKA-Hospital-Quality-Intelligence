import test from 'node:test'
import assert from 'node:assert/strict'
import {
  proposeWorkbookIndicatorMappings,
  provisionalDraftStorageKey,
  parseProvisionalMappingDraft,
} from '../lib/aureka/quality-workbook-mapping-draft.ts'
import { detectExcelHeaderColumns } from '../lib/aureka/excel-column-picker.ts'
import { readFileSync } from 'node:fs'
const layouts = JSON.parse(readFileSync(new URL('../data/quality-audit-layout-2026.json', import.meta.url),'utf8'))

test('unit 1 offers N/O indicator mapping candidates without publishing profiles', () => {
  const columns = detectExcelHeaderColumns([
    {index:1,value:'No.'},{index:2,value:'Nama Pasien'},
    {index:12,value:'Rencana Tindak Lanjut'},
    {index:13,value:'Penyelesaian Aduan di Meja Informasi'},
    {index:14,value:'Respon Komplain'},
    {index:15,value:'Mengerti Informasi'},
  ])
  const rows = proposeWorkbookIndicatorMappings(1,columns,layouts)
  assert.deepEqual(rows.map(item => [item.indicatorLabel,item.columnIndex,item.sourceHeader]), [
    ['Respon Komplain',14,'Respon Komplain'],
    ['Mengerti Informasi',15,'Mengerti Informasi'],
  ])
  assert.deepEqual(proposeWorkbookIndicatorMappings(null,columns,layouts),[])
  assert.deepEqual(proposeWorkbookIndicatorMappings(1,[],layouts),[])
  assert.deepEqual(proposeWorkbookIndicatorMappings(888,columns,layouts),[])
})
test('provisional source drafts preserve only header metadata and cannot be mistaken for published profiles', () => {
  const payload={
    version:1,roomId:1,year:2026,importerKey:'complaint',sourceSheet:'Logbook',
    headerRow:2,
    mappings:[{indicatorLabel:'Respon Komplain',sourceHeader:'Respon Komplain',occurrence:1}],
  }
  assert.deepEqual(parseProvisionalMappingDraft(payload),payload)
  assert.equal(parseProvisionalMappingDraft({...payload,version:5}),null)
  assert.equal(parseProvisionalMappingDraft({...payload,mappings:[{indicatorLabel:'X',sourceHeader:'Y',occurrence:21}]}),null)
  assert.notEqual(provisionalDraftStorageKey(1,2026,'complaint','Logbook'),provisionalDraftStorageKey(2,2026,'complaint','Logbook'))
})
