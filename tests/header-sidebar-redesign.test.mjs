import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('header places hamburger before hospital context and separates search from command palette', () => {
  const home = read('components/HomeClient.tsx')
  const workspace = home.slice(home.indexOf("if(view==='workspace')"))
  const hamburger = workspace.indexOf('className="mobileMenuButton workspaceSidebarMenuButton"')
  const context = workspace.indexOf('className="workspaceContext"')
  const searchOpen = workspace.indexOf('className="workspaceGlobalSearch"')
  const searchClose = workspace.indexOf('</div>', searchOpen)
  const palette = workspace.indexOf('<CommandPalette')
  assert.ok(hamburger >= 0 && hamburger < context, 'hamburger must be left of hospital context')
  assert.ok(searchOpen >= 0 && palette > searchClose, 'command palette must be outside search container')
  assert.doesNotMatch(workspace, /className="sidebarToggle"|className="mobileSidebarClose"/)
})

test('sidebar uses a clean Solid White rail with responsive header spacing', () => {
  const css = read('app/aureka-solid-navigation.css')
  assert.match(css, /grid-template-columns:\s*260px minmax\(0, 1fr\)/)
  assert.match(css, /\.workspaceRoot \.sidebar \.sideHeader[\s\S]*min-height: 82px/)
  assert.match(css, /\.workspaceRoot \.sidebar \.sidebarNavGroup > button\.navActive/)
  assert.match(css, /\.workspaceRoot \.workspaceSidebarMenuButton[\s\S]*order: 0/)
  assert.match(css, /\.workspaceRoot \.workspaceContext[\s\S]*order: 1/)
  assert.match(css, /\.workspaceRoot \.workspaceGlobalSearch[\s\S]*order: 2/)
  assert.match(css, /\.workspaceRoot \.commandPaletteTrigger[\s\S]*order: 3/)
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.workspaceRoot \.workspaceGlobalSearch/)
})
