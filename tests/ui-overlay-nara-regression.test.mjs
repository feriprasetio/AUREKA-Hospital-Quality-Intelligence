import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('shared dialog stays above NARA, mobile navigation and presentation overlays', () => {
  const tokens = read('app/design-tokens.css')
  const modal = read('app/modal.css')
  const nara = read('app/tanya-aureka.css')
  const presentation = read('app/aurora.css')
  const mobileNav = read('app/aureka-navigation-system.css')

  const dialogLayer = Number(tokens.match(/--aureka-z-dialog:\s*(\d+)/)?.[1])
  const presentationLayer = Number(presentation.match(/\.pmRoot[^}]*z-index:\s*(\d+)/)?.[1])
  const chatLayer = Number(nara.match(/\.tanyaPanel\s*\{[^}]*z-index:\s*(\d+)/)?.[1])
  const drawerLayer = Number(mobileNav.match(/\.sidebar\.mobileOpen[\s\S]*?z-index:\s*(\d+)\s*!important/)?.[1])

  assert.ok(Number.isFinite(dialogLayer) && dialogLayer > 0, 'dialog token must be numeric')
  assert.ok(dialogLayer > presentationLayer, 'dialogs must clear fullscreen presentation')
  assert.ok(dialogLayer > chatLayer, 'dialogs must clear NARA chat')
  assert.ok(dialogLayer > drawerLayer, 'dialogs must clear phone drawer')
  assert.match(modal, /\.akModalRoot\s*\{[^}]*z-index:\s*var\(--aureka-z-dialog/)
  assert.match(nara, /\.tanyaPanelEmbedded\{[^}]*z-index:auto!important/)
  assert.match(nara, /body:has\(\.akModalRoot\) \.tanyaFab\s*\{\s*visibility:\s*hidden/)
})

test('destructive confirmation initially focuses Cancel and modal controls are touch-sized', () => {
  const confirmation = read('components/ui/aurekaConfirm.tsx')
  const modal = read('app/modal.css')
  assert.match(confirmation, /data-dialog-autofocus=\{opts\.danger \? '' : undefined\}/)
  assert.match(confirmation, /data-dialog-autofocus=\{!opts\.danger \? '' : undefined\}/)
  assert.doesNotMatch(confirmation, /autoFocus\s/)
  assert.match(modal, /\.akModalClose\s*\{[^}]*width:\s*44px;\s*height:\s*44px/)
  assert.match(modal, /\.akBtn\s*\{\s*min-height:\s*44px/)
  assert.match(modal, /\.akModalFoot\s*\{\s*flex-wrap:\s*wrap;/)
})

test('NARA mobile history remains scrollable and actions remain accessible', () => {
  const nara = read('components/NaraAIWorkspace.tsx')
  const chat = read('app/tanya-aureka.css')
  assert.match(nara, /\.naraItemDel\{width:44px;height:44px;min-width:44px/)
  assert.match(nara, /\.naraItemOpen\{[^}]*min-height:44px/)
  assert.match(nara, /\.naraWorkspace\.listOpen \.naraHistory\{display:flex;max-height:min\(52dvh,420px\);overflow:hidden\}/)
  assert.match(nara, /\.naraMobileBar button\{min-height:44px;/)
  assert.match(chat, /\.tanyaComposer textarea\s*\{\s*font-size:\s*16px;/)
})
