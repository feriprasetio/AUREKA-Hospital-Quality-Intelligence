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

test('phone header reserves independent slots for the drawer, profile and search trigger', () => {
  const layout = read('app/aureka-canvas-preferences.css')
  const aurora = read('app/aurora.css')
  assert.match(layout, /"menu context context theme bell"\s+"profile profile nara inbox find"\s+"search search search search search"/)
  assert.doesNotMatch(read('components/HomeClient.tsx'), /workspacePresentationSlot|workspacePresentationTarget/)
  const repair = read('app/aureka-navigation-repair.css')
  assert.doesNotMatch(repair, /\.workspaceThemeButton[^{]*\{\s*display: none/)
  assert.doesNotMatch(aurora, /grid-template-areas: "ctx find theme bell ai"/)
})

test('collapsed desktop navigation hides button labels while phone drawers restore readable labels', () => {
  const css = read('app/aureka-navigation-system.css')
  assert.match(css, /sidebarIsCollapsed[\s\S]*?\.sidebarDomainTrigger > button > span/)
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*?sidebarIsCollapsed[\s\S]*?\.sidebarDomainTrigger > button > span/)
  assert.match(css, /\.sidebarDomainItems\[hidden\][\s\S]*?display: none !important/)
  assert.match(css, /\.sidebarDomainItems:not\(\[hidden\]\)[\s\S]*?display: grid !important/)
})

test('patient and clinical workspaces show contextual navigation for the selected sidebar module', () => {
  const home = read('components/HomeClient.tsx')
  for (const [id, label] of [
    ['icd', 'ICD-10'], ['los', 'Length of Stay'], ['readmisi', 'Readmisi'],
    ['audit-pathway', 'Form Clinical Pathway'], ['pathway-analysis', 'Analisis Clinical Pathway'],
    ['audit-clinical', 'Form Audit Klinis'], ['audit-death', 'Form Audit Kematian'],
  ]) assert.ok(home.includes(`id:'${id}',label:'${label}'`))
  assert.match(home, /if\(child==='realcost'\)return active==='clinical'&&realcostAuditOpen/)
  assert.match(home, /activeNavSelectedId=patientPatternTab/)
  assert.match(home, /activeNavSelectedId=qualityResultsView==='pathway'\?'pathway-analysis'/)
  assert.match(home, /onSubSelect=\{selectContextualTab\}/)
})

test('category sidebar controls retain accessible names and the active quality domain stays selected', () => {
  const home = read('components/HomeClient.tsx')
  assert.match(home, /aria-label=\{domain\.label\} title=\{domain\.label\} aria-expanded=\{isExpanded\}/)
  assert.match(home, /if\(child==='quality-overview'\)return active==='quality'&&!spmOpen&&!spoOpen/)
  assert.match(home, /aria-current=\{itemSelected\?'page':undefined\}/)
})


test('sidebar follows the active module when navigation changes outside the sidebar', () => {
  const home = read('components/HomeClient.tsx')
  assert.match(home, /useEffect\(\(\)=>\{if\(activeDomainId\)setExpandedDomain\(activeDomainId\)\},\[activeDomainId\]\)/)
})

test('selecting a destination closes the mobile drawer and canonical category triggers remain interactive', () => {
  const home = read('components/HomeClient.tsx')
  const start = home.indexOf('const selectDomainDestination=')
  const end = home.indexOf('const sidebarChildGroups=', start)
  const selector = home.slice(start, end)
  assert.match(selector, /mobileSidebar\.close\(\)/)
  const canonical = read('app/aureka-navigation-system.css')
  assert.match(canonical, /\.sidebarDomainTrigger\s*\{[\s\S]*pointer-events: auto !important/)
  assert.match(canonical, /\.sidebarDomainTrigger > button\s*\{[\s\S]*pointer-events: auto !important/)
})

test('desktop, tablet, and mobile shell keep the content column shrink-safe', () => {
  const css = read('app/aureka-navigation-system.css')
  assert.match(css, /grid-template-columns: 264px minmax\(0, 1fr\) !important/)
  assert.match(css, /@media \(min-width: 721px\) and \(max-width: 1180px\)/)
  assert.match(css, /@media \(min-width: 721px\) and \(max-width: 860px\)/)
  assert.match(css, /@media \(max-width: 720px\)/)
  assert.match(css, /\.workspaceContent[\s\S]*?min-width: 0 !important/)
})
