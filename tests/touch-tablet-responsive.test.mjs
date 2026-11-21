import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { TOUCH_DRAWER_MEDIA_QUERY, usesTouchDrawer } from '../lib/ui/device-navigation.ts'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('single responsive drawer query supports wide high-DPI coarse-pointer tablets', () => {
  assert.match(TOUCH_DRAWER_MEDIA_QUERY, /max-width: 1180px/)
  assert.match(TOUCH_DRAWER_MEDIA_QUERY, /pointer: coarse/)
  assert.match(TOUCH_DRAWER_MEDIA_QUERY, /max-width: 1600px/)
  assert.equal(usesTouchDrawer(q=>({matches:q===TOUCH_DRAWER_MEDIA_QUERY})),true)
  assert.equal(usesTouchDrawer(()=>({matches:false})),false)
  const home=read('components/HomeClient.tsx')
  const controller=read('components/layout/useAccessibleSidebar.ts')
  assert.match(home,/window\.matchMedia\(TOUCH_DRAWER_MEDIA_QUERY\)\.matches/)
  assert.match(controller,/window\.matchMedia\(TOUCH_DRAWER_MEDIA_QUERY\)/)
  const tabletMedia=/\(pointer: coarse\) and \(min-width: 1181px\) and \(max-width: 1600px\)/
  assert.match(read('app/aureka-navigation-system.css'),tabletMedia)
  assert.match(read('app/aureka-canvas-preferences.css'),tabletMedia)
})
