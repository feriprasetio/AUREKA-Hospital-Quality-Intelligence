import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Rawat Jalan keeps preview and audit notices in independent normal-flow main column', () => {
  const source = read('components/OutpatientExcelImportDialog.tsx')
  assert.match(source, /className="aqBody qiuBody oiImportBody"/)
  assert.match(source, /unitKey="outpatient" year=\{year\} \/><div className="oiMain">/)
  assert.match(source, /className="oiTable" aria-label="Pratinjau data Rawat Jalan"/)
  assert.match(source, /className="oiPreviewScroll" role="region" tabIndex=\{0\}/)
  assert.match(source, /<\/tbody><\/table><\/div><\/section>\}/)
  assert.match(source, /className="oiAfterPreview"/)
  assert.match(source, /<\/div><\/div><\/div>\s*<div className="aqFoot">/)
  assert.match(source, /className="oiImportBody">/)
  assert.match(source, /\.oiImportBody>\.oiMain\{grid-column:2!important;grid-row:1!important;display:flex!important/)
  assert.match(source, /\.oiMain \.oiPreviewScroll\{display:block;position:relative;min-height:0;max-height:min\(48dvh,420px\)/)
  assert.match(source, /\.oiMain>\.oiTable\{display:block!important;position:relative;isolation:isolate;/)
  assert.match(source, /@media\(max-width:940px\)/)
})

test('Rawat Jalan never subtracts already rejected rows from validated rows twice', () => {
  const source = read('components/OutpatientExcelImportDialog.tsx')
  assert.doesNotMatch(source, /rows\.length-errors\.length/)
  assert.match(source, /<span>Baris bermasalah<\/span><strong>\{errors\.length\}<\/strong>/)
  assert.match(source, /<span>Baris lolos validasi<\/span><strong>\{rows\.length\}<\/strong>/)
  assert.match(source, /errors\.length>0&&!allowValidRows/)
  assert.match(source, /Impor baris valid dan sisakan baris yang perlu koreksi/)
})

test('Hemodialisa and Radiologi have mapped-import entries and a shared source settings sidebar', () => {
  const workspace=read('components/QualityIndicatorWorkspace.tsx')
  const modal=read('components/UnitMappedWorkbookDialog.tsx')
  const sidebar=read('components/quality/QualityWorkbookImportSidebar.tsx')
  assert.match(workspace, /const mappedUnitFormat=roomId===8\|\|roomId===10/)
  assert.match(workspace, /setMappedWorkbookOpen\(true\)/)
  assert.match(workspace, /mappedWorkbookOpen&&canImportWorkbook&&\(roomId===8\|\|roomId===10\)/)
  assert.match(workspace, /<UnitMappedWorkbookDialog/)
  assert.match(workspace, /setMappedWorkbookOpen\(false\)/)
  assert.match(modal, /roomId: 8 \| 10/)
  assert.match(modal, /className="episodeWorkbook qiuBody qimuMappedLayout"/)
  assert.match(modal, /<QualityWorkbookImportSidebar unitKey=\{unitKey\}/)
  assert.match(modal, /<QualityWorkbookImportPanel/)
  assert.match(modal, /importerKey="unit-logbook"/)
  assert.match(modal, /dataOnly/)
  assert.match(sidebar, /"hemodialysis":/)
  assert.match(sidebar, /"radiology":/)
  assert.match(sidebar, /"limitMb": 25/)
})

test('mapped imports do not silently overwrite profiles or assume clinical compliance', () => {
  const modal=read('components/UnitMappedWorkbookDialog.tsx')
  const panel=read('components/QualityWorkbookImportPanel.tsx')
  assert.match(modal, /dataOnly/)
  assert.match(modal, /Pilih worksheet, baris header, dan kolom respons/)
  assert.match(panel, /const roleCanImportProfiles = role === 'ADMIN' && !dataOnly/)
  assert.match(panel, /validate_quality_import_batch/)
  assert.match(panel, /commit_quality_import_batch/)
})
