import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('header menu is before hospital context and search controls are separate siblings', () => {
  const home = read('components/HomeClient.tsx')
  const start = home.indexOf('<header className="workspaceHeaderBar">')
  const end = home.indexOf('</header>', start)
  const header = home.slice(start, end)
  const menu = header.indexOf('className="mobileMenuButton workspaceSidebarMenuButton"')
  const context = header.indexOf('className="workspaceContext"')
  const search = header.indexOf('className="workspaceGlobalSearch"')
  assert.ok(menu >= 0 && context > menu, 'hamburger must be left of hospital context')
  assert.ok(search > context, 'search must follow hospital context')
  assert.equal(header.includes('<CommandPalette'), false, 'module search trigger is removed from the header')
})

test('header layout prevents overlap on desktop and narrow screens', () => {
  const css = read('app/aureka-navigation-repair.css')
  const bundle = read('app/aureka-global.css')
  assert.ok(bundle.includes("@import './aureka-navigation-repair.css';"))
  assert.ok(css.includes('.sidebarDomainTrigger'))
  assert.ok(css.includes('.sidebarDomainItems'))
  assert.ok(css.includes('.sidebarDomainItem.active'))
  assert.match(css, /\.workspaceHeaderBar\s*\{[\s\S]*display: flex !important;[\s\S]*flex-wrap: nowrap !important/)
  assert.match(css, /\.workspaceSidebarMenuButton\s*\{\s*order: 0 !important/)
  assert.match(css, /\.workspaceContext\s*\{\s*order: 1 !important/)
  assert.match(css, /\.workspaceGlobalSearch\s*\{\s*order: 3 !important/)
  assert.match(css, /\.workspaceHeaderBar > \.workspaceNaraButton\s*\{ order: 4 !important; \}/)
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.workspaceGlobalSearch\s*\{[\s\S]*min-width: 64px !important/)
})

test('sidebar redesign retains desktop and mobile navigation behavior', () => {
  const css = read('app/aureka-navigation-repair.css')
  assert.match(css, /grid-template-columns: 264px minmax\(0, 1fr\) !important/)
  assert.match(css, /\.sidebarDomainNav\s*\{[\s\S]*display: flex !important/)
  assert.match(css, /\.sidebarIsCollapsed\s*\{\s*grid-template-columns: 76px minmax\(0, 1fr\) !important/)
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*display: block !important;[\s\S]*\.sidebar\.mobileOpen/)
})

test('mobile drawer and bottom navigation share one breakpoint with no 721–760px dead zone', () => {
  const responsive = read('app/layout-responsive.css')
  const mobileNav = read('app/mobile-nav.css')
  const home = read('components/HomeClient.tsx')

  assert.match(responsive, /@media \(max-width: 720px\)\s*\{\s*\.workspaceRoot\s*\{/)
  assert.doesNotMatch(responsive, /@media \(max-width: 760px\)/)
  assert.match(mobileNav, /@media \(max-width: 720px\)/)
  assert.match(home, /matchMedia\('\(max-width: 720px\)'\)/)
})
