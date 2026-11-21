import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

const home = read('components/HomeClient.tsx')
const navigation = read('components/navigation/UnifiedModuleNavigation.tsx')
const shell = read('app/aureka-layout-integrity.css')

test('mobile workspace uses one breadcrumb and one contextual tab row instead of the desktop two-rail navigation', () => {
  assert.match(home, /MOBILE_WORKSPACE_TABS=process\.env\.NEXT_PUBLIC_AUREKA_MOBILE_WORKSPACE_TABS!=='false'/)
  assert.match(home, /mobileWorkspaceTabs=\{MOBILE_WORKSPACE_TABS\}/)
  assert.match(home, /mobileWorkspaceTabsEnabled/)
  assert.match(navigation, /workspaceMobileNavigation/)
  assert.match(navigation, /aria-label="Tab Workspace"/)
  assert.match(navigation, /aria-current=\{selected \? 'page' : undefined\}/)
  assert.match(navigation, /selectSecondary\(item\.id\)/)
  assert.match(navigation, /mobileGroupRef/)
})

test('mobile tabs are horizontally scrollable, keyboard-visible, dark-mode aware, and scoped to Arktik', () => {
  assert.match(shell, /@media \(max-width: 720px\)/)
  assert.match(shell, /\.workspaceNavigationRail\s*\{\s*display: none !important/)
  assert.match(shell, /\.workspaceMobileTabs\s*\{[\s\S]*overflow-x: auto !important/)
  assert.match(shell, /\.workspaceMobileTab:focus-visible/)
  assert.match(shell, /data-mode="gelap"/)
  assert.doesNotMatch(shell, /data-skin="solid"/)
})

test('phone contextual tabs and drawer use the same 720px threshold; tablets keep sidebar', () => {
  assert.match(navigation, /matchMedia\('\(max-width: 720px\)'\)/)
  assert.match(read('components/layout/useAccessibleSidebar.ts'), /matchMedia\(PHONE_DRAWER_MEDIA_QUERY\)/)
})
