import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { PHONE_DRAWER_MEDIA_QUERY, usesPhoneDrawer } from '../lib/ui/device-navigation.ts'
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('only phone-sized viewports may use the mobile drawer, regardless of touch input', () => {
  assert.equal(PHONE_DRAWER_MEDIA_QUERY, '(max-width: 720px)')
  assert.doesNotMatch(PHONE_DRAWER_MEDIA_QUERY, /pointer|coarse|1180|1600/)
  assert.equal(usesPhoneDrawer(query => ({matches: query === '(max-width: 720px)'})), true)
  assert.equal(usesPhoneDrawer(() => ({matches:false})), false)
  const home = read('components/HomeClient.tsx')
  const controller = read('components/layout/useAccessibleSidebar.ts')
  assert.match(controller,/window\.matchMedia\(PHONE_DRAWER_MEDIA_QUERY\)/)
  assert.match(controller,/if \(!nowMobile\) setIsOpen\(false\)/)
  assert.match(home,/mobileSidebar\.isMobile&&<button type="button" ref=\{mobileSidebar\.triggerRef\}/)
  assert.match(home,/mobileSidebar\.isMobile&&typeof document!=='undefined'&&createPortal\(/)
  assert.doesNotMatch(home, /TOUCH_DRAWER_MEDIA_QUERY/)
})

test('tablets and desktop keep real visible sidebars, without any mobile rail', () => {
  const nav = read('app/aureka-navigation-system.css')
  const head = read('app/aureka-canvas-preferences.css')
  assert.doesNotMatch(nav, /\(pointer: coarse\)/)
  assert.doesNotMatch(head, /\(pointer: coarse\)/)
  assert.match(nav, /@media \(min-width: 721px\) \{[\s\S]*?position: sticky !important;[\s\S]*?visibility: visible !important;/)
  assert.match(nav, /@media \(min-width: 721px\) and \(max-width: 1180px\) \{[\s\S]*?grid-template-columns: 238px minmax\(0, 1fr\)/)
  assert.match(nav, /@media \(min-width: 721px\) and \(max-width: 860px\) \{[\s\S]*?grid-template-columns: 210px minmax\(0, 1fr\)/)
  assert.match(nav, /body > \.workspaceNativeNavigation\s*\{\s*display: none !important;/)
  assert.match(nav, /\.workspaceSidebarMenuButton,[\s\S]*?\.workspaceScrim\s*\{\s*display: none !important;/)
  assert.match(head, /grid-template-areas: "menu context search nara inbox theme fullscreen bell profile"/)
  assert.match(head, /"menu context find nara inbox theme bell profile"\s+"search search search search search search search search"/)
})
