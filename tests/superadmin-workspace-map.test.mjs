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
  assert.ok(home.includes("import UnifiedModuleNavigation from '@/components/navigation/UnifiedModuleNavigation'"))
  assert.ok(home.includes('<UnifiedModuleNavigation'))
  assert.ok(home.includes('activeNestedNavGroup'))
  assert.ok(home.includes('activeRailTitle'))
  assert.ok(home.includes('const activeRailItems=activeNavGroups.map(group=>({id:group.id,label:group.label}))'))
  for (const legacy of ['WorkspaceModuleMap', 'mapNodes', 'wmmMap']) assert.ok(!home.includes(legacy))
  assert.ok(navCss.includes('.workspaceNavigationRail'))
  assert.ok(!/onPointerEnter|onPointerLeave|wmmMapPanel/.test(navCss))
})

test('the results rail exposes only the active Hasil Capaian group and its two sub-tabs', () => {
  assert.ok(home.includes("{id:'result-indicators',label:'Hasil Capaian',children:[{id:'result-unit',label:'Unit Keseluruhan'},{id:'result-category',label:'Kategori Indikator'}]}"))
  assert.ok(home.includes("const activeNestedNavGroup=activeNavGroups.find"))
  assert.ok(home.includes('const activeRailTitle=activeNavModuleLabel'))
  assert.ok(home.includes('title={activeRailTitle}'))
  assert.ok(home.includes("const activeRailItems=activeNavGroups.map(group=>({id:group.id,label:group.label}))"))
  assert.ok(home.includes('activeId={activeNavPrimaryId}'))
  assert.ok(home.includes('secondaryActiveId={activeNavSecondaryId}'))
  assert.ok(home.includes("onSubSelect={childId=>{if(activeNavModuleId==='patients')"))
  assert.ok(home.includes('selectSidebarChild(activeNavModuleId,childId)'))
})

test('sidebar only renders module buttons and contains no tree or child-menu state', () => {
  assert.ok(home.includes('aria-label="Navigasi modul AUREKA"'))
  assert.ok(home.includes("visibleMods.map(([id,label])=>"))
  assert.ok(home.includes("onClick={()=>openMainModule(id)}"))
  for (const legacy of ['sidebarTreeChildren', 'sidebarNestedGroup', 'closedNav', 'toggleNav(']) assert.ok(!home.includes(legacy))
  assert.ok(!home.includes("aria-expanded={hasKids"))
})

test('navigation rail visually follows the current AUREKA workspace tabs', () => {
  const globalNavigation = read('app/aureka-global-navigation.css')
  const rootLayout = read('app/layout.tsx')
  assert.ok(rootLayout.includes('<html lang="id" data-skin="arktik"'))
  assert.ok(!globalNavigation.includes('html[data-skin="arktik"][data-theme]'))
  assert.ok(globalNavigation.includes('html[data-skin="arktik"] body .workspaceRoot.workspaceDesk[data-aureka-theme]'))
  const navigation = read('app/aureka-navigation-consolidated.css')
  const workspace = read('app/workspace-desk.css')
  assert.ok(navigation.includes('background: #f1f5ef !important;'))
  assert.ok(navigation.includes('border: 1px solid #e0e7dc !important;'))
  assert.ok(navigation.includes('border-radius: 6px !important;'))
  assert.ok(navigation.includes('background: #fff !important;'))
  assert.ok(navigation.includes('color: #205f46 !important;'))
  assert.ok(navigation.includes('min-height: 34px !important;'))
  assert.ok(workspace.includes('background: #f1f5ef !important;'))
  assert.ok(workspace.includes('border-color: #dce5d8 !important; background: #fff !important; color: #205f46 !important;'))
})

test('module-local search controls are hidden while header search dispatch remains available', () => {
  assert.ok(home.includes('workspaceGlobalSearchInput'))
  assert.ok(home.includes('dispatchWorkspaceSearch(e.target.value)'))
  assert.ok(home.includes('aureka:workspace-search'))
  for (const selector of ['.prSearch', '.rmSearch', '.sdSearch', '.acdLocalSearch', '.cpLocalSearch', '.psLocalSearch', '.oppeLocalSearch', '.fppeLocalSearch', '.adminLocalSearch', '.qualitySettingsLocalSearch']) {
    assert.ok(navCss.includes(selector), 'Missing hidden local-search selector: ' + selector)
  }
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

test('patient workspace is read-only and no longer mounts a duplicate episode-entry form', () => {
  const analytics = read('components/patient-registry/PatientRecordAnalytics.tsx')
  assert.ok(patientRegistry.includes('<PatientIndexTab'))
  assert.ok(patientRegistry.includes('<PatientRecordAnalytics'))
  assert.ok(!patientRegistry.includes('QualityIndicatorWorkspace'))
  assert.ok(!patientRegistry.includes('patientRegistryMode'))
  assert.ok(!patientRegistry.includes('firstRoomWithData'))
  assert.ok(analytics.includes('Tidak ada formulir input atau perubahan logbook'))
  assert.ok(analytics.includes('aureka_patient_episode_stats'))
})


test('navigation rail is condensed for table-first workflows without removing tab affordances', () => {
  assert.match(navCss, /AUREKA table-first logbook density/)
  assert.match(navCss, /\.workspaceNavigationRailTitle \{[\s\S]*min-height: 24px !important/)
  assert.match(navCss, /\.workspaceNavigationRailItem \{[\s\S]*min-height: 23px !important/)
  assert.ok(navCss.includes('background: #fff !important;'))
  assert.ok(navCss.includes('color: #205f46 !important;'))
})


test('Arktik navigation uses a darker blue module shape and lighter blue sub-tab shapes', () => {
  const navigation = read('app/aureka-navigation-consolidated.css')
  assert.match(navigation, /AUREKA Arktik blue tab hierarchy/)
  assert.match(navigation, /workspaceNavigationRailTitle \{[\s\S]*background: #d7e5f2 !important/)
  assert.match(navigation, /workspaceNavigationRailItem \{[\s\S]*background: #edf4fa !important/)
  assert.match(navigation, /workspaceNavigationRailItem\.active \{[\s\S]*background: #dce9f5 !important/)
  assert.match(navigation, /data-mode="gelap"[\s\S]*workspaceNavigationRailItem\.active/)
})


test('Arktik module tabs use blue shapes and lighter blue subtabs', () => {
  const css = read('app/aureka-navigation-consolidated.css')
  const start = css.indexOf('AUREKA Arktik navigation blue hierarchy')
  assert.ok(start >= 0)
  const blue = css.slice(start)
  assert.match(blue, /workspaceNavigationRail \.workspaceNavigationRailTitle \{[\s\S]*background: #d4e4f2 !important/)
  assert.match(blue, /workspaceNavigationRail \.workspaceNavigationRailItem \{[\s\S]*background: #edf5fb !important/)
  assert.match(blue, /workspaceNavigationRail \.workspaceNavigationRailItem\.active \{[\s\S]*background: #dcebf8 !important/)
  assert.match(blue, /data-mode="gelap"[\s\S]*workspaceNavigationRailItem\.active/)
})


test('global contextual navigation cannot disappear when a module route lacks a registry match', () => {
  assert.ok(home.includes("const activeNavModuleId=activeNavEntry?.[0]||(active==='home'?'home':active)"))
  assert.ok(home.includes("(MODS.find(([id])=>id===active)?.[1])"))
  const globalNavigation = read('app/aureka-global-navigation.css')
  assert.ok(globalNavigation.includes('html[data-skin="arktik"] body .workspaceRoot.workspaceDesk[data-aureka-theme] .workspaceNavigationRail {'))
  assert.ok(globalNavigation.includes('visibility: visible !important;'))
  assert.ok(globalNavigation.includes('background: #172a40 !important;'))
  assert.ok(globalNavigation.includes('background: #dcebf8 !important;'))
  assert.ok(globalNavigation.includes('background: #edf4fa !important;'))
})
