import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('header menu is before hospital context and search controls are separate siblings', () => {
  const home = read('components/HomeClient.tsx')
  const start = home.indexOf('<header className="workspaceHeaderBar">')
  const end = home.indexOf('</header>', start)
  const header = home.slice(start, end)
  const menu = header.indexOf('className="mobileMenuButton workspaceSidebarMenuButton"')
  const context = header.indexOf('className="workspaceContext"')
  const search = header.indexOf('className="workspaceGlobalSearch"')
  assert.ok(menu >= 0 && context > menu, 'hamburger must be left of hospital context')
  assert.ok(search > context, 'the existing global search follows hospital context')
  assert.equal(header.includes('<CommandPalette'), false, 'module search trigger is not duplicated')
})

test('Arktik header layout retains the menu, hospital context, and one global search', () => {
  const shell = read('app/workspace-desk.css')
  const mobile = read('app/mobile-nav.css')
  assert.ok(shell.includes('workspaceRoot.workspaceDesk .workspaceHeaderBar'))
  assert.ok(shell.includes('min-height: 60px !important'))
  assert.ok(shell.includes('workspaceRoot.workspaceDesk .workspaceSidebarMenuButton'))
  assert.ok(shell.includes('workspaceRoot.workspaceDesk .workspaceContext'))
  assert.ok(shell.includes('flex: 1 1 260px !important'))
  assert.ok(mobile.includes('grid-template-areas: "menu ctx theme bell ai" "search search search search search"'))
  assert.ok(mobile.includes('mobileWorkspaceTabsEnabled .workspaceHeaderBar.workspaceHeaderBar > .workspaceSidebarMenuButton'))
})

test('Arktik sidebar retains desktop geometry and the shared mobile drawer breakpoint', () => {
  const shell = read('app/workspace-desk.css')
  const responsive = read('app/layout-responsive.css')
  assert.ok(shell.includes('grid-template-columns: 224px minmax(0, 1fr) !important'))
  assert.ok(shell.includes('min-height: 68px !important'))
  assert.ok(shell.includes('sidebarNavGroup > button.navActive'))
  assert.ok(shell.includes('workspaceRoot.workspaceDesk.sidebarIsCollapsed'))
  assert.ok(shell.includes('grid-template-columns: 64px minmax(0, 1fr) !important'))
  assert.ok(responsive.includes('@media (max-width: 720px)'))
  assert.ok(responsive.includes('position: fixed !important'))
})

test('mobile drawer and fallback navigation use one 720px breakpoint', () => {
  const responsive = read('app/layout-responsive.css')
  const mobileNav = read('app/mobile-nav.css')
  const home = read('components/HomeClient.tsx')
  assert.ok(responsive.includes('@media (max-width: 720px)'))
  assert.ok(mobileNav.includes('@media (max-width: 720px)'))
  assert.ok(home.includes("matchMedia('(max-width: 720px)')"))
})
