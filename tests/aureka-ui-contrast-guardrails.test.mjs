import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const css = read('app/aureka-contrast-guardrails.css')

function luminance(hex) {
  const match = /^#([0-9a-f]{6})$/i.exec(hex)
  assert.ok(match, 'A contrast token must be an opaque six-digit hex color: ' + hex)
  const channels = [0, 2, 4].map(i => parseInt(match[1].slice(i, i + 2), 16) / 255)
    .map(value => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4)
  return channels[0] * 0.2126 + channels[1] * 0.7152 + channels[2] * 0.0722
}

function contrast(a, b) {
  const [brighter, darker] = [luminance(a), luminance(b)].sort((a, b) => b - a)
  return (brighter + 0.05) / (darker + 0.05)
}

function variables(source) {
  return Object.fromEntries([...source.matchAll(/(--aureka-[a-z-]+)\s*:\s*(#[a-f\d]{6})\s*;/gi)].map(match => [match[1], match[2]]))
}

test('all action/button contrast pairs pass WCAG AA normal-text 4.5:1 in light and dark', () => {
  const lightStart = css.indexOf('html[data-skin="arktik"] {')
  const darkStart = css.indexOf('html[data-skin="arktik"][data-mode="gelap"] {')
  const buttonStart = css.indexOf('html[data-skin="arktik"] body')
  assert.ok(lightStart >= 0 && darkStart > lightStart && buttonStart > darkStart)
  const light = variables(css.slice(lightStart, darkStart))
  const dark = variables(css.slice(darkStart, buttonStart))
  for (const [name, palette] of [['terang',light],['gelap',dark]]) {
    const pairs = [
      ['utama', '--aureka-action-bg','--aureka-action-fg'],
      ['hover', '--aureka-action-hover','--aureka-action-fg'],
      ['nonaktif', '--aureka-action-disabled-bg','--aureka-action-disabled-fg'],
      ['sekunder', '--aureka-neutral-action-bg','--aureka-neutral-action-fg'],
    ]
    for (const [label, bg, fg] of pairs) {
      assert.ok(palette[bg] && palette[fg], name + '/' + label + ': missing paired tokens')
      assert.ok(contrast(palette[bg],palette[fg]) >= 4.5,
        name + '/' + label + ' has insufficient contrast: ' + contrast(palette[bg],palette[fg]).toFixed(2) + ':1')
    }
  }
})

test('primary foreground and background are paired in workspace AND document.body portals', () => {
  const app = read('app/aureka-global.css')
  const theme = read('app/theme-arktik-accents.css')
  const legacy = read('components/QualityIndicatorWorkspace.tsx')
  const modal = read('components/ui/AurekaModal.tsx')
  assert.ok(app.includes("@import './aureka-contrast-guardrails.css';"))
  assert.ok(app.indexOf("@import './aureka-contrast-guardrails.css';") >
    app.indexOf("@import './theme-arktik-dark.css';"))
  assert.ok(css.includes(':is(.workspaceRoot, .akModalRoot, .aqPortal, [aria-modal="true"])'))
  for (const klass of ['aqBtn','psBtn','rmButton','cpBtn','oppeBtn','stBtn','uBtn','akBtn']) {
    assert.ok(css.includes('.' + klass + '.primary'), 'Missing ' + klass + ' primary action coverage')
  }
  assert.ok(css.includes('color: var(--aureka-action-fg) !important;'))
  assert.ok(css.includes('-webkit-text-fill-color: var(--aureka-action-fg) !important;'))
  assert.ok(css.includes('background: var(--aureka-action-bg) !important;'))
  assert.ok(css.includes('html[data-skin="arktik"] .akModalRoot .aqWorkbookChoices > .aqBtn:not(.primary):not(.danger)'))
  assert.ok(theme.includes('html[data-skin="arktik"] .aqBtn:not(.primary):not(.danger)'))
  assert.ok(theme.includes('.workspaceRoot .moduleEnter .aqBtn:not(.primary):not(.danger)'))
  assert.ok(legacy.includes('Workbook baku unit'))
  assert.ok(legacy.includes('className="aqWorkbookChoices"'))
  assert.ok(modal.includes('createPortal('))
})

test('keyboard focus, mobile touch targets, forms and forced-color mode are supported', () => {
  assert.ok(css.includes(':focus-visible'))
  assert.ok(css.includes('outline: 3px solid var(--aureka-focus-contrast) !important'))
  assert.ok(css.includes('@media (pointer: coarse)'))
  assert.ok(css.includes('min-height: 48px !important'))
  assert.ok(css.includes('input:not([type="checkbox"])'))
  assert.ok(css.includes('::placeholder'))
  assert.ok(css.includes('@media (forced-colors: active)'))
  assert.ok(css.includes('HighlightText'))
})

test('known screenshot contrast regression: dark-on-dark is rejected, corrected themes are readable', () => {
  assert.ok(contrast('#253543','#0b467a') < 2, 'This pair should reproduce the unreadable import button')
  assert.ok(contrast('#ffffff','#0b467a') >= 7, 'Light-mode primary should exceed AAA')
  assert.ok(contrast('#0b1f33','#4993d4') >= 4.5, 'Dark-mode bright-primary should be AA')
  assert.ok(contrast('#d0dce5','#4993d4') < 4.5, 'Old dark-mode bright-primary pair was illegible')
})
