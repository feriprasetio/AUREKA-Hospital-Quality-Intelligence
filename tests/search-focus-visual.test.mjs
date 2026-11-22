import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync(new URL('../app/aureka-canvas-preferences.css', import.meta.url), 'utf8')
const home = readFileSync(new URL('../components/HomeClient.tsx', import.meta.url), 'utf8')

test('global header search keeps a single integrated focus treatment', () => {
  assert.match(css, /\.workspaceGlobalSearch:focus-within\s*\{\s*outline:\s*none\s*!important/)
  assert.match(css, /\.workspaceGlobalSearch\s*>\s*input\[type="search"\]:is\(:focus, :focus-visible\)\s*\{\s*outline:\s*none\s*!important/)
  assert.match(css, /border:\s*2px solid var\(--aureka-color-information/)
  assert.match(css, /@media \(forced-colors: active\)/)
  assert.match(home, /id="workspaceGlobalSearchInput"/)
  assert.match(home, /role="combobox"/)
  assert.match(home, /aria-controls=\{globalSearch\.trim\(\)/)
  assert.match(home, /onChange=\{e=>dispatchWorkspaceSearch\(e\.target\.value\)\}/)
})
