import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

const navigation = read('components/navigation/UnifiedModuleNavigation.tsx')
const css = read('app/aureka-navigation-pill.css')

test('phone and desktop share the same scrollable navigation with optional subnavigation', () => {
  assert.match(navigation, /items\.map\(item =>/)
  assert.match(navigation, /subItems\.length > 0 &&/)
  assert.doesNotMatch(navigation, /<details|Lainnya|hiddenIds/)
  assert.match(css, /overflow-x: auto/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /max-width: 720px/)
  assert.match(css, /pointer: coarse[\s\S]*min-height: 44px/)
  assert.match(read('components/layout/useAccessibleSidebar.ts'), /matchMedia\(PHONE_DRAWER_MEDIA_QUERY\)/)
})
