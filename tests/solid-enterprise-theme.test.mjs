import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Arktik theme is the active authenticated workspace design and legacy skins are retired', () => {
  const layout = read('app/layout.tsx')
  const home = read('components/HomeClient.tsx')
  const retired = ['medidash-ui.css','solid-default.css','medidash-polish.css','aureka-solid-enterprise.css','aureka-solid-navigation.css']
  for (const stylesheet of retired) assert.equal(layout.includes("import './" + stylesheet + "'"), false, stylesheet)
  const shellIndex = layout.indexOf("import './workspace-desk.css'")
  const themeIndex = layout.indexOf("import './theme-arktik.css'")
  const modernIndex = layout.indexOf("import './theme-arktik-modern.css'")
  assert.ok(shellIndex >= 0 && themeIndex > shellIndex && modernIndex > themeIndex)
  assert.ok(home.includes('data-aureka-theme="arktik"'))
  assert.doesNotMatch(home, /dataset\.theme='solid'/)
  assert.doesNotMatch(home, /style\.colorScheme='light'/)
})

test('Arktik provides the authenticated shell, glass surface, controls, and module table styles', () => {
  const shell = read('app/workspace-desk.css')
  const theme = read('app/theme-arktik.css')
  const modern = read('app/theme-arktik-modern.css')
  for (const rule of [
    'html[data-skin="arktik"] .workspaceRoot.workspaceDesk',
    'html[data-skin="arktik"]:root .workspaceRoot aside.sidebar',
    'html[data-skin="arktik"]:root .workspaceRoot .workspaceHeaderBar',
    'html[data-skin="arktik"]:root .workspaceRoot .workspaceContent',
  ]) assert.ok((shell + theme).includes(rule), 'Missing Arktik shell rule: ' + rule)
  assert.match(modern, /\.workspaceRoot \.workspaceContent \.moduleEnter[\s\S]*input/)
  assert.match(modern, /\.workspaceRoot \.workspaceContent \.moduleEnter table/)
  assert.match(theme, /@media \(prefers-reduced-transparency: reduce\)/)
  assert.match(read('app/aureka-refined.css'), /@media \(prefers-reduced-motion: reduce\)/)
})

test('theme contract preserves clinical risk semantics and does not alter operational data rules', () => {
  const tokens = read('app/design-tokens.css')
  const home = read('components/HomeClient.tsx')
  for (const token of [
    '--aureka-risk-very-low',
    '--aureka-risk-low',
    '--aureka-risk-moderate',
    '--aureka-risk-high',
    '--aureka-risk-very-high',
  ]) assert.ok(tokens.includes(token), 'Missing clinical risk token: ' + token)
  assert.match(home, /AUREKA_NAV_FEATURES/)
})
