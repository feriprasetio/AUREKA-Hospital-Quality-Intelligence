import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const home = read('components/HomeClient.tsx')
const css = read('app/workspace-desk.css')

test('workbench integration is authenticated-only and loads after the legacy cascade', () => {
  const layout = read('app/layout.tsx')
  assert.ok(layout.indexOf("./workspace-desk.css") > layout.indexOf("./aureka-refined.css"))
  assert.match(home, /if\(view==='workspace'\)return <main[^>]*workspaceRoot workspaceDesk/)
  assert.doesNotMatch(css, /\.a2-|\.authPage|\.publicLanding/)
  assert.doesNotMatch(css, /\.lvl-|data-band|--aureka-risk-/)
})

test('phone frame reset has the same specificity as the desktop grid', () => {
  assert.match(css, /workspaceDesk\[data-aureka-theme\][\s\S]*grid-template-columns: 224px minmax\(0, 1fr\)/)
  const phone = css.slice(css.indexOf('@media (max-width: 720px)'))
  assert.match(phone, /html\[data-theme\] \.workspaceRoot\.workspaceDesk\[data-aureka-theme\],[\s\S]*display: block !important/)
  assert.match(phone, /workspaceDesk\[data-aureka-theme\]\.sidebarIsCollapsed/)
  assert.match(css, /\.workspaceContent[\s\S]*max-height: none !important/)
})

test('context navigation reuses authorized sidebar destinations and includes a native phone selector', () => {
  assert.match(home, /contextNavigation=sidebarChildGroups\[active\]\?\?\[\]/)
  assert.match(home, /className="workspaceContextNav"/)
  assert.match(home, /aria-current=\{selectedSidebarChild\(active\)===child\.id\?'page':undefined\}/)
  assert.match(home, /className="workspaceContextSelect"/)
  assert.match(home, /value=\{selectedSidebarChild\(active\)\}/)
  assert.match(home, /onChange=\{event=>selectSidebarChild\(active,event\.target\.value\)\}/)
  assert.match(home, /workspaceSkipLink/)
  assert.match(home, /id="workspace-main-content" tabIndex=\{-1\}/)
})

test('submodule navigation participates in history without discarding legacy quality paths', () => {
  assert.match(home, /const \[modulePath,section\]=path\.split\('\/'\)/)
  assert.match(home, /requiredRoles\.includes\(\(role\|\|''\) as AurekaRole\)/)
  assert.match(home, /if\(section\)hash\+='\/'\+section/)
  assert.match(home, /audit-indikator\|clinical-pathway\|audit-klinis-dan-kematian/)
  assert.match(home, /window\.addEventListener\('hashchange',onHashChange\)/)
  for (const [module, setter] of [['PatientSafetyWorkspace', 'setSafetyTab'], ['RiskManagementWorkspace', 'setRiskTab']]) {
    assert.match(read(`components/${module}.tsx`), /onTabChange\?\.\(tab\)/)
    assert.ok(home.includes(`onTabChange={${setter}}`))
  }
})

test('operational modules use the same small header while retaining their own actions', () => {
  const header = read('components/workspace/WorkspaceModuleHeader.tsx')
  assert.match(header, /<details className="workspaceModuleGuide">/)
  assert.match(header, /<h2>\{title\}<\/h2>/)
  assert.match(header, /\{actions\}/)
  assert.doesNotMatch(header, /fetch\(|localStorage|supabase/i)
  for (const name of [
    'OverviewDashboard', 'QualityResultsWorkspace', 'ClinicalPathwayWorkspace',
    'ClinicalDeathAuditWorkspace', 'PatientSafetyWorkspace', 'RiskManagementWorkspace',
    'StaffDirectoryWorkspace', 'StaffTeamWorkspace', 'OppeAuditWorkspace',
    'FppeEvaluationWorkspace', 'StatisticsWorkspace', 'GeneralSettings', 'QualitySettings',
  ]) {
    assert.ok(read(`components/${name}.tsx`).includes('<WorkspaceModuleHeader'), name)
  }
})

test('table regions measure actual column overflow and provide keyboard and button access', () => {
  const table = read('components/workspace/WorkspaceTableViewport.tsx')
  assert.match(table, /new ResizeObserver\(measure\)/)
  assert.match(table, /viewport\.scrollLeft \+ viewport\.clientWidth < viewport\.scrollWidth - 1/)
  assert.match(table, /viewport\.scrollBy\(/)
  assert.match(table, /role="region"/)
  assert.match(table, /tabIndex=\{0\}/)
  assert.match(table, /disabled=\{!edges\.left\}/)
  assert.match(table, /disabled=\{!edges\.right\}/)
  assert.match(table, /prefers-reduced-motion/)
  assert.match(table, /observer\.disconnect\(\)/)
  assert.match(table, /removeEventListener\('scroll', measure\)/)
  assert.doesNotMatch(table, /localStorage|sessionStorage/)
  for (const name of [
    'QualityIndicatorWorkspace', 'QualityResultsWorkspace', 'ClinicalPathwayWorkspace',
    'ClinicalDeathAuditWorkspace', 'PatientSafetyWorkspace', 'RiskManagementWorkspace',
    'StaffDirectoryWorkspace', 'StatisticsWorkspace',
  ]) {
    assert.ok(read(`components/${name}.tsx`).includes('<WorkspaceTableViewport'), name)
  }
})

test('logbook table cannot collapse to a viewport subtraction or hide its retry action', () => {
  assert.match(css, /\.aqTable \.aqWrap[\s\S]*min-height: min\(280px, 45dvh\)/)
  assert.match(css, /max-height: min\(64dvh, 740px\)/)
  const quality = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(quality, /title="Logbook belum dapat dimuat"/)
  assert.match(quality, /onRetry=\{\(\)=>void load\(\)\}/)
  assert.match(quality, /className="aqTableFooter"/)
  assert.match(quality, /filtered\.length\} dari \{yearPatients\.length/)
  assert.doesNotMatch(quality, /aqMetricsSummary|aqPharmacySummary|aqOutpatientSummary|Rekap operasional unit|pharmacyMetricSummary|outpatientClinicSummary/)
  assert.doesNotMatch(quality, /className="aqRegisterActions"/)
  assert.match(quality, /className="aqFilterActions"/)
  const results = read('components/QualityResultsWorkspace.tsx')
  assert.match(results, /Rekap capaian indikator Farmasi/)
  assert.match(results, /Rekap waktu tunggu Rawat Jalan per klinik/)
  assert.match(quality, /className="aqRegisterSummary"/)
  assert.match(quality, /if\(e\.target!==e\.currentTarget\)return/)
  for (const contract of ['save_quality_logbook', 'archive_quality_logbook', 'responseComplete', 'monthlyReview', 'loadedImportDialogs']) {
    assert.ok(quality.includes(contract), contract)
  }
})

test('clinical interpretation disclaimers stay visible outside optional guides', () => {
  const death = read('components/ClinicalDeathAuditWorkspace.tsx')
  const oppe = read('components/OppeAuditWorkspace.tsx')
  assert.match(death, /className="workspaceClinicalDisclaimer" role="note">Penilaian bukan penetapan kesalahan individu/)
  assert.match(oppe, /workspaceClinicalDisclaimer" role="note"/)
  assert.match(oppe, /Skor OPPE bukan keputusan otomatis tentang kewenangan klinis/)
  assert.match(oppe, /Indikator otomatis hanya dinilai bila atribusi profesi telah ditetapkan/)
  assert.match(css, /\.oppeHeaderNotes\.workspaceClinicalDisclaimer \{\s*display: flex !important;/)
  assert.match(css, /\.oppeHeaderNotes\.workspaceClinicalDisclaimer > span \{\s*display: inline !important;/)
})

test('OPPE filter summary wraps inside its grid instead of widening the document', () => {
  assert.match(css, /\.moduleEnter \.oppeFilterMeta \{\s*min-width: 0 !important; white-space: normal !important; overflow-wrap: anywhere;/)
  assert.match(css, /@media \(max-width: 1100px\) \{[\s\S]*\.oppeWorkGrid \{ grid-template-columns: minmax\(0, 1fr\) !important;/)
  assert.match(css, /\.oppeAside \{ grid-template-columns: minmax\(0, 1fr\) !important; position: static !important;/)
})

test('overview matrix fits narrow cards without changing clinical band colors', () => {
  assert.match(css, /\.ovMatrixWrap \{ grid-template-columns: 16px minmax\(0, 1fr\) !important;/)
  assert.match(css, /\.ovMatrix \{ min-width: 0 !important; grid-template-columns: repeat\(5, minmax\(0, 1fr\)\) !important;/)
  assert.match(css, /@media \(max-width: 1000px\)[\s\S]*\.ovGrid \{ grid-template-columns: minmax\(0, 1fr\) !important;/)
})

test('settings destinations stay wired and keyboard tabs identify the active panel', () => {
  const settings = read('components/GeneralSettings.tsx')
  assert.match(settings, /className=\{'stNavItem settingsDestination'/)
  assert.match(settings, /aria-current=\{current \? 'page' : undefined\}/)
  assert.match(settings, /id=\{t \? 'settings-tab-' \+ t : undefined\}/)
  assert.doesNotMatch(settings, /placeholderCard|Light \/ AMOLED/)
  assert.match(settings, /<SettingsIcon kind=\{icon\}/)
  assert.match(read('components/workspace/WorkspaceTabs.tsx'), /event\.key === 'ArrowRight'/)
  assert.match(settings, /id="settings-active-panel" role="tabpanel"/)
  assert.match(settings, /aria-labelledby=\{'settings-tab-' \+ tab\}/)
  for (const operation of ['saveMe', 'changePassword', 'saveRoom', 'saveIdentity']) {
    assert.ok(settings.includes(operation), operation)
  }
})

test('shared workspace tabs provide keyboard links and the same native phone destinations', () => {
  const tabs = read('components/workspace/WorkspaceTabs.tsx')
  for (const key of ['ArrowRight', 'ArrowLeft', 'Home', 'End']) assert.ok(tabs.includes(`event.key === '${key}'`))
  assert.match(tabs, /role="tablist"/)
  assert.match(tabs, /tabIndex=\{value === item\.value \? 0 : -1\}/)
  assert.match(tabs, /aria-controls=\{value === item\.value \? panelId : undefined\}/)
  assert.match(tabs, /className="workspaceViewTabMobile"/)
  assert.match(tabs, /items\.map\(item => <option/)
  assert.match(tabs, /if \(item\) onChange\(item\.value\)/)
  // GeneralSettings memakai menu samping (stNav) dengan aria-current, bukan WorkspaceTabs
  for (const module of ['OppeAuditWorkspace', 'QualitySettings']) {
    assert.ok(read(`components/${module}.tsx`).includes('<WorkspaceTabs'), module)
  }
  assert.match(css, /\.workspaceActivePanel \{ display: grid; grid-template-columns: minmax\(0, 1fr\);/)
  assert.match(css, /\.workspaceActivePanel > \* \{ min-width: 0; \}/)
})

test('Clinical Pathway master data is database-backed while its audit layout remains responsive', () => {
  const cp = read('components/ClinicalPathwayWorkspace.tsx')
  assert.match(cp, /from\('clinical_pathway_templates'\)\.select\('\*'\)\.order\('name'\)/)
  assert.doesNotMatch(cp, /clinical-pathway-catalog-|fetchCatalog|normalizeCatalog/)
  assert.match(cp, /'--cp-audit-width': `\$\{460 \+ checklistDays\.length \* 84\}px`/)
  assert.match(css, /@media screen \{[\s\S]*\.cpAuditTable \{ width: max\(100%, var\(--cp-audit-width\)\)/)
  assert.match(cp, /minWidth: 0, tableLayout: 'fixed' \} as CSSProperties/)
  assert.match(cp, /100 - checklistDays\.length \* 4/)
  assert.match(css, /tr:hover td:not\(\.cpCell\):not\(\.cpBuilderScheduleCell\)/)
  assert.match(css, /\.cpCell\.required \{ background: rgba\(145, 203, 81, \.25\) !important;/)
  assert.match(css, /\.cpCell\.conditional \{ background: rgba\(255, 225, 53, \.28\) !important;/)
  assert.match(css, /\.cpChoiceToggle input\[type="checkbox"\] \{ width: 16px !important; min-width: 16px !important;/)
  assert.match(css, /\.cpScoreGrid \{ display: grid !important; grid-template-columns: repeat\(4, minmax\(0, 1fr\)\)/)
  assert.match(css, /\.cpScoreGrid \.cpScore small \{ display: block !important;/)
  assert.match(css, /@media screen and \(max-width: 1100px\)[\s\S]*\.cpScoreGrid \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
})

test('FPPE prioritizes the full-width form while keeping its archive and original actions', () => {
  const fppe = read('components/FppeEvaluationWorkspace.tsx')
  const html = read('public/fppe-digital.html')
  assert.match(fppe, /className="workspaceSummary fppeHistorySummary"/)
  assert.match(fppe, /className="fppeUnitChoice"/)
  assert.match(fppe, /onClick=\{\(\) => exportFppePdf\(record\)\}/)
  assert.match(fppe, /onClick=\{\(\) => openEvaluation\(record\)\}/)
  assert.match(css, /\.fppeLayout \{ grid-template-columns: minmax\(0, 1fr\) !important;/)
  assert.match(html, /for="staffPicker"/)
  assert.match(html, /for="profession"/)
  assert.match(html, /role="region" aria-label="Penilaian kompetensi FPPE"/)
  for (const contract of ['AUREKA_FPPE_INIT', 'AUREKA_FPPE_SAVE_RESULT', 'AUREKA_FPPE_RESIZE']) assert.ok(fppe.includes(contract), contract)
})

test('FPPE save and submit controls compile and call the existing validated bridge', () => {
  const markup = read('public/fppe-digital.html').split('<script>')[0]
  const handlers = Array.from(markup.matchAll(/onclick="([^"]*)"/g), match => match[1])
  assert.equal(handlers.length, 5)
  for (const handler of handlers) assert.doesNotThrow(() => new Function('event', handler), handler)
  assert.ok(handlers.includes("saveToServer('draft')"))
  assert.ok(handlers.includes("saveToServer('submitted')"))
})

test('drawer breakpoint agrees with its controller and is dismissible from inside', () => {
  assert.match(read('components/layout/useAccessibleSidebar.ts'), /window\.innerWidth > 720/)
  assert.match(home, /window\.matchMedia\('\(max-width: 720px\)'\)/)
  assert.match(home, /className="workspaceDrawerClose"[^>]*onClick=\{mobileSidebar\.close\}/)
  assert.match(home, /workspaceGlobalSearchInput/)
  assert.doesNotMatch(home, /data-sidebar-autofocus|sidebarSearch|Cari menu/)
  assert.match(home, /<nav className="sidebarNav" aria-label="Navigasi utama AUREKA">/)
})

test('every workbook importer traps focus and delegates Escape to its original busy-guarded close', () => {
  const importers = readdirSync(new URL('../components', import.meta.url)).filter(name => name.endsWith('ExcelImportDialog.tsx'))
  assert.equal(importers.length, 20)
  for (const file of importers) {
    const source = read('components/' + file)
    assert.match(source, /useAccessibleDialog<HTMLElement>\(\{open,onClose:close,lockScroll:true\}\)/, file)
    assert.match(source, /ref=\{importDialogRef\} tabIndex=\{-1\}/, file)
    assert.match(source, /if\s*\(parsing\s*\|\|\s*importing\)\s*return/, file)
  }
  assert.match(read('components/layout/useAccessibleDialog.ts'), /if \(lockScroll\) document\.body\.style\.overflow = previousBodyOverflow/)
})

test('primary quality workspace exposes workbook imports without patient-episode-only read mode', () => {
  const quality = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(home, /<QualityIndicatorWorkspace[\s\S]*?showWorkbookImportButtons=\{true\}/)
  assert.match(quality, /\(patientRegistryMode\|\|showWorkbookImportButtons\)&&!isValidator/)
  assert.match(quality, /if\(patientRegistryMode\)rq=rq\.eq\('measurement_grain','patient_episode'\)/)
  assert.match(quality, /else if\(id===2\)openImportDialog\('it'\)/)
  assert.match(quality, /Number\(roomId\)===2/)
})

test('page header exposes no comfortable/compact density control', () => {
  const home = read('components/HomeClient.tsx')
  const desk = read('app/workspace-desk.css')
  assert.doesNotMatch(home, /workspaceDensityToggle|workspaceDensityControl|setDensity|const \[density,|>Nyaman<|>Ringkas</)
  assert.match(home, /data-density="comfortable"/)
  assert.match(desk, /workspaceDensityToggle/)
  assert.match(desk, /button\[title\*="nyaman" i\]/)
})

test('logbook filters and workbook actions use separate grid rows with non-shrinking controls', () => {
  const quality = read('components/QualityIndicatorWorkspace.tsx')
  const desk = read('app/workspace-desk.css')
  assert.match(quality, /grid-template-areas:"unit year month" "actions actions actions"/)
  assert.match(quality, /\.aqFilterActions\{grid-column:1\/-1;grid-row:2/)
  assert.match(quality, /\.aqFilterActions>button\{flex:0 0 auto;width:auto;min-width:max-content/)
  assert.match(quality, /grid-template-areas:"unit unit" "year month" "actions actions"/)
  assert.match(desk, /grid-template-areas: "unit year month" "actions actions actions" !important/)
  assert.match(desk, /min-width: max-content !important/)
  assert.match(desk, /workspaceDensityToggle/)
  assert.doesNotMatch(quality, /<div className="aqFilterActions">[\s\S]{0,500}<button[^>]*style=\{\{[^}]*flex/)
})

test('density changes real cells and surfaces and print removes scroll caps', () => {
  assert.match(css, /--desk-cell-y: 10px/)
  assert.match(css, /--desk-cell-y: 6px/)
  assert.match(css, /\[data-density\] \.moduleEnter td \{ padding-block: var\(--desk-cell-y\)/)
  assert.match(css, /@media print[\s\S]*\.workspaceTableViewport \{ max-height: none !important; overflow: visible !important/)
  assert.match(css, /@media print[\s\S]*\.workspaceTableFrame \{ overflow: visible !important/)
})


test('Magic UI-inspired overview treatment stays inside the authenticated AUREKA design system', () => {
  const overview = read('components/OverviewDashboard.tsx')
  assert.match(overview, /className=\{\`ovKpi magicKpi/)
  assert.match(overview, /className="magicKpiGlow" aria-hidden="true"/)
  assert.match(overview, /className="magicKpiSweep" aria-hidden="true"/)
  assert.match(overview, /aria-label=\{\`\$\{label\}: \$\{displayValue\}\`\}/)
  assert.match(overview, /className="ovPanel magicPanel"/)
  assert.match(css, /\.moduleEnter \.magicKpi:not\(:disabled\):hover/)
  assert.match(css, /@keyframes aurekaMagicSweep/)
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*\.magicKpiSweep/)
  assert.doesNotMatch(css, /\.publicRoot[^\n]*magicKpi|\.authPage[^\n]*magicKpi/)
})

test('Magic UI-inspired effects do not add animation dependencies to the production bundle', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.dependencies?.['motion'], undefined)
  assert.equal(pkg.dependencies?.['framer-motion'], undefined)
})
