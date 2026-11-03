import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Solid Enterprise theme is loaded after every legacy stylesheet', () => {
  const layout = read('app/layout.tsx')
  const styles = [
    "./globals.css",
    "./clinical-ui.css",
    "./medidash-ui.css",
    "./solid-default.css",
    "./medidash-polish.css",
    "./design-tokens.css",
    "./layout-responsive.css",
    "./aureka-solid-enterprise.css",
  ]
  let previous = -1
  for (const style of styles) {
    const position = layout.indexOf(`import '${style}'`)
    assert.ok(position > previous, `${style} must retain the intended cascade order`)
    previous = position
  }
})

test('Solid Enterprise theme applies real shell, module, form, table and dialog styles', () => {
  const css = read('app/aureka-solid-enterprise.css')
  const requiredRules = [
    '.workspaceRoot .sidebar',
    '.workspaceRoot .workspaceHeaderBar',
    '.workspaceRoot .moduleEnter',
    '.workspaceRoot .moduleEnter .ovHero',
    '.workspaceRoot .moduleEnter .aqBtn.primary',
    '.workspaceRoot .moduleEnter .psBtn.primary',
    '.workspaceRoot .moduleEnter .rmButton.primary',
    '.workspaceRoot .moduleEnter table',
    '.workspaceRoot .workspaceNotificationPanel',
    '.authPage .authCard',
  ]
  for (const rule of requiredRules) {
    assert.ok(css.includes(rule), `Missing required visual rule: ${rule}`)
  }
  assert.match(css, /font-family:\s*"Aptos"/)
  assert.match(css, /prefers-reduced-motion:\s*reduce/)
  assert.doesNotMatch(css, /backdrop-filter:\s*blur\([^)]*\)\s*!important/)
})

test('theme migration remains presentation-only and preserves the AUREKA risk scale', () => {
  const tokens = read('app/design-tokens.css')
  const css = read('app/aureka-solid-enterprise.css')
  for (const token of [
    '--aureka-risk-very-low',
    '--aureka-risk-low',
    '--aureka-risk-moderate',
    '--aureka-risk-high',
    '--aureka-risk-very-high',
  ]) {
    assert.ok(tokens.includes(token), `Missing clinical risk token: ${token}`)
  }
  assert.match(css, /No component behavior, data, clinical rules,[\s\S]*permissions/)
})
