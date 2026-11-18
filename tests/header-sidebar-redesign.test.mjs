import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('header places hamburger before hospital context and removes the separate module-search control', () => {
  const home = read('components/HomeClient.tsx')
  const workspace = home.slice(home.indexOf("if(view==='workspace')"))
  const hamburger = workspace.indexOf('className="mobileMenuButton workspaceSidebarMenuButton"')
  const context = workspace.indexOf('className="workspaceContext"')
  const searchOpen = workspace.indexOf('className="workspaceGlobalSearch"')
  const searchClose = workspace.indexOf('</div>', searchOpen)
  assert.ok(hamburger >= 0 && hamburger < context, 'hamburger must be left of hospital context')
  assert.ok(searchOpen >= 0 && searchClose > searchOpen, 'workspace search remains available')
  assert.equal(workspace.includes('<CommandPalette'), false, 'module-search button is removed')
  assert.doesNotMatch(workspace, /className="sidebarToggle"|className="mobileSidebarClose"/)
})

test('Arktik acrylic sidebar uses the six-domain rail with responsive header spacing', () => {
  const css = read('app/aureka-navigation-repair.css')
  assert.ok(css.includes('grid-template-columns: 264px minmax(0, 1fr) !important'))
  assert.ok(css.includes('.sidebarDomainNav'))
  assert.ok(css.includes('.sidebarDomainTrigger'))
  assert.ok(css.includes('.sidebarDomainItem.active'))
  assert.ok(css.includes('.workspaceSidebarMenuButton'))
  assert.ok(css.includes('.workspaceContext'))
  assert.ok(css.includes('.workspaceGlobalSearch'))
  assert.ok(css.includes('@media (max-width: 720px)'))
})
