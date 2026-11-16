import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('AUREKA navigation has independent primary and secondary active states', () => {
  const nav = read('components/navigation/UnifiedModuleNavigation.tsx')
  const home = read('components/HomeClient.tsx')
  assert.match(nav, /secondaryActiveId\?: string/)
  assert.match(nav, /onSubSelect\?: \(id: string\) => void/)
  assert.match(nav, /resolvedActiveId/)
  assert.match(nav, /resolvedSecondaryActiveId/)
  assert.match(nav, /workspaceNavigationGroupDivider/)
  assert.match(nav, /workspaceNavigationSubItems/)
  assert.match(nav, /workspaceNavigationSubOverflow/)
  assert.match(home, /const activeNavPrimaryId=activeNestedNavGroup\?\.id\|\|activeNavSelectedId/)
  assert.match(home, /const activeNavSecondaryId=activeNestedNavGroup\?activeNavSelectedId:''/)
  assert.ok(home.includes('activeId={activeNavPrimaryId}'))
  assert.ok(home.includes('secondaryActiveId={activeNavSecondaryId}'))
})

test('all navigation groups preserve the selected destination and use responsive overflow', () => {
  const nav = read('components/navigation/UnifiedModuleNavigation.tsx')
  assert.match(nav, /function overflowFor\(/)
  assert.match(nav, /item\.id === resolvedActiveId \|\| !hiddenIds\.includes\(item\.id\)/)
  assert.match(nav, /item\.id === resolvedSecondaryActiveId \|\| !hiddenSubIds\.includes\(item\.id\)/)
  assert.match(nav, /max-width: 720px/)
  assert.match(nav, /ResizeObserver/)
  assert.match(nav, /group\.scrollLeft = active\.offsetLeft/)
  assert.match(nav, /groups: Array<\[HTMLDivElement \| null, string\]>|groups: Array/)
  assert.match(nav, /aria-label=\{ariaLabel\}/)
  assert.match(nav, /aria-current=\{selected \? 'page' : undefined\}/)
  assert.match(nav, /onSubSelect \?\? onSelect/)
})

test('Patient Register tabs are promoted into the universal secondary navigation', () => {
  const home = read('components/HomeClient.tsx')
  const registry = read('components/PatientRegistryWorkspace.tsx')
  assert.match(home, /patients:\[\{id:'grp-register',label:'Register Pasien',children:\[\{id:'add',label:'Tambah Pasien'\},\{id:'records',label:'Rekapan Pasien'\}\]\}/)
  assert.match(home, /patientsRegistryTab,setPatientsRegistryTab/)
  assert.match(home, /registryTab=\{patientsRegistryTab\} onRegistryTabChange=\{setPatientsRegistryTab\}/)
  assert.match(home, /patientsRegistryTab==='records'\?'rekapan-pasien':'tambah-pasien'/)
  assert.match(registry, /registryTab\?: 'add' \| 'records'/)
  assert.match(registry, /onRegistryTabChange\?: \(tab: 'add' \| 'records'\) => void/)
  assert.match(registry, /const selectRegistryTab = \(next: 'add' \| 'records'\)/)
  assert.doesNotMatch(registry, /\{\(!section \|\| section === 'register'\) && <nav className="prTabs"/)
})

test('one final stylesheet normalizes tablists throughout workspace modules', () => {
  const layout = read('app/layout.tsx')
  const css = read('app/aureka-universal-tabs.css')
  assert.ok(layout.includes("import './aureka-universal-tabs.css'"))
  for (const selector of ['.workspaceViewTabList', '.prTabs', '.psTabs', '.rmTabs', '.aqTabs', '.qraTabs', '.mswTabs', '.mswDirectoryTabs', '[role="tablist"]']) {
    assert.ok(css.includes(selector), 'Missing universal tab selector ' + selector)
  }
  for (const token of ['#172a40', '#ffffff', '#dcebf8', '#164b7a', '#a0a8b2', '#edf3f8', '#397db5']) assert.ok(css.includes(token))
  assert.match(css, /data-mode="gelap"/)
  assert.match(css, /max-width: 720px/)
  assert.match(css, /prefers-reduced-motion: reduce/)
})

test('primary and secondary overflow menus stay independent and have no duplicate active tab', () => {
  const nav = read('components/navigation/UnifiedModuleNavigation.tsx')
  assert.match(nav, /className="workspaceNavigationOverflow"/)
  assert.match(nav, /className="workspaceNavigationOverflow workspaceNavigationSubOverflow"/)
  assert.match(nav, /className=\{'workspaceNavigationRailItem' \+ \(selected \? ' active' : ''\)\}/)
  assert.match(nav, /className=\{'workspaceNavigationSubItem' \+ \(selected \? ' active' : ''\)\}/)
})
