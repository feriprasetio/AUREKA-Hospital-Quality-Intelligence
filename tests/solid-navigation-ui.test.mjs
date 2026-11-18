import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Arktik is the active workspace skin and Solid override layers are not loaded', () => {
  const layout = read('app/layout.tsx')
  const home = read('components/HomeClient.tsx')
  assert.match(layout, /<html lang="id" data-skin="arktik"/)
  assert.ok(home.includes('data-aureka-theme='))
  for (const legacy of ["./solid-default.css", "./aureka-solid-enterprise.css", "./aureka-solid-navigation.css"]) {
    assert.ok(!layout.includes("import '" + legacy + "'"), legacy + ' must not override Arktik')
  }
  assert.ok(layout.indexOf("import './theme-arktik-dark.css'") < layout.indexOf("import './aureka-navigation-pill.css'"))
  assert.ok(layout.indexOf("import './dark-mode-mobile-fixes.css'") < layout.indexOf("import './aureka-navigation-pill.css'"))
  assert.ok(layout.trimEnd().endsWith("import './aureka-universal-tabs.css'"))
})

test('Arktik uses bundled Plus Jakarta Sans and does not download Inter', () => {
  const skin = read('app/theme-arktik.css')
  assert.doesNotMatch(skin, /fonts\.googleapis\.com|font-family:\s*["']Inter["']/i)
  assert.match(skin, /var\(--font-aureka\)/)
})

test('sidebar exposes six domain groups; operational destinations stay contextual', () => {
  const home = read('components/HomeClient.tsx')
  const navCss = read('app/aureka-navigation-consolidated.css')
  assert.ok(home.includes('aria-label="Enam domain utama AUREKA"'))
  assert.ok(home.includes('visibleSidebarDomains.map'))
  assert.ok(home.includes("import UnifiedModuleNavigation from '@/components/navigation/UnifiedModuleNavigation'"))
  assert.ok(home.includes('<UnifiedModuleNavigation'))
  assert.ok(home.includes('activeNestedNavGroup'))
  for (const legacy of ['sidebarTreeChildren', 'sidebarNestedGroup', 'closedNav', 'toggleNav(']) assert.ok(!home.includes(legacy))
  assert.ok(navCss.includes('.workspaceNavigationRail'))
  assert.ok(navCss.includes('.workspaceRoot .sidebar .sidebarTreeChildren'))
})

test('global navigation uses balanced one-line smart overflow and keeps the active tab visible', () => {
  const component = read('components/navigation/UnifiedModuleNavigation.tsx')
  const css = read('app/aureka-global-navigation.css')
  assert.ok(component.includes('new ResizeObserver(calculate)'))
  assert.ok(component.includes("const primaryMin = items.length ?"))
  assert.ok(component.includes("const secondaryMin = subItems.length ?"))
  assert.ok(component.includes('overflowItems.map'))
  assert.ok(component.includes('overflowSubItems.map'))
  assert.ok(component.includes('<summary aria-label='))
  assert.ok(component.includes("onClick={() => selectPrimary(item.id)}"))
  assert.ok(component.includes("onClick={() => selectSecondary(item.id)}"))
  assert.match(css, /--aureka-nav-primary:\s*#172a40/)
  assert.match(css, /--aureka-nav-secondary:\s*#dcebf8/)
  assert.match(css, /workspaceNavigationOverflowMenu/)
  assert.match(css, /@media \(max-width: 720px\)/)
  assert.doesNotMatch(css, /position:\s*sticky/)
})

test('primary domain navigation uses the existing line glyphs and contextual rail', () => {
  const home = read('components/HomeClient.tsx')
  assert.doesNotMatch(home, /function NavIcon/)
  assert.doesNotMatch(home, /<NavIcon/)
  assert.match(home, /aria-label="Enam domain utama AUREKA"/)
  assert.match(home, /className=\{'sidebarDomainTrigger '/)
  assert.match(home, /<UnifiedModuleNavigation/)
})
