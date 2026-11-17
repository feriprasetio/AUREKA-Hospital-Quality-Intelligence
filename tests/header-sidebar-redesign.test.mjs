import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('header places hamburger before hospital context and keeps the single global search', () => {
  const home = read('components/HomeClient.tsx')
  const workspace = home.slice(home.indexOf("if(view==='workspace')"))
  const hamburger = workspace.indexOf('className="mobileMenuButton workspaceSidebarMenuButton"')
  const context = workspace.indexOf('className="workspaceContext"')
  const searchOpen = workspace.indexOf('className="workspaceGlobalSearch"')
  const searchClose = workspace.indexOf('</div>', searchOpen)
  assert.ok(hamburger >= 0 && hamburger < context, 'hamburger must be left of hospital context')
  assert.ok(searchOpen >= 0 && searchClose > searchOpen, 'the single global search remains available')
  assert.equal(workspace.includes('<CommandPalette'), false, 'no separate module-search button is added')
  assert.doesNotMatch(workspace, /className="sidebarToggle"|className="mobileSidebarClose"/)
})

test('Arktik shell owns the responsive header and sidebar geometry', () => {
  const shell = read('app/workspace-desk.css')
  const mobile = read('app/mobile-nav.css')
  const responsive = read('app/layout-responsive.css')
  assert.ok(shell.includes('grid-template-columns: 224px minmax(0, 1fr) !important'))
  assert.ok(shell.includes('min-height: 68px !important'))
  assert.ok(shell.includes('sidebarNavGroup > button.navActive'))
  assert.ok(shell.includes('workspaceRoot.workspaceDesk .workspaceSidebarMenuButton'))
  assert.ok(shell.includes('workspaceRoot.workspaceDesk .workspaceContext'))
  assert.ok(shell.includes('workspaceRoot.workspaceDesk .workspaceGlobalSearch'))
  assert.ok(shell.includes('workspaceRoot.workspaceDesk.sidebarIsCollapsed'))
  assert.ok(responsive.includes('position: fixed !important'))
  assert.ok(mobile.includes('grid-template-areas: "menu ctx theme bell ai" "search search search search search"'))
})
