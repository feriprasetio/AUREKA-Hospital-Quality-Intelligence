import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  APPEARANCE_KEY,
  APPEARANCE_OPTIONS,
  DEFAULT_APPEARANCE,
  parseAppearancePreferences,
  readAppearancePreferences,
  applyAppearancePreferences,
} from '../lib/ui/appearance-preferences.ts'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('appearance preferences validate all nine typed options and cannot inject attributes', () => {
  assert.equal(APPEARANCE_KEY, 'aureka:appearance:v2')
  assert.equal(Object.keys(APPEARANCE_OPTIONS).length, 9)
  assert.deepEqual(APPEARANCE_OPTIONS.textSize, ['xs','s','m','l'])
  assert.equal(DEFAULT_APPEARANCE.surface, 'canvas')
  assert.equal(DEFAULT_APPEARANCE.header, 'minimal')
  assert.equal(DEFAULT_APPEARANCE.density, 'comfortable')
  assert.deepEqual(parseAppearancePreferences(null), DEFAULT_APPEARANCE)
  assert.deepEqual(parseAppearancePreferences([]), DEFAULT_APPEARANCE)
  const value = parseAppearancePreferences({
    textSize: 'l', density: 'compact', contrast: 'high', motion: 'off',
    surface: 'url(javascript:evil)', dividers: 'x', tableDensity: 'absurd',
    header: 'debug', readingWidth: 'all'
  })
  assert.equal(value.textSize, 'l')
  assert.equal(value.density, 'compact')
  assert.equal(value.surface, 'canvas')
  assert.equal(value.dividers, 'subtle')
  assert.equal(value.tableDensity, 'regular')
  assert.equal(value.header, 'minimal')
  assert.equal(value.readingWidth, 'fluid')
  assert.equal(value.motion, 'off')
})

test('preferences survive reload, safely fall back on malformed storage and migrate legacy choices', () => {
  const values = new Map([[APPEARANCE_KEY, JSON.stringify({ textSize:'xs', surface:'soft', tableDensity:'relaxed' })]])
  const storage = { getItem(key) { return values.get(key) ?? null } }
  assert.equal(readAppearancePreferences(storage).textSize,'xs')
  assert.equal(readAppearancePreferences(storage).surface,'soft')
  assert.equal(readAppearancePreferences(storage).tableDensity,'relaxed')
  values.set(APPEARANCE_KEY, '{bad json')
  assert.deepEqual(readAppearancePreferences(storage), DEFAULT_APPEARANCE)
  values.delete(APPEARANCE_KEY)
  values.set('aureka-text-size', 'besar')
  values.set('aureka-motion', 'off')
  assert.deepEqual(
    {textSize:readAppearancePreferences(storage).textSize,motion:readAppearancePreferences(storage).motion},
    {textSize:'l',motion:'off'}
  )
})

test('appearance preferences apply only validated known root attributes', () => {
  const attrs = new Map()
  const root = { setAttribute(key,value) { attrs.set(key,value) } }
  const parsed = applyAppearancePreferences(parseAppearancePreferences({ textSize:'s', surface:'canvas', motion:'off' }),root)
  assert.equal(parsed.textSize,'s')
  assert.equal(attrs.get('data-aureka-text-size'),'s')
  assert.equal(attrs.get('data-aureka-density'),'comfortable')
  assert.equal(attrs.get('data-aureka-surface'),'canvas')
  assert.equal(attrs.get('data-motion'),'off')
  assert.equal(attrs.size,10)
})

test('header has no density portal and workspace follows global density state', () => {
  const home=read('components/HomeClient.tsx')
  const shell=read('components/workspace/AdaptiveWorkspaceShell.tsx')
  const settings=read('components/GeneralSettings.tsx')
  assert.doesNotMatch(home,/workspacePresentationSlot|workspacePresentationTarget|controlTarget=/)
  assert.doesNotMatch(shell,/workspaceDensityToggle|toggleDensity|createPortal/)
  assert.match(shell,/readAppearancePreferences\(\)\.density/)
  assert.match(settings,/APPEARANCE_FIELDS/)
  assert.match(settings,/resetAppearancePreferences\(\)/)
  assert.match(settings,/saveAppearancePreferences/)
  for(const key of ['textSize','surface','density','contrast','dividers','tableDensity','header','readingWidth','motion']) {
    assert.match(settings,new RegExp("key: '"+key+"'"))
  }
})

test('canvas is the final authenticated-only visual policy with protected input/dialogs', () => {
  const bundle=read('app/aureka-global.css'),css=read('app/aureka-canvas-preferences.css')
  assert.ok(bundle.indexOf("@import './aureka-navigation-system.css';") < bundle.indexOf("@import './aureka-canvas-preferences.css';"))
  assert.match(css,/--aureka-canvas-surface: transparent/)
  assert.match(css,/\.secTablePanel, \.secSummary > div/)
  assert.match(css,/\.ppPanel, \.ppKpi/)
  assert.match(css,/border-inline-start: 2px solid var\(--aureka-canvas-divider\)/)
  assert.match(css,/\.moduleEnter table > thead > tr > th/)
  assert.match(css,/\.workspaceHeaderBar::before/)
  assert.match(css,/grid-template-areas: "menu context search nara inbox theme fullscreen bell profile"/)
  assert.match(css,/"menu context nara inbox theme bell profile"/)
  assert.match(css,/"profile profile nara inbox find"/)
  assert.match(css,/\[role="dialog"\]/)
  assert.doesNotMatch(css,/body \* \{ background: transparent/)
})

test('pre-paint bootstrap supports the same persisted options and legacy migration', () => {
  const layout=read('app/layout.tsx')
  assert.match(layout,/const APPEARANCE_BOOTSTRAP/)
  assert.match(layout,/aureka:appearance:v2/)
  assert.match(layout,/data-aureka-/)
  assert.match(layout,/data-aureka-surface/)
  assert.match(layout,/aureka-text-size/)
  assert.match(layout,/__html: APPEARANCE_BOOTSTRAP/)
})
