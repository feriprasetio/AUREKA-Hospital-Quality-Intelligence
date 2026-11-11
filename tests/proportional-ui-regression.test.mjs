import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../components/HomeLandingWorkspace.tsx', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
const polish = readFileSync(new URL('../app/proportional-ui.css', import.meta.url), 'utf8')

test('interactive infographics expose selectors and responsive charts', () => {
  assert.match(home, /type InfographicChartType = 'line' \| 'area' \| 'bar' \| 'doughnut'/)
  assert.match(home, /value="diagnosis">Distribusi diagnosis/)
  assert.match(home, /className="hlFilterGrid"/)
  assert.match(home, /<InfographicChart data=\{infographic.data\}/)
  assert.match(home, /className="hlPanel hlExplorer"/)
  assert.match(polish, /\.homeLanding \.hlChart svg[\s\S]*width: 100% !important/)
  assert.match(polish, /max-height: 238px/)
})

test('shared controls and data cards have normalized dimensions', () => {
  assert.match(polish, /--aureka-control-height: 40px/)
  assert.match(polish, /min-height: var\(--aureka-control-height\)/)
  assert.match(polish, /min-height: 116px/)
  assert.match(polish, /min-height: 38px/)
})

test('proportional UI stylesheet loads after existing theme and motion styles', () => {
  assert.ok(layout.indexOf("import './proportional-ui.css'") > layout.indexOf("import './landing-motion.css'"))
  assert.equal([...layout.matchAll(/import ['\"]\.\/([^'\"]+\.css)['\"]/g)].map(m=>m[1]).at(-1),'motion.css')
})
