import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Audit Indikator Mutu keeps its operational engine and adds a scoped balanced workspace skin', () => {
  const source = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(source, /return <div className="aq aqAuditWorkspace">/)
  assert.match(source, /className="aq aqPortal aqAuditWorkspace"/)
  assert.match(source, /calculateInclusiveDurationDays|compareToTarget/)
  assert.match(source, /responseComplete\(/)
  assert.match(source, /const save=async\(\)=>/)
  assert.match(source, /openImportDialog\(/)
  assert.match(source, /archivePatient\(/)
  assert.match(source, /reviewRecord\(/)
  assert.ok(source.includes('grid-template-columns:minmax(220px,1.45fr) minmax(105px,.55fr) minmax(155px,.8fr) auto'))
  assert.match(source, /\.aqAuditWorkspace \.aqFilterActions\{display:flex;align-items:center;justify-content:flex-end/)
  assert.match(source, /table\.aqData\{width:100%;min-width:1050px;table-layout:auto/)
})

test('Logbook editor remains an accessible centered modal with responsive internal scrolling', () => {
  const source = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(source, /createPortal\(/)
  assert.match(source, /role="dialog" aria-modal="true"/)
  assert.match(source, /useAccessibleDialog<HTMLDivElement>\(\{open:patientOpen/)
  assert.match(source, /\.aqAuditWorkspace \.aqBack\.aqEditorBack\{align-items:center;justify-content:center/)
  assert.match(source, /\.aqAuditWorkspace \.aqEditorDialog\{[\s\S]*max-height:calc\(100dvh - 40px\)/)
  assert.match(source, /\.aqAuditWorkspace \.aqEditorDialog \.aqBody\{flex:1 1 auto;min-height:0;overflow:auto/)
})

test('Results tab retains the validated indicator calculation engine and balanced presentation', () => {
  const source = read('components/QualityResultsWorkspace.tsx')
  assert.match(source, /calculateIndicatorResult\(/)
  assert.match(source, /aggregateClinicalPathwayRows\(/)
  assert.match(source, /aggregateClinicalDeathAudits\(/)
  assert.match(source, /\.qraHero\{padding:14px 16px/)
  assert.match(source, /\.qraTable\{min-width:1080px/)
})


test('Every indicator uses the professional compact assessment UI without evidence or draft labels', () => {
  const source = read('components/QualityIndicatorWorkspace.tsx')
  const editorStart = source.indexOf('const indicatorEditor=')
  const editorEnd = source.indexOf('const reviewRecord=', editorStart)
  const editor = source.slice(editorStart, editorEnd)
  assert.ok(editorStart >= 0 && editorEnd > editorStart)
  assert.doesNotMatch(editor, /Bukti & catatan audit|Definisi operasional & rumus indikator|Pilih hasil sesuai Logbook|Nama master:/)
  assert.match(source, /<h5>Penilaian Indikator Mutu<\/h5>/)
  assert.match(source, /className="aqIndicatorMeta"/)
  assert.match(source, /className="aqField aqChoiceField"/)
  assert.match(source, /aqResultSummary/)
  assert.match(source, /review_required===true\|\|choice\.code==null/)
  assert.match(source, /Compact professional indicator assessment — shared by every unit/)
})


test('Audit Indikator Mutu uses the single global header search and removes its local search field', () => {
  const workspace = read('components/QualityIndicatorWorkspace.tsx')
  const home = read('components/HomeClient.tsx')
  assert.doesNotMatch(workspace, /className="aqField aqLocalSearch"|<span>Pencarian<\/span><input/)
  assert.match(workspace, /aureka:workspace-search/)
  assert.match(workspace, /hay\.includes\(search\.toLowerCase\(\)\.trim\(\)\)/)
  assert.match(workspace, /aqMonthSelect/)
  assert.match(home, /workspaceGlobalSearchInput/)
  assert.doesNotMatch(home, /Cari menu|sidebarSearch|navigationQuery/)
})


test('Logbook toolbar is consolidated into the unit/year/month filter row', () => {
  const source = read('components/QualityIndicatorWorkspace.tsx')
  const filterStart = source.indexOf('<section className="glass aqFilters">')
  const dataBarStart = source.indexOf('<div className="aqDataBar"')
  const filterMarkup = source.slice(filterStart, dataBarStart)
  assert.ok(filterStart >= 0 && dataBarStart > filterStart)
  assert.ok(filterMarkup.indexOf('Bulan Pengamatan') < filterMarkup.indexOf('aqFilterActions'))
  assert.match(filterMarkup, /aqFilterActions/)
  assert.match(filterMarkup, /aqImportButton/)
  assert.match(filterMarkup, /aqAddButton/)
  assert.doesNotMatch(source, /aqRegisterTitle|Logbook unit|Buka baris untuk meninjau atau melanjutkan catatan/)
  assert.match(source, /aria-label="Statistik catatan logbook"/)
  assert.ok(source.includes('.aqAuditWorkspace .aqGrid{grid-template-columns:minmax(220px,1.45fr) minmax(105px,.55fr) minmax(155px,.8fr) auto'))
})

test('Operational pharmacy and outpatient calculations live in Hasil Capaian, not Form Logbook', () => {
  const logbook = read('components/QualityIndicatorWorkspace.tsx')
  const results = read('components/QualityResultsWorkspace.tsx')
  assert.doesNotMatch(logbook, /pharmacyMetricSummary|outpatientClinicSummary|aqMetricsSummary|aqPharmacySummary|aqOutpatientSummary|Rekap operasional unit/)
  assert.match(results, /aggregatePharmacyMetric/)
  assert.match(results, /combinePharmacyMetric/)
  assert.match(results, /summarizeOutpatientClinics/)
  assert.match(results, /summarizeOutpatientIndicator/)
  assert.match(results, /Rekap capaian indikator Farmasi/)
  assert.match(results, /Rekap waktu tunggu Rawat Jalan per klinik/)
  assert.match(results, /form_fields:core_data->form_fields/)
  assert.match(results, /String\(row\.status \?\? ''\)\.toLowerCase\(\) === 'validated'/)
})
