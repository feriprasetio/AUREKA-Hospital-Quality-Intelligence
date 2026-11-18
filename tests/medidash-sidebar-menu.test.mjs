import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('sidebar collapse is controlled only by the hamburger beside global search', () => {
  const home = read('components/HomeClient.tsx')
  const workspace = home.slice(home.indexOf("if(view==='workspace')"))
  assert.ok(workspace.indexOf('className="mobileMenuButton workspaceSidebarMenuButton"') < workspace.indexOf('className="workspaceContext"'), 'hamburger must precede hospital context')
  assert.match(workspace, /setSidebarCollapsed\(v=>!v\)/)
  assert.doesNotMatch(workspace, /className="sidebarToggle"/)
  assert.doesNotMatch(workspace, /className="mobileSidebarClose"/)
  assert.ok(workspace.indexOf('className="mobileMenuButton workspaceSidebarMenuButton"') < workspace.indexOf('className="workspaceContext"'), 'hamburger must precede hospital context')
})

test('Arktik acrylic sidebar keeps a compact six-domain rail and usable collapsed state', () => {
  const css = read('app/aureka-navigation-repair.css')
  assert.match(css, /\\.sidebarDomainNav/)
  assert.match(css, /\\.sidebarDomainTrigger/)
  assert.match(css, /\\.sidebarDomainItems/)
  assert.match(css, /\\.sidebarIsCollapsed/)
  assert.match(css, /grid-template-columns: 76px minmax\\(0, 1fr\\) !important/)
  assert.match(css, /@media \\(max-width: 720px\\)/)
})
