import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const specialized = [
  ['Complaint','complaint'], ['It','it'], ['RekamMedis','rekam-medis'],
  ['Timkordik','timkordik'], ['Ambulance','ambulance'], ['Gizi','gizi'],
  ['Laboratory','laboratory'], ['Igd','igd'], ['Pharmacy','pharmacy'],
  ['Outpatient','outpatient'], ['RehabMedik','rehab'], ['Icu','icu'],
  ['Perinatology','perinatology'], ['Nicu','nicu'], ['Nifas','nifas'],
  ['Ponek','ponek'], ['PediatricInpatient','pediatric-inpatient'],
  ['SurgicalInpatient','surgical-inpatient'], ['IsolasiInpatient','isolasi-inpatient'],
  ['SarafInpatient','saraf-inpatient'], ['PenyakitDalamInpatient','penyakit-dalam-inpatient'],
]

test('all 21 specialized unit importers share the IBS-style audited settings panel', () => {
  const sidebar = read('components/quality/QualityWorkbookImportSidebar.tsx')
  assert.equal(specialized.length, 21)
  for (const [name, unitKey] of specialized) {
    const content = read('components/' + name + 'ExcelImportDialog.tsx')
    assert.ok(content.includes("import QualityWorkbookImportSidebar from '@/components/quality/QualityWorkbookImportSidebar'"), name)
    assert.ok(content.includes('<QualityWorkbookImportSidebar unitKey="' + unitKey + '" year={year} />'), name)
    assert.ok(content.includes(unitKey === 'outpatient' ? 'className="aqBody qiuBody oiImportBody"' : 'className="aqBody qiuBody"'), name)
    assert.ok(sidebar.includes('"' + unitKey + '":'), 'Missing source format for ' + unitKey)
    assert.ok(content.includes('<QualityWorkbookPreviewControls'), 'Missing preview settings in ' + name)
    assert.match(content, /<div className="(?:oiMain|qiuMain)">/, name)
    assert.match(content, /<\/div>\s*<\/div>\s*<div className="aqFoot(?: [a-z]+Footer)?"/, name)
  }
  assert.match(sidebar, /<details className="qiuDetails">/)
  const ibs = read('components/IbsExcelImportDialog.tsx')
  assert.ok(ibs.includes('className="ciImportGrid"'))
  assert.ok(ibs.includes('className="ciSettingsList"'))
})

test('generic patient episode importer uses the same audited source/settings presentation', () => {
  const generic = read('components/PatientEpisodeWorkbookDialog.tsx')
  const sidebar = read('components/quality/QualityWorkbookImportSidebar.tsx')
  assert.ok(generic.includes('className="episodeWorkbook qiuBody"'))
  assert.ok(generic.includes('unitKey="generic" year={year} unitName={roomName}'))
  assert.ok(sidebar.includes('.episodeWorkbook.qiuBody'))
  assert.ok(sidebar.includes('@media(max-width:940px)'))
  assert.ok(sidebar.includes('@media(max-width:540px)'))
})

test('shared preview toolbar always shows both filter and page-size controls', () => {
  const preview = read('components/quality/QualityWorkbookPreviewControls.tsx')
  assert.ok(preview.includes('const activeMode: WorkbookPreviewMode'))
  assert.ok(preview.includes('previewMode: activeMode'))
  assert.ok(preview.includes('disabled={config.warningCount === 0 && config.historicalCount === 0}'))
  assert.ok(preview.includes('Jumlah baris'))
  assert.ok(preview.includes('Semua baris'))
})
