import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Solid White final layer loads after every legacy visual layer', () => {
  const layout = read('app/layout.tsx')
  const styles = [
    "./globals.css",
    "./clinical-ui.css",
    "./medidash-ui.css",
    "./solid-default.css",
    "./medidash-polish.css",
    "./design-tokens.css",
    "./layout-responsive.css",
    "./aureka-solid-enterprise.css",
    "./aureka-solid-navigation.css",
  ]
  let previous = -1
  for (const style of styles) {
    const position = layout.indexOf("import '" + style + "'")
    assert.ok(position > previous, style + ' must remain in the intended CSS cascade')
    previous = position
  }
})

test('primary navigation uses one white surface rather than glossy menu cards', () => {
  const css = read('app/aureka-solid-navigation.css')
  for (const selector of [
    'html[data-theme] .workspaceRoot .sidebar',
    'html[data-theme] .workspaceRoot .sidebar .sidebarNav',
    'html[data-theme] .workspaceRoot .sidebar .sidebarNavGroup',
    'html[data-theme] .workspaceRoot .sidebar .sidebarNavGroup > button',
    'html[data-theme] .workspaceRoot .sidebar .sidebarTreeChildren',
    'html[data-theme] .workspaceRoot .sidebar .sidebarFooter',
  ]) {
    assert.ok(css.includes(selector), 'Missing final navigation rule: ' + selector)
  }
  assert.match(css, /background:\s*#ffffff\s*!important/)
  assert.match(css, /backdrop-filter:\s*none\s*!important/)
  assert.match(css, /sidebarIsCollapsed/)
  assert.match(css, /max-width:\s*720px/)
  assert.match(css, /scrollbar-width:\s*none/)
  assert.doesNotMatch(css, /backdrop-filter:\s*blur/)
  assert.doesNotMatch(css, /linear-gradient/)
  const legacyOverride = css.slice(css.indexOf('Defeat higher-specificity legacy hover/current cards'))
  assert.ok(legacyOverride.includes('.sidebarNavGroup:hover,'))
  assert.ok(legacyOverride.includes('.sidebarNavGroup.isCurrent {'))
  assert.ok(legacyOverride.includes('background: transparent !important;'))
  assert.ok(legacyOverride.includes('box-shadow: none !important;'))
})

test('nested sidebar menus expose expanded state and connected submenu controls', () => {
  const home = read('components/HomeClient.tsx')
  assert.match(home, /aria-controls=.*sidebar-children-/)
  assert.match(home, /aria-current=\{active===id\?'page':undefined\}/)
  assert.match(home, /id=.*sidebar-children-/)
})

test('dashboard network failures keep a visible state and do not remain loading forever', () => {
  const dashboard = read('components/OverviewDashboard.tsx')
  assert.match(dashboard, /\.catch\(\(\) => \{/)
  assert.match(dashboard, /Data belum dapat diperbarui\. Periksa koneksi lalu coba muat ulang\./)
  assert.match(dashboard, /setLoading\(false\)/)
})

test('dashboard does not present the internal page cap as a user-facing record limit', () => {
  const dashboard = read('components/OverviewDashboard.tsx')
  assert.doesNotMatch(dashboard, /5\.000\s+record|5,000\s+record|maksimal\s+5\.000/i)
})
