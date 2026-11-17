import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('legacy Solid and MediDash stylesheets are excluded from the active CSS bundle', () => {
  const layout = read('app/layout.tsx')
  const retired = ['medidash-ui.css','solid-default.css','medidash-polish.css','aureka-solid-enterprise.css','aureka-solid-navigation.css']
  for (const stylesheet of retired) assert.equal(layout.includes("import './" + stylesheet + "'"), false, stylesheet)
  assert.match(layout, /import '\.\/workspace-desk\.css'/)
  assert.match(layout, /import '\.\/theme-arktik\.css'/)
  assert.match(layout, /import '\.\/theme-arktik-modern\.css'/)
})

test('authenticated workspace is scoped to Arktik and does not force a Solid/light-only theme', () => {
  const home = read('components/HomeClient.tsx')
  const shell = read('app/workspace-desk.css')
  assert.ok(home.includes('data-aureka-theme="arktik"'))
  assert.doesNotMatch(home, /dataset\.theme='solid'/)
  assert.doesNotMatch(home, /style\.colorScheme='light'/)
  assert.match(shell, /html\[data-skin="arktik"\]/)
  assert.doesNotMatch(shell, /html\[data-theme\]/)
  assert.match(shell, /--desk-brand: #172a40/)
  assert.match(shell, /--desk-ink: #0b1f33/)
})

test('Arktik shell preserves the collapsed sidebar and desktop layout', () => {
  const home = read('components/HomeClient.tsx')
  const shell = read('app/workspace-desk.css')
  const theme = read('app/theme-arktik.css')
  assert.match(home, /setAttribute\('data-skin','arktik'\)/)
  assert.match(theme, /html\[data-skin="arktik"\]/)
  assert.match(shell, /sidebarIsCollapsed/)
  assert.match(shell, /grid-template-columns: 224px minmax\(0, 1fr\)/)
})

test('desktop rail stays available while phones use drawer, breadcrumb, and one Tab Workspace row', () => {
  const home = read('components/HomeClient.tsx')
  const component = read('components/navigation/UnifiedModuleNavigation.tsx')
  const css = read('app/aureka-universal-tabs.css')
  const mobile = read('app/mobile-nav.css')
  assert.match(home, /mobileWorkspaceTabs=\{AUREKA_NAV_FEATURES\.mobileWorkspaceTabs\}/)
  assert.match(home, /mobileWorkspaceTabsEnabled/)
  assert.match(component, /className="workspaceMobileNavigation"/)
  assert.match(component, /aria-label="Tab Workspace"/)
  assert.match(component, /workspaceMobileBreadcrumb/)
  assert.match(css, /\.workspaceRoot\.mobileWorkspaceTabsEnabled \.workspaceNavigationRail/)
  assert.match(css, /\.workspaceRoot\.mobileWorkspaceTabsEnabled \.workspaceMobileNavigation/)
  assert.match(mobile, /\.workspaceRoot\.mobileWorkspaceTabsEnabled \.mobileBottomNav/)
  assert.match(mobile, /grid-template-areas: "menu ctx theme bell ai"/)
  assert.match(mobile, /html\[data-skin\]:root body \.workspaceRoot\.workspaceRoot\.mobileWorkspaceTabsEnabled[\s\S]*?workspaceSidebarMenuButton/)
  assert.match(mobile, /workspaceRoot\.mobileWorkspaceTabsEnabled \.workspaceContent::after/)
  assert.match(mobile, /mobileWorkspaceTabsEnabled\) \.aurToast/)
})
