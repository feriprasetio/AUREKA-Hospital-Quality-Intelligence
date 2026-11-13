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
  assert.match(dashboard, /Ikhtisar Mutu dan Keselamatan Rumah Sakit/)
  assert.match(dashboard, /Tren pengumpulan dan validasi indikator/)
  assert.match(dashboard, /Tren laporan insiden keselamatan pasien/)
  assert.match(dashboard, /Distribusi indikator menurut kategori/)
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

test('Super Admin defaults to hospital-wide room scope and uses the workspace map on every module', () => {
  const homeClient = readFileSync(new URL('../components/HomeClient.tsx', import.meta.url), 'utf8')
  const map = readFileSync(new URL('../components/workspace/WorkspaceModuleMap.tsx', import.meta.url), 'utf8')
  const typography = readFileSync(new URL('../app/typography.css', import.meta.url), 'utf8')

  assert.match(homeClient, /\[allRoomsScope,setAllRoomsScope\]=useState\(true\)/)
  assert.match(homeClient, /Semua ruangan · lintas unit/)
  assert.match(homeClient, /const nodes=groups\.flatMap/)
  assert.match(homeClient, /if\(!nodes\.length\)return null/)
  assert.match(homeClient, /return <WorkspaceModuleMap/)
  assert.doesNotMatch(homeClient, /nodes\.length<2/)
  assert.doesNotMatch(typography, /\.wmmRoot\s*\{\s*display:\s*none/)
  assert.match(map, /wmmMapGrid/)
  assert.match(map, /@media \(max-width: 760px\)/)
  assert.match(map, /@media \(max-width: 480px\)/)
})

test('Super Admin quality results can aggregate every room without mixing reused indicator codes', () => {
  const results = readFileSync(new URL('../components/QualityResultsWorkspace.tsx', import.meta.url), 'utf8')
  const engine = readFileSync(new URL('../lib/aureka/quality-results-engine.ts', import.meta.url), 'utf8')

  assert.match(results, /if \(selectedRoom != null\) request = request\.eq\('room_id', selectedRoom\)/)
  assert.match(results, /selectedRoom == null && !canViewAllRooms/)
  assert.match(results, /calculateIndicatorResultsForProfiles/)
  assert.match(results, /roomId == null && <th>Unit kerja<\/th>/)
  assert.match(engine, /rows\.filter\(\(row\) => Number\(row\.room_id\) === Number\(profileRoomId\)\)/)
})
