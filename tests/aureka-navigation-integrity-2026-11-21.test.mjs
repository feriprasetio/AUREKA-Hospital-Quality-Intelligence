import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('canonical responsive navigation stylesheet loads after all legacy navigation layers', () => {
  const bundle = read('app/aureka-global.css')
  const system = read('app/aureka-navigation-system.css')
  const pill = bundle.lastIndexOf("@import './aureka-navigation-pill.css';")
  const canonical = bundle.lastIndexOf("@import './aureka-navigation-system.css';")
  assert.ok(pill >= 0)
  assert.ok(canonical > pill)
  assert.match(system, /grid-template-columns: 264px minmax\(0, 1fr\) !important/)
  assert.match(system, /grid-template-columns: 84px minmax\(0, 1fr\) !important/)
})

test('mobile drawer has one coherent hidden/open transform state and a correctly layered scrim', () => {
  const css = read('app/aureka-navigation-system.css')
  assert.match(css, /@media \(max-width: 720px\)/)
  assert.match(css, /transform: translate3d\(-105%, 0, 0\) !important/)
  assert.match(css, /\.sidebar\.mobileOpen[\s\S]*?transform: translate3d\(0, 0, 0\) !important/)
  assert.match(css, /\.sidebar\.mobileOpen[\s\S]*?visibility: visible !important/)
  assert.match(css, /\.sidebar\.mobileOpen[\s\S]*?pointer-events: auto !important/)
  assert.match(css, /\.workspaceScrim\s*\{[\s\S]*?z-index: 1300 !important/)
  assert.match(css, /\.sidebar\.mobileOpen[\s\S]*?z-index: 1301 !important/)
  assert.match(css, /\.workspaceScrim\[data-open="false"\][\s\S]*?display: none !important/)
})

test('collapsed desktop navigation hides button labels while phone drawers restore readable labels', () => {
  const css = read('app/aureka-navigation-system.css')
  assert.match(css, /sidebarIsCollapsed[\s\S]*?\.sidebarDomainTrigger > button > span/)
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?sidebarIsCollapsed[\s\S]*?\.sidebarDomainTrigger > button > span/)
  assert.match(css, /\.sidebarDomainItems\[hidden\][\s\S]*?display: none !important/)
  assert.match(css, /\.sidebarDomainItems:not\(\[hidden\]\)[\s\S]*?display: grid !important/)
})

test('patient and clinical modules have explicit primary contextual tabs with synchronized active identifiers', () => {
  const home = read('components/HomeClient.tsx')
  assert.match(home, /const patientRailItems=\[/)
  assert.match(home, /const clinicalRailItems=\[/)
  assert.match(home, /const activeRailItems(?::\s*\{id:string;label:string;hint\?:string\}\[\])?=activeNavModuleId==='patients'\?patientRailItems:activeNavModuleId==='clinical'\?clinicalRailItems:/)
  assert.match(home, /const activeNavPrimaryId=activeNavModuleId==='patients'\?patientsRegistryTab:activeNavModuleId==='clinical'/)
  assert.match(home, /activeNavModuleId==='patients'\|\|activeNavModuleId==='clinical'\?'':activeNestedNavGroup/)
  assert.match(home, /activeNavGroups.length>0\|\|activeNavModuleId==='patients'\|\|activeNavModuleId==='clinical'/)
  assert.match(home, /if\(child==='realcost'\)return active==='clinical'&&realcostAuditOpen/)
  assert.match(home, /qualityResultsView==='pathway'/)
  assert.match(home, /qualityResultsView==='clinical-death'/)
})

test('category sidebar controls retain accessible names and the active quality domain stays selected', () => {
  const home = read('components/HomeClient.tsx')
  assert.match(home, /aria-label=\{domain\.label\} title=\{domain\.label\} aria-expanded=\{isExpanded\}/)
  assert.match(home, /if\(child==='quality-overview'\)return active==='quality'&&!spmOpen&&!spoOpen/)
  assert.match(home, /aria-current=\{itemSelected\?'page':undefined\}/)
})
