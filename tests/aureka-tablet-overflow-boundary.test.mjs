import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const mobile = read('app/mobile-nav.css')
const navigation = read('app/aureka-navigation-system.css')
const bundle = read('app/aureka-global.css')

test('phone overflow clipping ends before tablet sidebar begins at 721px', () => {
  assert.match(navigation, /@media \(min-width: 721px\) and \(max-width: 860px\)/)
  assert.match(mobile, /@media \(max-width: 720px\) \{\s*html body \.workspaceRoot \.workspaceContent \{ max-width: 100vw !important; overflow-x: clip !important; \}/)
  assert.doesNotMatch(mobile, /@media \(max-width: 760px\) \{\s*html body \.workspaceRoot \.workspaceContent \{ max-width: 100vw !important; overflow-x: clip !important; \}/)
})

test('canonical Arktik navigation remains the final imported shell layer', () => {
  assert.ok(bundle.indexOf("@import './mobile-nav.css';") < bundle.indexOf("@import './aureka-navigation-system.css';"))
})
