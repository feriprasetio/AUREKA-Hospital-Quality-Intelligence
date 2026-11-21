import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('phone uses authorized native dock; desktop and tablet keep a permanently visible original sidebar', () => {
  const home = read('components/HomeClient.tsx')
  const controller = read('components/layout/useAccessibleSidebar.ts')
  const css = read('app/aureka-navigation-system.css')
  assert.match(home, /nativeNavigationItems=\(\[/)
  assert.match(home, /visibleModuleIds\.has\(item\.id\)/)
  assert.match(home, /nativeNavigationItems\.map\(item=>/)
  assert.match(home, /navigateWorkspace\(item\.id\)/)
  assert.match(home, /createPortal\(\s*<nav className="workspaceNativeNavigation"/)
  assert.match(home, /aria-label="Lihat semua modul AUREKA"/)
  assert.match(home, /aria-current=\{activeNavModuleId===item\.id\?'page':undefined\}/)
  assert.match(controller, /matchMedia\(PHONE_DRAWER_MEDIA_QUERY\)/)
  assert.match(controller, /!window\.matchMedia\(PHONE_DRAWER_MEDIA_QUERY\)\.matches/)
  assert.match(css, /@media \(min-width: 721px\) and \(max-width: 1180px\)/)
  assert.match(css, /@media \(min-width: 721px\) \{[\s\S]*?position: sticky !important;[\s\S]*?visibility: visible !important/)
  assert.match(css, /body > \.workspaceNativeNavigation\s*\{\s*display: none !important/)
  assert.match(home, /mobileSidebar\.isMobile&&typeof document!=='undefined'&&createPortal/)
  assert.doesNotMatch(home, /sidebarIsCollapsed|setSidebarCollapsed/)
  assert.match(css, /@media \(max-width: 720px\)/)
  assert.match(css, /body > \.workspaceNativeNavigation \{[\s\S]*?display: grid;/)
  assert.match(css, /@media \(min-width: 1181px\)/)
  assert.doesNotMatch(home, /const MOBILE_NATIVE_ROUTES=/)
})

test('touch dock respects safe-area, virtual keyboard, overlays and readable targets', () => {
  const css = read('app/aureka-navigation-system.css')
  assert.match(css, /safe-area-inset-bottom/)
  assert.match(css, /\.workspaceNativeNavItem\s*\{[\s\S]*?min-height: 52px/)
  assert.match(css, /\.workspaceNativeNavItem:focus-visible/)
  assert.match(css, /body:has\(:is\(input:focus, textarea:focus, select:focus/)
  assert.match(css, /\.workspaceNativeNavigation\[data-drawer-open="true"\]/)
  assert.match(css, /body:has\(:is\(\.akModalRoot/)
  assert.match(css, /body:has\(> \.workspaceNativeNavigation\) \.tanyaFab/)
  assert.match(css, /padding-bottom: calc\(105px \+ env\(safe-area-inset-bottom, 0px\)\)/)
})

test('blocking workspace editors portal to body and use the high dialog layer', () => {
  const names = [
    ['components/OppeAuditWorkspace.tsx','oppeModalBackdrop'],
    ['components/StaffDirectoryWorkspace.tsx','sdEditBackdrop'],
    ['components/ClinicalPathwayWorkspace.tsx','cpBuilderOverlay'],
    ['components/governance/SecretariatWorkspace.tsx','secModalBackdrop'],
    ['components/SpmWorkspace.tsx','spmOverlay'],
  ]
  for (const [path, cls] of names) {
    const content = read(path)
    assert.match(content, /createPortal\(/, path)
    assert.match(content, /document\.body/, path)
    assert.ok(content.includes(cls), path)
  }
  const clinical = read('components/ClinicalPathwayWorkspace.tsx')
  assert.match(clinical, /builderDialogRef = useAccessibleDialog/)
  assert.ok(clinical.indexOf('builderDialogRef = useAccessibleDialog') < clinical.indexOf('if (loading) return <div className="cpRoot"'), 'dialog hooks must precede early loading return')
  assert.match(read('components/SpmWorkspace.tsx'), /editDialogRef = useAccessibleDialog/)
  assert.match(read('components/SpmWorkspace.tsx'), /configDialogRef = useAccessibleDialog/)
  assert.match(read('app/typography.css'), /:is\(\.workspaceRoot, \.spmPortal\) \.spmWorkspace/)
  const tokens = read('app/design-tokens.css')
  const elevation = Number(tokens.match(/--aureka-z-dialog:\s*(\d+)/)?.[1])
  assert.ok(elevation > 2147483000)
  for(const sheet of ['app/aureka-global.css','app/typography.css']) {
    assert.match(read(sheet), /z-index:\s*var\(--aureka-z-dialog/,sheet)
  }
})

test('Arktik remains the only preferred skin and existing CSS cascade stays in canonical file', () => {
  const global = read('app/aureka-global.css')
  const design = read('DESIGN.md')
  assert.match(global, /@import '\.\/aureka-navigation-system\.css';/)
  assert.match(design, /tablet.*sidebar/)
  assert.match(design, /smartphone.*dock/)
  assert.doesNotMatch(global, /@import '\.\/native-overrides\.css'/)
})
