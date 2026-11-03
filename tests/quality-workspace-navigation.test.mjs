import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('quality audit navigation keeps audit areas in the sidebar and moves views into workspace tabs', () => {
  const home = read('components/HomeClient.tsx')
  assert.match(home, /quality:\s*\[\s*\{id:'audit-indicators',label:'Audit Indikator Mutu'\}/)
  assert.doesNotMatch(home, /id:'result-indicators'|id:'logbook-indicators'/)
  assert.match(home, /aria-label="Tampilan audit mutu"/)
  assert.match(home, />Form Logbook<\/button>/)
  assert.match(home, />Hasil Capaian<\/button>/)
  assert.match(home, /setQualityResultsView\(mode\)/)
  assert.match(home, /if\(moduleId==='quality'\)return qualityResultsView==='pathway'\|\|clinicalPathwayOpen\?'audit-pathway'/)
})

test('every non-validator unit logbook exposes a guarded add-note action', () => {
  const quality = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(quality, /!isValidator&&roomId!=null&&<button[^>]*aqAddButton/)
  assert.doesNotMatch(quality, /!\(roomId===7\)|\[1,3,4,9,11,12\]/)
  assert.match(quality, /const newPatient=\(requestedRoomId\?:number/)
  assert.match(quality, /if\(!layout\)\{\s*setMessage\('Template logbook untuk unit ini belum tersedia/)
})

test('Solid White sidebar is compact on desktop while mobile remains single-column', () => {
  const css = read('app/aureka-solid-navigation.css')
  assert.match(css, /grid-template-columns:\s*248px minmax\(0, 1fr\) !important/)
  assert.match(css, /\.workspaceRoot:not\(\.sidebarIsCollapsed\)\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) !important/)
  assert.match(css, /\.qualityWorkspaceTabs/)
})

test('sidebar collapse is controlled by one hamburger next to search, without header arrows or close buttons', () => {
  const home = read('components/HomeClient.tsx')
  const css = read('app/aureka-solid-navigation.css')
  assert.match(home, /className="mobileMenuButton workspaceSidebarMenuButton"/)
  assert.match(home, /setSidebarCollapsed\(v=>!v\)/)
  assert.doesNotMatch(home, /className="sidebarToggle"|className="mobileSidebarClose"/)
  assert.match(css, /\.workspaceRoot\.sidebarIsCollapsed\s*\{\s*grid-template-columns:76px minmax\(0,1fr\)!important/)
  assert.match(css, /\.workspaceSidebarMenuButton/)
})
