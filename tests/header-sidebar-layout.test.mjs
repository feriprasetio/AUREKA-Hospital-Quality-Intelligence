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
  const acrylic = read('app/aureka-acrylic-navigation-polish.css')
  const bundle = read('app/aureka-global.css')
  assert.ok(bundle.includes("@import './aureka-navigation-repair.css';"))
  assert.ok(bundle.endsWith("@import './aureka-acrylic-navigation-polish.css';\n"))
  assert.ok(acrylic.includes('.workspaceSidebarMenuButton svg path'))
  assert.ok(acrylic.includes('stroke: currentColor !important'))
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


test('workspace account identity has no generated initials and always renders the complete display name', () => {
  const home = read('components/HomeClient.tsx')
  const settings = read('components/GeneralSettings.tsx')
  const headerStart = home.indexOf('<header className="workspaceHeaderBar">')
  const headerEnd = home.indexOf('</header>', headerStart)
  const header = home.slice(headerStart, headerEnd)
  assert.doesNotMatch(home, /const initials=/)
  assert.doesNotMatch(header, /workspaceHeaderAvatar|initials\(/)
  assert.match(header, /workspaceHeaderProfileText"><b>\{profile\?\.full_name\|\|user\?\.email\|\|'Pengguna'\}<\/b>/)
  assert.doesNotMatch(settings, /className="stAvatar(?: lg)?"/)
  assert.doesNotMatch(settings, /slice\(0, 2\)\.map\(w => w\[0\]\)/)
})

test('final workspace header has full-name wrapping and explicit tablet/mobile grid layouts', () => {
  const css = read('app/aureka-acrylic-navigation-polish.css')
  const finalShell = css.slice(css.indexOf('Final workspace shell correction'))
  assert.match(finalShell, /workspaceHeaderProfileText b,[\s\S]*white-space: normal !important/)
  assert.match(finalShell, /text-overflow: clip !important/)
  assert.match(finalShell, /@media \(min-width: 721px\) and \(max-width: 860px\)/)
  assert.match(finalShell, /grid-template-areas:[\s\S]*"menu context nara inbox theme bell profile"/)
  assert.match(finalShell, /@media \(max-width: 720px\)/)
  assert.match(finalShell, /"profile profile nara inbox \."/)
  assert.match(finalShell, /workspaceFullscreenButton/)
  assert.match(finalShell, /Workspace content containment/)
})

test('narrow desktop breakpoint explicitly restores account text after legacy compact-header rules', () => {
  const css = read('app/aureka-acrylic-navigation-polish.css')
  const finalShell = css.slice(css.indexOf('Final workspace shell correction'))
  const tablet = finalShell.slice(finalShell.indexOf('@media (min-width: 861px) and (max-width: 1180px)'), finalShell.indexOf('/* Mobile:'))
  assert.match(tablet, /\.workspaceHeaderBar > \.workspaceHeaderProfile[\s\S]*flex: 0 1 auto !important/)
  assert.match(tablet, /\.workspaceHeaderProfileText[\s\S]*display: grid !important/)
  assert.match(tablet, /\.workspaceHeaderProfileText[\s\S]*width: 170px !important/)
})
