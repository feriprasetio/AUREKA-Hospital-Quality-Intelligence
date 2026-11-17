import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('sidebar collapse is controlled only by the hamburger beside global search', () => {
  const home = read('components/HomeClient.tsx')
  const workspace = home.slice(home.indexOf("if(view==='workspace')"))
  assert.ok(workspace.indexOf('className="mobileMenuButton workspaceSidebarMenuButton"') < workspace.indexOf('className="workspaceContext"'), 'hamburger must precede hospital context')
  assert.match(workspace, /setSidebarCollapsed\(v=>!v\)/)
  assert.doesNotMatch(workspace, /className="sidebarToggle"/)
  assert.doesNotMatch(workspace, /className="mobileSidebarClose"/)
})

test('Arktik sidebar retains a compact collapsed state and restores the drawer on phones', () => {
  const shell = read('app/workspace-desk.css')
  const responsive = read('app/layout-responsive.css')
  const mobile = read('app/mobile-nav.css')
  assert.ok(shell.includes('workspaceRoot.workspaceDesk.sidebarIsCollapsed'))
  assert.ok(shell.includes('grid-template-columns: 64px minmax(0, 1fr) !important'))
  assert.ok(responsive.includes('.workspaceRoot.sidebarIsCollapsed .sideBrand > div'))
  assert.ok(responsive.includes('.workspaceRoot .mobileMenuButton'))
  assert.ok(responsive.includes('display: grid !important;'))
  assert.ok(mobile.includes('mobileWorkspaceTabsEnabled .workspaceHeaderBar.workspaceHeaderBar > .workspaceSidebarMenuButton'))
})
