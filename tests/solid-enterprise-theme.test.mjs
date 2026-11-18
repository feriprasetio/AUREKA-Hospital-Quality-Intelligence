import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('legacy Solid override styles are not part of the active Arktik cascade', () => {
  const layout = read('app/layout.tsx')
  for (const legacy of ["./solid-default.css", "./aureka-solid-enterprise.css", "./aureka-solid-navigation.css"]) {
    assert.ok(!layout.includes("import '" + legacy + "'"), legacy + ' must remain inactive')
  }
  assert.ok(layout.includes("import './theme-arktik.css'"))
  assert.ok(layout.includes("import './theme-arktik-dark.css'"))
  assert.ok(layout.includes("import './dark-mode-mobile-fixes.css'"))
})

test('Arktik retains the approved Plus Jakarta Sans font and risk design tokens', () => {
  const skin = read('app/theme-arktik.css')
  const tokens = read('app/design-tokens.css')
  assert.doesNotMatch(skin, /fonts\.googleapis\.com|font-family:\s*["']Inter["']/i)
  assert.match(skin, /var\(--font-aureka\)/)
  for (const token of ['--aureka-risk-very-low','--aureka-risk-low','--aureka-risk-moderate','--aureka-risk-high','--aureka-risk-very-high']) {
    assert.ok(tokens.includes(token), 'Missing clinical risk token: ' + token)
  }
})
