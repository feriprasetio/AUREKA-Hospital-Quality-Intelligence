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
    assert.match(content, /import QualityWorkbookImportSidebar from '@\\/components\\/quality\\/QualityWorkbookImportSidebar'/)
    assert.ok(content.includes('<div className="aqBody qiuBody"><QualityWorkbookImportSidebar unitKey="' + unitKey + '" year={year} />'), name)
    assert.ok(sidebar.includes('"' + unitKey + '":'), 'Missing format metadata for ' + unitKey)
    assert.match(content, /<QualityWorkbookPreviewControls/)
    assert.match(content, /onClick=\\{[^}]*close|onClick=\\{close\\}/)
  }
  const ibs = read('components/IbsExcelImportDialog.tsx')
  assert.match(ibs, /className="ciImportGrid"/)
  assert.match(ibs, /className="ciSettingsList"/)
})

test('generic patient episode importer uses the same audited source/settings presentation', () => {
  const generic = read('components/PatientEpisodeWorkbookDialog.tsx')
  const sidebar = read('components/quality/QualityWorkbookImportSidebar.tsx')
  assert.match(generic, /className="episodeWorkbook qiuBody"/)
  assert.match(generic, /unitKey="generic" year=\\{year\\} unitName=\\{roomName\\}/)
  assert.match(sidebar, /\.episodeWorkbook\.qiuBody/)
  assert.match(sidebar, /@media\\(max-width:940px\\)/)
  assert.match(sidebar, /@media\\(max-width:540px\\)/)
})

test('shared preview toolbar always shows both filter and page-size controls', () => {
  const preview = read('components/quality/QualityWorkbookPreviewControls.tsx')
  assert.match(preview, /const activeMode: WorkbookPreviewMode/)
  assert.match(preview, /previewMode: activeMode/)
  assert.match(preview, /disabled=\\{config.warningCount === 0 && config.historicalCount === 0\\}/)
  assert.match(preview, /Jumlah baris/)
  assert.match(preview, /Semua baris/)
})
