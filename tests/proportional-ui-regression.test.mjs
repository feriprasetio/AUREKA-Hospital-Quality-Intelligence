import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const home = readFileSync(new URL('../components/HomeLandingWorkspace.tsx', import.meta.url), 'utf8')
const layout = readFileSync(new URL('../app/layout.tsx', import.meta.url), 'utf8')
const polish = readFileSync(new URL('../app/proportional-ui.css', import.meta.url), 'utf8')

test('Beranda Infografis renders the integrated Ikhtisar dashboard', () => {
  const dashboard = readFileSync(new URL('../components/governance/InfographicsDashboard.tsx', import.meta.url), 'utf8')
  assert.match(home, /import InfographicsDashboard from '@\/components\/governance\/InfographicsDashboard'/)
  assert.match(home, /tab==='infographics'[\s\S]*<InfographicsDashboard[\s\S]*mode="full"/)
  assert.match(dashboard, /Ikhtisar Kinerja Mutu dan Keselamatan Rumah Sakit/)
  assert.match(dashboard, /Tren data indikator/)
  assert.match(dashboard, /Tren insiden keselamatan pasien/)
  assert.match(dashboard, /Distribusi kategori indikator/)
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
