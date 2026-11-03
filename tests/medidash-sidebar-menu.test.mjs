import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('hamburger is first in header and command palette is separate from search', () => {
  const home = read('components/HomeClient.tsx')
  const headerStart = home.indexOf('<header className="workspaceHeaderBar">')
  const headerEnd = home.indexOf('</header>', headerStart)
  const header = home.slice(headerStart, headerEnd)
  const menu = header.indexOf('className="mobileMenuButton workspaceSidebarMenuButton"')
  const context = header.indexOf('className="workspaceContext"')
  const search = header.indexOf('className="workspaceGlobalSearch"')
  const palette = header.indexOf('<CommandPalette')
  assert.ok(menu >= 0 && context > menu, 'hamburger must be left of hospital context')
  assert.ok(search > context, 'search must follow hospital context')
  assert.ok(palette > search, 'command palette must follow the search field as a separate header control')
  assert.ok(header.slice(search, palette).includes('   </div>'), 'search container must close before command palette')
  assert.match(header, /setSidebarCollapsed\(v=>!v\)/)
  assert.doesNotMatch(header, /className="sidebarToggle"|className="mobileSidebarClose"/)
})

test('header layout prevents overlap on desktop and narrow screens', () => {
  const css = read('app/aureka-solid-navigation.css')
  assert.match(css, /\.workspaceRoot \.workspaceHeaderBar\s*\{[\s\S]*display: flex !important;[\s\S]*flex-wrap: nowrap !important/)
  assert.match(css, /\.workspaceRoot \.workspaceSidebarMenuButton\s*\{[\s\S]*order: 0 !important/)
  assert.match(css, /\.workspaceRoot \.workspaceContext\s*\{[\s\S]*order: 1 !important/)
  assert.match(css, /\.workspaceRoot \.workspaceGlobalSearch\s*\{[\s\S]*order: 2 !important/)
  assert.match(css, /\.workspaceRoot \.workspaceHeaderBar > \.commandPaletteTrigger\s*\{[\s\S]*order: 3 !important/)
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.workspaceRoot \.workspaceGlobalSearch\s*\{[\s\S]*min-width: 72px !important/)
})

test('sidebar redesign retains desktop and mobile navigation behavior', () => {
  const css = read('app/aureka-solid-navigation.css')
  assert.match(css, /grid-template-columns: 264px minmax\(0, 1fr\) !important/)
  assert.match(css, /\.workspaceRoot \.sidebar \.sideProfile\s*\{[\s\S]*display: flex !important/)
  assert.match(css, /\.workspaceRoot\.sidebarIsCollapsed\s*\{\s*grid-template-columns: 76px minmax\(0, 1fr\) !important/)
  assert.match(css, /@media \(max-width: 720px\)[\s\S]*\.workspaceRoot:not\(\.sidebarIsCollapsed\)\s*\{\s*grid-template-columns: minmax\(0, 1fr\) !important/)
})
