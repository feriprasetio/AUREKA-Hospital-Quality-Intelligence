import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('sidebar collapse is controlled only by the hamburger beside global search', () => {
  const home = read('components/HomeClient.tsx')
  const workspace = home.slice(home.indexOf("if(view==='workspace')"))
  assert.match(workspace, /className="mobileMenuButton workspaceSidebarMenuButton"/)
  assert.match(workspace, /setSidebarCollapsed\(v=>!v\)/)
  assert.doesNotMatch(workspace, /className="sidebarToggle"/)
  assert.doesNotMatch(workspace, /className="mobileSidebarClose"/)
  assert.match(workspace, /className="mobileMenuButton workspaceSidebarMenuButton"[\\s\\S]*className="workspaceContext"[\\s\\S]*className="workspaceGlobalSearch"/)
})

test('Solid White sidebar has a compact Medidash-style rail and a usable collapsed state', () => {
  const css = read('app/aureka-solid-navigation.css')
  assert.match(css, /\.workspaceRoot \.sidebar \.sidebarToggle,[\s\S]*\.mobileSidebarClose\s*\{\s*display:\s*none !important/)
  assert.match(css, /\.workspaceRoot \.workspaceSidebarMenuButton\s*\{[\s\S]*display:\s*grid !important/)
  assert.match(css, /\.workspaceRoot\.sidebarIsCollapsed\s*\{\s*grid-template-columns:\s*76px minmax\(0, 1fr\) !important/)
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.workspaceRoot\.sidebarIsCollapsed\s*\{\s*grid-template-columns:\s*minmax\(0, 1fr\) !important/)
})
