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

test('Solid White is applied without depending on client data-theme hydration', () => {
  const navigation = read('app/aureka-solid-navigation.css')
  const home = read('components/HomeClient.tsx')
  assert.ok(home.includes('data-aureka-theme="solid-white"'))
  assert.doesNotMatch(navigation, /html\\[data-theme\\]/)
})

test('primary navigation uses one white surface rather than glossy menu cards', () => {
  const css = read('app/aureka-solid-navigation.css')
  for (const selector of [
    '.workspaceRoot .sidebar',
    '.workspaceRoot .sidebar .sidebarNav',
    '.workspaceRoot .sidebar .sidebarNavGroup',
    '.workspaceRoot .sidebar .sidebarNavGroup > button',
    '.workspaceRoot .sidebar .sidebarTreeChildren',
    '.workspaceRoot .sidebar .sidebarFooter'
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
  const solidReset = css.slice(css.indexOf('Final, high-specificity reset'))
  assert.ok(solidReset.includes('.sidebarNavGroup:hover,'))
  assert.ok(solidReset.includes('.sidebarNavGroup.isCurrent {'))
  assert.ok(solidReset.includes('background: transparent !important;'))
  assert.ok(solidReset.includes('box-shadow: none !important;'))
  assert.match(css, /sidebarTreeChildren\[hidden\][\s\S]*?display: none !important/)

})

test('nested sidebar menus expose expanded state and connected submenu controls', () => {
  const home = read('components/HomeClient.tsx')
  assert.match(home, /aria-controls=.*sidebar-children-/)
  assert.match(home, /aria-current=\{active===id\?'page':undefined\}/)
  assert.match(home, /id=.*sidebar-children-/)
  assert.match(home, /hidden=\{!groupOpen\}/)
  assert.match(home, /hidden=\{!nOpen\}/)

})





