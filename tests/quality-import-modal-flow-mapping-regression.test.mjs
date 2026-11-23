import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const specialized = [
  'Complaint','It','RekamMedis','Timkordik','Ambulance','Gizi',
  'Laboratory','Igd','Pharmacy','RehabMedik','Icu','Perinatology',
  'Nicu','Nifas','Ponek','PediatricInpatient','SurgicalInpatient',
  'IsolasiInpatient','SarafInpatient','PenyakitDalamInpatient',
]

test('every unit dialog has exactly one normal-flow content column, not a grid item per data block', () => {
  assert.equal(specialized.length, 20)
  for (const name of specialized) {
    const src = read('components/' + name + 'ExcelImportDialog.tsx')
    assert.ok(src.includes('className="aqBody qiuBody"'),name + ' body')
    assert.equal((src.match(/className="qiuMain"/g) ?? []).length, 1,name + ' main')
    assert.ok(src.indexOf('className="qiuMain"') > src.indexOf('<QualityWorkbookImportSidebar'),name + ' sidebar before content')
  }
  const outpatient=read('components/OutpatientExcelImportDialog.tsx')
  assert.ok(outpatient.includes('className="aqBody qiuBody oiImportBody"'))
  assert.ok(outpatient.includes('className="oiMain"'))
  const generic=read('components/PatientEpisodeWorkbookDialog.tsx')
  assert.ok(generic.includes('className="episodeWorkbook qiuBody"'))
  assert.ok(generic.includes('className="qiuMain"'))
  const mapped=read('components/UnitMappedWorkbookDialog.tsx')
  assert.ok(mapped.includes('className="qimuMappedMain"'))
})

test('normal-flow CSS isolates preview scrolling, QA warnings, and idempotency copy', () => {
  const src=read('components/quality/QualityWorkbookImportSidebar.tsx')
  for (const marker of [
    '.qiuBody>.qiuMain','grid-row:1!important','display:flex!important',
    'flex-direction:column!important','max-height:min(48dvh,440px)',
    'overflow:auto!important','overflow-wrap:anywhere',
    'max-height:calc(100dvh - 185px)','@media(max-width:940px)',
  ]) assert.ok(src.includes(marker),'missing stable layout contract ' + marker)
  const rehab=read('components/RehabMedikExcelImportDialog.tsx')
  assert.ok(rehab.includes('className="riBox riPrivacy"'))
  assert.ok(rehab.includes('Aturan duplikasi dan kunci sumber'))
  assert.ok(!rehab.includes('className="riMuted">Kunci idempotensi mengikuti'))
})

test('profile panel is isolated and supported logbook mappers render in the data column', () => {
  const sidebar = read('components/quality/QualityWorkbookImportSidebar.tsx')
  const rehab = read('components/RehabMedikExcelImportDialog.tsx')
  const workspace = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(sidebar, /scope\?\.role === 'ADMIN'/)
  assert.match(sidebar, /profilesOnly/)
  assert.doesNotMatch(sidebar, /Pengaturan sumber|Pemetaan sumber/)
  assert.match(rehab, /className="qiuMain">\s*<QualityWorkbookLogbookHeading \/>\s*<QualityWorkbookLogbookMapping>\s*<QualityWorkbookInlineColumnMapping/)
  assert.match(workspace, /<QualityWorkbookProfileImportScope\.Provider/)
})

test('supported header-based importers expose in-dialog mapping and reparse their actual File', () => {
  const supported=['Complaint','It','RekamMedis','Timkordik','Ambulance','Gizi','Laboratory','RehabMedik','Icu','Nicu','Outpatient']
  for (const name of supported) {
    const src=read('components/' + name + 'ExcelImportDialog.tsx')
    assert.ok(src.includes('QualityWorkbookInlineColumnMapping'),name)
    assert.ok(src.includes('file={file}'),name)
    assert.ok(src.includes('onApply={()=>file ? parseWorkbook(file) : undefined}'),name)
  }
  const ui=read('components/quality/QualityWorkbookInlineColumnMapping.tsx')
  assert.ok(ui.includes('saveInteractiveExcelHeaderMapping('))
  assert.ok(ui.includes('readInteractiveExcelHeaderMapping('))
  assert.ok(ui.includes('Pilih kolom'))
  assert.ok(ui.includes('Terapkan & periksa ulang'))
  assert.ok(!ui.includes('window.prompt'))
})

test('server-governed mappings cannot be overwritten in the popup', () => {
  const store=read('lib/aureka/interactive-header-mapping.ts')
  assert.ok(store.includes('export function readInteractiveExcelHeaderMapping'))
  assert.ok(store.includes('export function saveInteractiveExcelHeaderMapping'))
  assert.ok(store.includes('serverMappings[importerKey]?.[fieldKey]'))
  assert.ok(store.includes('tidak dapat ditimpa dari popup'))
})

test('Rehab/ICU/NICU/Outpatient fast source-header paths respect persisted user choices', () => {
  for (const name of ['RehabMedik','Icu','Nicu','Outpatient']) {
    const src=read('components/' + name + 'ExcelImportDialog.tsx')
    const fastStart=src.indexOf('if (score === 0)')
    const compactStart=src.indexOf('if(score===0)')
    const start=fastStart>=0?fastStart:compactStart
    assert.ok(start>=0,name + ' missing exact-header branch')
    const end=src.indexOf('return {',start)
    assert.ok(end>start,name + ' branch missing return')
    assert.ok(src.slice(start,end).includes('resolveInteractiveExcelHeaderColumn'),name + ' skips saved mapping on exact header')
  }
  const outpatient=read('components/OutpatientExcelImportDialog.tsx')
  assert.ok(outpatient.includes('matrixMode ?'))
  assert.ok(outpatient.includes('Workbook matriks tanggal menggunakan pemetaan'))
})
