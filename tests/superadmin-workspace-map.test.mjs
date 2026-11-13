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
  assert.ok(home.includes("[allRoomsScope,setAllRoomsScope]=useState(true)"))
  assert.ok(home.includes("if(raw==='all'){updateWorkspaceRoom(null);return}"))
  assert.ok(home.includes("lockRoomScope={admin&&!allRoomsScope}"))
})

test('workspace uses one static contextual tab rail; navigation maps are removed', () => {
  assert.ok(home.includes('workspaceNavigationRail'))
  assert.ok(home.includes('activeNestedNavGroup'))
  assert.ok(home.includes('activeRailTitle'))
  assert.ok(home.includes('activeRailItems'))
  for (const legacy of ['WorkspaceModuleMap', 'mapNodes', 'wmmMap']) assert.ok(!home.includes(legacy))
  assert.ok(navCss.includes('.workspaceNavigationRail'))
  assert.ok(!/onPointerEnter|onPointerLeave|wmmMapPanel/.test(navCss))
})

test('the results rail exposes only the active Hasil Capaian group and its two sub-tabs', () => {
  assert.ok(home.includes("{id:'result-indicators',label:'Hasil Capaian',children:[{id:'result-unit',label:'Unit Keseluruhan'},{id:'result-category',label:'Kategori Indikator'}]}"))
  assert.ok(home.includes("const activeNestedNavGroup=activeNavGroups.find"))
  assert.ok(home.includes("const activeRailTitle=activeNestedNavGroup?.label||activeNavModuleLabel"))
  assert.ok(home.includes("const activeRailItems=activeNestedNavGroup?.children||activeNavGroups"))
  assert.ok(home.includes("onClick={()=>selectSidebarChild(activeNavModuleId,item.id)}"))
})

test('sidebar only renders module buttons and contains no tree or child-menu state', () => {
  assert.ok(home.includes('aria-label="Navigasi modul AUREKA"'))
  assert.ok(home.includes("visibleMods.map(([id,label])=>"))
  assert.ok(home.includes("onClick={()=>openMainModule(id)}"))
  for (const legacy of ['sidebarTreeChildren', 'sidebarNestedGroup', 'closedNav', 'toggleNav(']) assert.ok(!home.includes(legacy))
  assert.ok(!home.includes("aria-expanded={hasKids"))
})

test('module-local search controls are hidden while header search dispatch remains available', () => {
  assert.ok(home.includes('workspaceGlobalSearchInput'))
  assert.ok(home.includes('dispatchWorkspaceSearch(e.target.value)'))
  assert.ok(home.includes('aureka:workspace-search'))
  for (const selector of ['.prSearch', '.rmSearch', '.sdSearch', '.acdLocalSearch', '.cpLocalSearch', '.psLocalSearch', '.oppeLocalSearch', '.fppeLocalSearch', '.adminLocalSearch', '.qualitySettingsLocalSearch']) {
    assert.ok(navCss.includes(selector), 'Missing hidden local-search selector: ' + selector)
  }
  assert.ok(patientRegistry.includes('aureka:workspace-search'))
  assert.ok(patientIndex.includes('aureka:workspace-search'))
})

test('Superadmin logbook opens a privacy-safe index of every active room', () => {
  assert.ok(audit.includes('if(isAdmin)return null'))
  assert.ok(audit.includes('Logbook semua ruangan'))
  assert.ok(audit.includes("select('id',{count:'exact',head:true})"))
  assert.ok(audit.includes('onRoomChange?.(nextRoomId)'))
  assert.ok(audit.includes('data individual tidak ditampilkan'))
})

test('hospital-wide quality results include source fields required by operational indicators', () => {
  assert.ok(results.includes('selectedRoom == null || selectedRoom === 5 || selectedRoom === 11'))
  assert.ok(results.includes('calculateIndicatorResultsForProfiles'))
})

test('patient-entry workspace does not silently choose the first room', () => {
  assert.ok(patientRegistry.includes('initialRoomId||null'))
  assert.ok(!patientRegistry.includes('initialRoomId||firstRoomWithData||null'))
})
