import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const home = read('components/HomeClient.tsx')
const navCss = read('app/aureka-navigation-consolidated.css')
const results = read('components/QualityResultsWorkspace.tsx')
const audit = read('components/QualityIndicatorWorkspace.tsx')
const patientRegistry = read('components/PatientRegistryWorkspace.tsx')
const patientIndex = read('components/patient-registry/PatientIndexTab.tsx')

test('Superadmin starts with whole-hospital scope and can choose any room', () => {
  assert.match(home, /\\[allRoomsScope,setAllRoomsScope\\]=useState\\(true\\)/)
  assert.match(home, /if\\(raw==='all'\\)\\{updateWorkspaceRoom\\(null\\);return\\}/)
  assert.match(home, /lockRoomScope=\\{admin&&!allRoomsScope\\}/)
})

test('workspace uses one static contextual tab rail; navigation maps are removed', () => {
  assert.match(home, /workspaceNavigationRail/)
  assert.match(home, /activeNestedNavGroup/)
  assert.match(home, /activeRailTitle/)
  assert.match(home, /activeRailItems/)
  assert.doesNotMatch(home, /WorkspaceModuleMap|mapNodes|wmmMap/)
  assert.match(navCss, /\\.workspaceNavigationRail/)
  assert.doesNotMatch(navCss, /onPointerEnter|onPointerLeave|wmmMapPanel/)
})

test('the results rail exposes only the active Hasil Capaian group and its two sub-tabs', () => {
  assert.match(home, /\\{id:'result-indicators',label:'Hasil Capaian',children:\\[\\{id:'result-unit',label:'Unit Keseluruhan'\\},\\{id:'result-category',label:'Kategori Indikator'\\}\\]\\}/)
  assert.match(home, /const activeNestedNavGroup=activeNavGroups\\.find/)
  assert.match(home, /const activeRailTitle=activeNestedNavGroup\\?\\.label\\|\\|activeNavModuleLabel/)
  assert.match(home, /const activeRailItems=activeNestedNavGroup\\?\\.children\\|\\|activeNavGroups/)
  assert.match(home, /onClick=\\{\\(\\)=>selectSidebarChild\\(activeNavModuleId,item.id\\)\\}/)
})

test('sidebar only renders module buttons and contains no tree or child-menu state', () => {
  assert.match(home, /aria-label="Navigasi modul AUREKA"/)
  assert.match(home, /visibleMods\\.map\\(\\(\\[id,label\\]\\)=>/)
  assert.match(home, /onClick=\\{\\(\\)=>openMainModule\\(id\\)\\}/)
  assert.doesNotMatch(home, /sidebarTreeChildren|sidebarNestedGroup|closedNav|toggleNav\\(/)
  assert.doesNotMatch(home, /aria-expanded=\\{hasKids/)
})

test('module-local search controls are hidden while header search dispatch remains available', () => {
  assert.match(home, /workspaceGlobalSearchInput/)
  assert.match(home, /dispatchWorkspaceSearch\\(e\\.target\\.value\\)/)
  assert.match(home, /aureka:workspace-search/)
  for (const selector of ['.prSearch', '.rmSearch', '.sdSearch', '.acdLocalSearch', '.cpLocalSearch', '.psLocalSearch', '.oppeLocalSearch', '.fppeLocalSearch', '.adminLocalSearch', '.qualitySettingsLocalSearch']) {
    assert.ok(navCss.includes(selector), 'Missing hidden local-search selector: ' + selector)
  }
  assert.match(patientRegistry, /aureka:workspace-search/)
  assert.match(patientIndex, /aureka:workspace-search/)
})

test('Superadmin logbook opens a privacy-safe index of every active room', () => {
  assert.match(audit, /if\\(isAdmin\\)return null/)
  assert.match(audit, /Logbook semua ruangan/)
  assert.match(audit, /select\\('id',\\{count:'exact',head:true\\}\\)/)
  assert.match(audit, /onRoomChange\\?\\.\\(nextRoomId\\)/)
  assert.match(audit, /data individual tidak ditampilkan/)
})

test('hospital-wide quality results include source fields required by operational indicators', () => {
  assert.match(results, /selectedRoom == null \\|\\| selectedRoom === 5 \\|\\| selectedRoom === 11/)
  assert.match(results, /calculateIndicatorResultsForProfiles/)
})

test('patient-entry workspace does not silently choose the first room', () => {
  assert.match(patientRegistry, /initialRoomId\\|\\|null/)
  assert.doesNotMatch(patientRegistry, /initialRoomId\\|\\|firstRoomWithData\\|\\|null/)
})
