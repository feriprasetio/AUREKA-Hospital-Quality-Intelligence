import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Aurora no longer stretches tablet sidebar to viewport or moves the workspace header', () => {
  const aurora = read('app/aurora.css')
  const start = aurora.indexOf('/* Workspace shell geometry belongs exclusively')
  const end = aurora.indexOf('/* Monitoring di samping Tanya AUREKA', start)
  assert.ok(start >= 0 && end > start, 'legacy Aurora shell geometry must be removed in its owner')
  const shell = aurora.slice(start, end)
  assert.doesNotMatch(shell, /aside\.sidebar\s*\{[^}]*?width\s*:/)
  assert.doesNotMatch(shell, /\.workspaceHeaderBar\s*\{[^}]*?(?:margin|top|border-radius)\s*:/)
  assert.doesNotMatch(shell, /calc\(100%\s*-\s*16px\)/)
  assert.doesNotMatch(shell, /height:\s*calc\(100dvh\s*-\s*32px\)/)
})

test('native tablet drawer remains bounded, scrollable, hidden when closed, and above its scrim', () => {
  const css = read('app/aureka-navigation-system.css')
  const idx = css.indexOf('/* Native-device navigation:')
  const tablet = css.slice(idx, css.indexOf('@media (max-width: 720px)', idx))
  assert.ok(idx > 0, 'tablet rules must be in the canonical navigation owner')
  assert.match(tablet, /\(pointer: coarse\) and \(min-width: 1181px\) and \(max-width: 1600px\)/)
  assert.match(tablet, /width: min\(360px, calc\(100vw - 48px\)\) !important/)
  assert.match(tablet, /max-width: min\(360px, calc\(100vw - 48px\)\) !important/)
  assert.match(tablet, /position: fixed !important/)
  assert.match(tablet, /height: 100dvh !important/)
  assert.match(tablet, /overflow: hidden !important/)
  assert.match(tablet, /transform: translate3d\(-105%, 0, 0\) !important/)
  assert.match(tablet, /\.sidebar\.mobileOpen,[\s\S]*?transform: translate3d\(0, 0, 0\) !important/)
  assert.match(tablet, /z-index: 1301 !important/)
  assert.match(tablet, /z-index: 1300 !important/)
  assert.match(tablet, /\.workspaceScrim\[data-open="false"\][\s\S]*?display: none !important/)
  assert.match(tablet, /\.workspaceDrawerClose[\s\S]*?display: grid !important/)
  assert.match(css, /\.sidebarDomainNav\s*\{[\s\S]*?overflow-y: auto !important/)
})

test('large touch tablets use the native rail and readable 52px buttons, not desktop-only icons', () => {
  const css = read('app/aureka-navigation-system.css')
  assert.match(css, /@media \(max-width: 1180px\), \(pointer: coarse\) and \(min-width: 1181px\) and \(max-width: 1600px\)\s*\{\s*html\[data-skin="arktik"\] body > \.workspaceNativeNavigation \.workspaceNativeNavItem/)
  assert.match(css, /\.workspaceNativeNavItem\s*\{[\s\S]*?min-height: 52px/)
  assert.match(css, /\.workspaceNativeNavItem svg\s*\{[\s\S]*?width: 22px/)
  assert.match(css, /\.workspaceNativeNavItem:focus-visible/)
})

test('header and search have one shared grid model on each device size', () => {
  const css = read('app/aureka-canvas-preferences.css')
  const home = read('components/HomeClient.tsx')
  assert.match(css, /grid-template-areas: "menu context search nara inbox theme fullscreen bell profile"/)
  assert.match(css, /"menu context nara inbox theme bell profile"\s+"search search search search search search search"/)
  assert.match(css, /"menu context context theme bell"\s+"profile profile nara inbox find"\s+"search search search search search"/)
  assert.match(css, /\.workspaceGlobalSearch \{ display: flex !important; width: 100% !important; \}/)
  assert.match(css, /\.workspaceGlobalSearch\[data-open="true"\]/)
  assert.match(home, /id="workspaceGlobalSearchInput"/)
  assert.match(home, /role="combobox"/)
  assert.doesNotMatch(home, /workspacePresentationSlot|workspaceDensityToggle/)
})

test('changing device navigation mode closes the old dialog and restores focus', () => {
  const controller = read('components/layout/useAccessibleSidebar.ts')
  assert.match(controller, /if \(!nowMobile\) setIsOpen\(false\)/)
  assert.match(controller, /window\.matchMedia\(TOUCH_DRAWER_MEDIA_QUERY\)/)
  assert.match(controller, /if \(event\.key === 'Escape'\)/)
  assert.match(controller, /lastElement\.focus\(\)/)
  assert.match(controller, /firstElement\.focus\(\)/)
  assert.match(controller, /previousBodyOverflow/)
  assert.match(controller, /restoreTarget\?\.focus\(\)/)
})
