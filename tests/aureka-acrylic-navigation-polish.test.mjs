
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('authoritative Arctic layout layer resolves shell and navigation geometry across breakpoints', () => {
  const bundle = read('app/aureka-global.css')
  const css = read('app/aureka-layout-integrity.css')
  assert.ok(bundle.indexOf("@import './aureka-layout-integrity.css';") < bundle.lastIndexOf("@import './aureka-navigation-pill.css';"))
  assert.ok(css.includes('grid-template-columns: 264px minmax(0, 1fr) !important'))
  assert.ok(css.includes('grid-template-columns: 238px minmax(0, 1fr) !important'))
  assert.ok(css.includes('grid-template-columns: 210px minmax(0, 1fr) !important'))
  assert.ok(css.includes('"menu context nara inbox theme bell profile"'))
  assert.ok(css.includes('"search search search search search search search"'))
  assert.ok(css.includes('"menu context context theme bell"'))
  assert.ok(css.includes('"profile profile nara inbox find"'))
  assert.ok(css.includes('"title primary primaryOverflow"'))
  assert.ok(css.includes('"secondary secondary secondaryOverflow"'))
  assert.ok(css.includes('details.workspaceNavigationOverflow:not([open]) > .workspaceNavigationOverflowMenu'))
  assert.ok(css.includes('.workspacePageHint > span'))
  assert.ok(css.includes('overflow-wrap: anywhere !important'))
  assert.ok(css.includes('> aside.sidebar.mobileOpen'))
  assert.ok(css.includes('> .workspaceContent'))
  assert.ok(css.includes('.settingsWorkspace .stLayout'))
  assert.ok(css.includes('grid-template-columns: minmax(210px, 240px) minmax(0, 1fr) !important'))
  assert.ok(css.includes('.settingsWorkspace .stNavItem.on'))
  assert.ok(css.includes('@media (max-width: 900px)'))
  assert.ok(css.includes('overflow-x: auto !important'))
})

test('final Arktik navigation layer removes green sidebar states and the opaque logo tile', () => {
  const bundle = read('app/aureka-global.css')
  const css = read('app/aureka-acrylic-navigation-polish.css')
  assert.ok(bundle.includes("@import './aureka-acrylic-navigation-polish.css';") && bundle.indexOf("@import './aureka-acrylic-navigation-polish.css';") < bundle.indexOf("@import './aureka-layout-integrity.css';"))
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
  const pill = read('app/aureka-navigation-pill.css')
  assert.ok(css.includes('min-height: 42px !important'))
  assert.ok(css.includes('height: 34px !important'))
  assert.ok(css.includes('box-shadow: none !important'))
  assert.ok(css.includes('backdrop-filter: none !important'))
  assert.ok(pill.includes('workspaceNavigationSubItems.hasPill::before'))
  assert.ok(pill.includes('background: #dcebf8 !important'))
  assert.ok(pill.includes('height: 32px !important'))
  assert.ok(css.includes('.moduleEnter :is('))
  assert.ok(css.includes('> [role="tab"]'))
})

test('mobile drawer restores full navigation labels even when desktop collapse state persists', () => {
  const css = read('app/aureka-acrylic-navigation-polish.css')
  assert.ok(css.includes('@media (max-width: 720px)'))
  assert.ok(css.includes('grid-template-areas: "menu ctx theme bell ai" "search search search search search"'))
  assert.ok(css.includes('.sidebarDomainItems {'))
  assert.ok(css.includes('display: grid !important'))
  assert.ok(css.includes('width: min(320px, calc(100vw - 48px)) !important'))
})

test('overflow navigation items stay hidden until their disclosure menu is opened', () => {
  const globalNavigation = read('app/aureka-global-navigation.css')
  const repair = read('app/aureka-navigation-repair.css')
  const declarationsFor = (css, selector) => {
    const start = css.indexOf(selector)
    assert.notEqual(start, -1, 'Missing CSS rule: ' + selector)
    const open = css.indexOf('{', start)
    const close = css.indexOf('}', open)
    return css.slice(open + 1, close)
  }

  assert.ok(globalNavigation.includes('.workspaceRoot details.workspaceNavigationOverflow:not([open]) > .workspaceNavigationOverflowMenu {'))
  assert.ok(globalNavigation.includes('.workspaceRoot details.workspaceNavigationOverflow[open] > .workspaceNavigationOverflowMenu {'))
  assert.ok(repair.includes('details.workspaceNavigationOverflow:not([open]) > .workspaceNavigationOverflowMenu {'))
  assert.ok(repair.includes('details.workspaceNavigationOverflow[open] > .workspaceNavigationOverflowMenu {'))

  const globalBase = declarationsFor(globalNavigation, '.workspaceRoot .workspaceNavigationOverflowMenu {')
  const globalArktik = declarationsFor(globalNavigation, '.workspaceNavigationRail .workspaceNavigationOverflowMenu {')
  const repairBase = declarationsFor(repair, '.workspaceNavigationOverflowMenu {')
  for (const declarations of [globalBase, globalArktik, repairBase]) {
    assert.ok(!declarations.includes('display: grid !important'), 'Closed dropdown content must not be forced into view')
  }
})
test('profile identity remains separated and bounded in compact workspace headers', () => {
  const css = read('app/aureka-acrylic-navigation-polish.css')
  assert.ok(css.includes('.workspaceHeaderProfileText {'))
  assert.ok(css.includes('grid-template-columns: minmax(0, 1fr) !important'))
  assert.ok(css.includes('.workspaceHeaderProfileText b,'))
  assert.ok(css.includes('text-overflow: ellipsis !important'))
  assert.ok(css.includes('@media (min-width: 721px) and (max-width: 1180px)'))
  assert.ok(css.includes('workspaceFullscreenButton'))
})

test('workspace navigation rails constrain tab widths without clipping the active content area', () => {
  const css = read('app/aureka-acrylic-navigation-polish.css')
  assert.ok(css.includes('.workspaceNavigationRailItems,'))
  assert.ok(css.includes('min-width: max-content !important'))
  assert.ok(css.includes('overflow-x: auto !important'))
  assert.ok(css.includes('.workspacePageHint > span'))
  assert.ok(css.includes('overflow-wrap: anywhere !important'))
})
