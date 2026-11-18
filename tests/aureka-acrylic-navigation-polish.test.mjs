import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('final Arktik navigation layer removes green sidebar states and the opaque logo tile', () => {
  const bundle = read('app/aureka-global.css')
  const css = read('app/aureka-acrylic-navigation-polish.css')
  assert.ok(bundle.endsWith("@import './aureka-acrylic-navigation-polish.css';\n"))
  assert.ok(bundle.indexOf("@import './aureka-navigation-repair.css'") < bundle.indexOf("@import './aureka-acrylic-navigation-polish.css'"))
  assert.ok(css.includes('--aureka-acrylic-sidebar: rgba(233, 242, 250, .92)'))
  assert.ok(css.includes('.sidebarDomainTrigger.navActive'))
  assert.ok(css.includes('background: #dceaf6 !important'))
  assert.ok(css.includes('.workspaceLogo::before'))
  assert.ok(css.includes('background: transparent !important'))
  assert.doesNotMatch(css, /#0f7656|#117653|#084f3a|#0c6244/i)
})

test('hamburger has an explicit visible stroke and collapsed sidebar has a consistent icon rail', () => {
  const css = read('app/aureka-acrylic-navigation-polish.css')
  assert.ok(css.includes('.workspaceSidebarMenuButton svg path'))
  assert.ok(css.includes('stroke: currentColor !important'))
  assert.ok(css.includes('stroke-width: 2 !important'))
  assert.ok(css.includes('grid-template-columns: 84px minmax(0, 1fr) !important'))
  assert.ok(css.includes('min-height: 46px !important'))
  assert.ok(css.includes('sidebarIsCollapsed'))
})

test('navigation rails and module tablists use fixed, flat compact geometry', () => {
  const css = read('app/aureka-acrylic-navigation-polish.css')
  assert.ok(css.includes('min-height: 42px !important'))
  assert.ok(css.includes('height: 34px !important'))
  assert.ok(css.includes('box-shadow: none !important'))
  assert.ok(css.includes('backdrop-filter: none !important'))
  assert.ok(css.includes('workspaceNavigationSubItems.hasPill::before'))
  assert.ok(css.includes('background: #dcebf8 !important'))
  assert.ok(css.includes('.moduleEnter :is('))
  assert.ok(css.includes('> [role="tab"]'))
})

test('mobile drawer restores full navigation labels even when desktop collapse state persists', () => {
  const css = read('app/aureka-acrylic-navigation-polish.css')
  assert.ok(css.includes('@media (max-width: 720px)'))
  assert.ok(css.includes('grid-template-areas: "menu ctx theme bell ai" "search search search search search"'))
  assert.ok(css.includes('display: revert !important'))
  assert.ok(css.includes('width: min(320px, calc(100vw - 48px)) !important'))
})
