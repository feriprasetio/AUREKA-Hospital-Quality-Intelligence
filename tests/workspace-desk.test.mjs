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
    'FppeEvaluationWorkspace', 'StatisticsWorkspace', 'GeneralSettings',
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
  assert.match(quality, /className="workspaceSummary aqMetricsSummary"/)
  assert.match(quality, /className="aqRegisterActions"/)
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
  assert.match(oppe, /Skor bukan keputusan otomatis kewenangan klinis/)
  assert.match(oppe, /Indikator otomatis: wajib memiliki aturan atribusi aktif/)
  assert.match(css, /\.oppeHeaderNotes\.workspaceClinicalDisclaimer \{\s*display: flex !important;/)
  assert.match(css, /\.oppeHeaderNotes\.workspaceClinicalDisclaimer > span \{\s*display: inline !important;/)
})

test('OPPE filter summary wraps inside its grid instead of widening the document', () => {
  assert.match(css, /\.moduleEnter \.oppeFilterMeta \{\s*min-width: 0 !important; white-space: normal !important; overflow-wrap: anywhere;/)
})

test('overview matrix fits narrow cards without changing clinical band colors', () => {
  assert.match(css, /\.ovMatrixWrap \{ grid-template-columns: 16px minmax\(0, 1fr\) !important;/)
  assert.match(css, /\.ovMatrix \{ min-width: 0 !important; grid-template-columns: repeat\(5, minmax\(0, 1fr\)\) !important;/)
  assert.match(css, /@media \(max-width: 1000px\)[\s\S]*\.ovGrid \{ grid-template-columns: minmax\(0, 1fr\) !important;/)
})

test('settings destinations stay wired and keyboard tabs identify the active panel', () => {
  const settings = read('components/GeneralSettings.tsx')
  assert.match(settings, /className="settingsDestination"/)
  assert.doesNotMatch(settings, /placeholderCard|Light \/ AMOLED/)
  assert.match(settings, /<SettingsIcon kind=\{icon\}/)
  assert.match(settings, /event\.key === 'ArrowRight'/)
  assert.match(settings, /id="settings-active-panel" role="tabpanel"/)
  assert.match(settings, /aria-labelledby=\{'settings-tab-' \+ tab\}/)
  for (const operation of ['saveMe', 'changePassword', 'saveRoom', 'saveIdentity', 'provisionUnitAccounts']) {
    assert.ok(settings.includes(operation), operation)
  }
})

test('drawer breakpoint agrees with its controller and is dismissible from inside', () => {
  assert.match(read('components/layout/useAccessibleSidebar.ts'), /window\.innerWidth > 720/)
  assert.match(home, /window\.matchMedia\('\(max-width: 720px\)'\)/)
  assert.match(home, /className="workspaceDrawerClose"[^>]*onClick=\{mobileSidebar\.close\}/)
  assert.match(home, /data-sidebar-autofocus type="search"/)
})

test('every workbook importer traps focus and delegates Escape to its original busy-guarded close', () => {
  const importers = readdirSync(new URL('../components', import.meta.url)).filter(name => name.endsWith('ExcelImportDialog.tsx'))
  assert.equal(importers.length, 18)
  for (const file of importers) {
    const source = read('components/' + file)
    assert.match(source, /useAccessibleDialog<HTMLElement>\(\{open,onClose:close,lockScroll:true\}\)/, file)
    assert.match(source, /ref=\{importDialogRef\} tabIndex=\{-1\}/, file)
    assert.match(source, /if\s*\(parsing\s*\|\|\s*importing\)\s*return/, file)
  }
  assert.match(read('components/layout/useAccessibleDialog.ts'), /if \(lockScroll\) document\.body\.style\.overflow = previousBodyOverflow/)
})

test('density changes real cells and surfaces and print removes scroll caps', () => {
  assert.match(css, /--desk-cell-y: 10px/)
  assert.match(css, /--desk-cell-y: 6px/)
  assert.match(css, /\[data-density\] \.moduleEnter td \{ padding-block: var\(--desk-cell-y\)/)
  assert.match(css, /@media print[\s\S]*\.workspaceTableViewport \{ max-height: none !important; overflow: visible !important/)
})
