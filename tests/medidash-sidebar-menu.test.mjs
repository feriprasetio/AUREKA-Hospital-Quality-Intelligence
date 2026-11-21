import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('only smartphones render the hamburger; tablet and desktop sidebar cannot collapse', () => {
  const home = read('components/HomeClient.tsx')
  const workspace = home.slice(home.indexOf("if(view==='workspace')"))
  const menu = workspace.indexOf('className="mobileMenuButton workspaceSidebarMenuButton"')
  const context = workspace.indexOf('className="workspaceContext"')
  assert.ok(menu >= 0 && context > menu, 'phone menu precedes contextual search')
  assert.match(workspace, /mobileSidebar\.isMobile&&<button type="button" ref=\{mobileSidebar\.triggerRef\}/)
  assert.match(workspace, /onClick=\{event=>mobileSidebar\.open\(event\.currentTarget\)\}/)
  assert.doesNotMatch(workspace, /setSidebarCollapsed|sidebarIsCollapsed|className="sidebarToggle"|className="mobileSidebarClose"/)
})

test('Arktik original sidebar stays visible on tablet and desktop, and phone keeps accessible navigation', () => {
  const css = read('app/aureka-navigation-system.css')
  const controller = read('components/layout/useAccessibleSidebar.ts')
  assert.match(css, /@media \(min-width: 721px\) \{[\s\S]*?position: sticky !important/)
  assert.match(css, /@media \(min-width: 721px\)[\s\S]*?visibility: visible !important/)
  assert.match(css, /\.sidebarDomainNav\s*\{[\s\S]*?overflow-y: auto !important/)
  assert.match(css, /@media \(max-width: 720px\) \{[\s\S]*?transform: translate3d\(-105%, 0, 0\) !important/)
  assert.match(controller, /matchMedia\(PHONE_DRAWER_MEDIA_QUERY\)/)
})
