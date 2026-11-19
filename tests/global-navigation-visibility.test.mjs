import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('global navigation module identity chip remains visible above contextual tabs', () => {
  const globalNavigation = read('app/aureka-global-navigation.css')
  assert.ok(globalNavigation.includes('.workspaceNavigationRail .workspaceNavigationRailTitle {'))
  assert.ok(globalNavigation.includes('display: inline-flex !important;'))
  assert.ok(globalNavigation.includes('visibility: visible !important;'))
  assert.ok(globalNavigation.includes('background: #172a40 !important;'))
})

test('UnifiedModuleNavigation renders the measured moving active pill in production styles', () => {
  const layout = read('app/aureka-global.css')
  const component = read('components/navigation/UnifiedModuleNavigation.tsx')
  const pill = read('app/aureka-navigation-pill.css')

  assert.ok(layout.indexOf("@import './aureka-global-navigation.css'") < layout.indexOf("@import './aureka-navigation-pill.css'"))
  assert.ok(layout.indexOf("@import './aureka-layout-integrity.css'") < layout.lastIndexOf("@import './aureka-navigation-pill.css'"))
  assert.match(component, /classList\.add\('hasPill'\)/)
  assert.match(component, /--pill-x/)
  assert.match(component, /--pill-w/)
  assert.match(pill, /html\[data-skin=\"arktik\"\] body \.workspaceRoot\.workspaceDesk\[data-aureka-theme\] \.workspaceNavigationRailItems\.hasPill::before/)
  assert.match(pill, /\.workspaceNavigationRailItems\.hasPill\.pillReady::before/)
  assert.match(pill, /prefers-reduced-motion: reduce/)
  assert.match(repair, /\.workspaceNavigationSubItems\.hasPill::before/)
  assert.match(repair, /\.workspaceNavigationSubItem\.active/)
  assert.match(repair, /overflow-x: auto !important/)
  assert.match(component, /active\.offsetLeft - box\.scrollLeft/)
  assert.match(component, /document\.fonts\?\.ready/)
  assert.match(component, /max-width: 860px/)
})
