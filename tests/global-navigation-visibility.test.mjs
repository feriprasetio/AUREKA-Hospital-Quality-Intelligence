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

test('UnifiedModuleNavigation uses one measured, compact active pill implementation', () => {
  const layout = read('app/aureka-global.css')
  const component = read('components/navigation/UnifiedModuleNavigation.tsx')
  const pill = read('app/aureka-navigation-pill.css')
  const repair = read('app/aureka-navigation-repair.css')
  const acrylic = read('app/aureka-acrylic-navigation-polish.css')

  assert.ok(layout.indexOf("@import './aureka-global-navigation.css'") < layout.indexOf("@import './aureka-navigation-pill.css'"))
  assert.ok(layout.indexOf("@import './aureka-layout-integrity.css'") < layout.lastIndexOf("@import './aureka-navigation-pill.css'"))
  assert.match(component, /classList\.add\('hasPill'\)/)
  assert.match(component, /const boxRect = box\.getBoundingClientRect\(\)/)
  assert.match(component, /const activeRect = active\.getBoundingClientRect\(\)/)
  assert.match(component, /activeRect\.left - boxRect\.left \+ box\.scrollLeft/)
  assert.match(component, /activeRect\.top - boxRect\.top \+ box\.scrollTop/)
  assert.match(component, /activeRect\.width/)
  assert.match(component, /activeRect\.height/)
  assert.doesNotMatch(component, /active\.offsetLeft - box\.scrollLeft/)
  assert.match(pill, /\.workspaceNavigationRailItems\.hasPill::before/)
  assert.match(pill, /\.workspaceNavigationSubItems\.hasPill::before/)
  assert.match(pill, /height: 32px !important/)
  assert.match(pill, /max-height: 32px !important/)
  assert.match(pill, /prefers-reduced-motion: reduce/)
  assert.doesNotMatch(repair, /\.workspaceNavigation(?:Rail|Sub)Items\.hasPill/)
  assert.doesNotMatch(acrylic, /\.workspaceNavigation(?:Rail|Sub)Items\.hasPill/)
  assert.match(component, /document\.fonts\?\.ready/)
  assert.match(component, /max-width: 860px/)
})
