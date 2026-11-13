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
  assert.equal([...layout.matchAll(/import ['\"]\.\/([^'\"]+\.css)['\"]/g)].map(m=>m[1]).at(-1),'aureka-navigation-consolidated.css')
})

test('Super Admin uses a compact static tab rail and a module-only sidebar', () => {
  const homeClient = readFileSync(new URL('../components/HomeClient.tsx', import.meta.url), 'utf8')
  const navCss = readFileSync(new URL('../app/aureka-navigation-consolidated.css', import.meta.url), 'utf8')
  const solidCss = readFileSync(new URL('../app/aureka-solid-navigation.css', import.meta.url), 'utf8')
  const infographics = readFileSync(new URL('../components/governance/InfographicsDashboard.tsx', import.meta.url), 'utf8')
  const homeLanding = readFileSync(new URL('../components/HomeLandingWorkspace.tsx', import.meta.url), 'utf8')

  assert.ok(homeClient.includes("[allRoomsScope,setAllRoomsScope]=useState(true)"))
  assert.ok(homeClient.includes("Semua ruangan · lintas unit"))
  assert.ok(homeClient.includes("workspaceNavigationRail"))
  assert.ok(homeClient.includes("activeNestedNavGroup"))
  assert.ok(homeClient.includes("activeRailTitle"))
  assert.ok(homeClient.includes("activeRailItems"))
  for (const legacy of ['WorkspaceModuleMap', 'mapNodes', 'sidebarTreeChildren', 'closedNav', 'toggleNav(']) assert.ok(!homeClient.includes(legacy))
  assert.ok(homeClient.includes('aria-label="Navigasi modul AUREKA"'))
  assert.ok(navCss.includes(".workspaceNavigationRail"))
  assert.ok(navCss.includes("overflow-x: auto"))
  assert.ok(navCss.includes("max-width: 720px"))
  assert.ok(navCss.includes(".prSearch") && navCss.includes(".rmSearch"))
  assert.ok(solidCss.includes("sidebarIsCollapsed"))
  assert.ok(infographics.includes("useState(initialRoomId == null ? '' : String(initialRoomId))"))
  assert.ok(infographics.includes("setRoomValue(initialRoomId == null ? '' : String(initialRoomId))"))
  assert.ok(infographics.includes("onRoomChange?.(next ? Number(next) : null)"))
  assert.ok(homeLanding.includes("onRoomChange={onRoomChange}"))
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
