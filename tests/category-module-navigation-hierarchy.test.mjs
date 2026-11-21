import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('global navigation follows the eight categories in Aureka Navigasi.docx', () => {
  const registry = read('lib/aureka/module-registry.ts')
  const app = read('components/HomeClient.tsx')
  const start = registry.indexOf('export const AUREKA_NAVIGATION_GROUPS')
  const end = registry.indexOf('] as const', start)
  const source = registry.slice(start, end)
  const categories = [
    'command_center',
    'patient_registry',
    'clinical_performance',
    'quality_patient_safety',
    'hospital_management',
    'education_training',
    'director_supervisory_board',
    'settings',
  ]
  for (const id of categories) assert.ok(source.includes("id:'" + id + "'"), 'missing category ' + id)
  assert.equal((source.match(/\{ id:'(?:command_center|patient_registry|clinical_performance|quality_patient_safety|hospital_management|education_training|director_supervisory_board|settings)'/g) || []).length, 8)

  const qualityStart = source.indexOf("{ id:'quality_patient_safety'")
  const managementStart = source.indexOf("{ id:'hospital_management'", qualityStart)
  const qualityGroup = source.slice(qualityStart, managementStart)
  for (const id of ['secretariat','quality_indicators','patient_safety','risk_management']) {
    assert.ok(qualityGroup.includes("id:'" + id + "'"), 'Peningkatan Mutu and Keselamatan Pasien must own ' + id)
  }
  assert.doesNotMatch(qualityGroup, /id:'safety'|id:'risk'|id:'annual_program'/)
  assert.match(app, /id:'programs',label:'Program Kerja Tahunan',children:/)

  const dashboardStart = source.indexOf("{ id:'command_center'")
  const patientStart = source.indexOf("{ id:'patient_registry'", dashboardStart)
  const dashboardGroup = source.slice(dashboardStart, patientStart)
  assert.match(dashboardGroup, /id:'dashboard', label:'Dashboard', moduleId:'home'/)
  assert.doesNotMatch(dashboardGroup, /nara_ai|cross_domain_analytics|Analitik & Infografis/)

  const educationStart = source.indexOf("{ id:'education_training'")
  const boardStart = source.indexOf("{ id:'director_supervisory_board'", educationStart)
  const educationGroup = source.slice(educationStart, boardStart)
  assert.match(educationGroup, /id:'in_house_training'/)
  assert.match(educationGroup, /id:'student_orientation'/)

  assert.match(app, /visibleSidebarDomains\.map\(domain=>/)
  assert.match(app, /domain\.items\.map\(item=>/)
  assert.match(app, /aria-label="Delapan kategori utama AUREKA"/)
})

test('sidebar is two levels only; module tabs and subtabs use the contextual navigation bar', () => {
  const app = read('components/HomeClient.tsx')
  const nav = read('components/navigation/UnifiedModuleNavigation.tsx')
  assert.match(app, /className="sidebarModuleNode"/)
  assert.doesNotMatch(app, /sidebarModuleChildren|sidebarModuleChild|showNested|nestedItems/)
  assert.match(app, /\{activeNavGroups\.length>0&&<UnifiedModuleNavigation/)
  assert.match(app, /activeRailItems/)
  assert.match(app, /activeRailSubItems/)
  assert.match(nav, /subItems\?: UnifiedNavigationItem\[\]/)
  assert.match(nav, /disabled=\{item\.disabled\}/)
})

test('clinical and quality contextual navigation follows the document and preserves integrated results', () => {
  const app = read('components/HomeClient.tsx')
  const quality = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(app, /quality:role==='DEWAN_PENGAWAS' \? \[\] : \[/)
  assert.match(app, /\{id:'audit-indicators',label:'Form Logbook'\}/)
  assert.match(app, /\{id:'profile-indicators',label:'Profil Indikator'\}/)
  assert.match(app, /label:'Monitoring Pelaporan dan Kinerja PIC'/)
  assert.match(app, /label:'Pusat Rekonsiliasi'/)
  assert.doesNotMatch(app, /id:'result-indicators',label:'Hasil Capaian'/)
  assert.match(app, /qualityLogbookResultsStack/)
  assert.match(quality, /Logbook/)
  assert.match(app, /<QualityIndicatorWorkspace[\s\S]*?initialContainer="Audit Indikator Mutu" showContainerTabs=\{false\}/)
  assert.match(app, /<QualityResultsWorkspace[\s\S]*?mode="indicators"/)
})

test('patient safety and risk tabs use the specified hierarchy without invented navigation items', () => {
  const app = read('components/HomeClient.tsx')
  assert.match(app, /id:'grp-incident',label:'Insiden',children:/)
  assert.match(app, /\{id:'incidents',label:'Register Insiden'\}/)
  assert.match(app, /\{id:'investigation',label:'Investigasi'\}/)
  assert.match(app, /\{id:'fmea-reactive',label:'FMEA Reaktif',hint:/)
  assert.match(app, /ReactiveFmeaWorkspace/)
  assert.match(app, /active==='safety'&&safetyTab==='fmea-reactive'/)
  assert.match(app, /id:'grp-culture',label:'Budaya',children:/)
  assert.match(app, /\{id:'survey',label:'Form Survei Tahunan'\}/)
  assert.match(app, /\{id:'responses',label:'Register Survei Tahunan'\}/)
  assert.match(app, /id:'grp-register',label:'Register Risiko',children:/)
  assert.match(app, /\{id:'connections',label:'Konektor Risiko'\}/)
  assert.match(app, /\{id:'profile',label:'Profil Risiko'\}/)
  assert.match(app, /\{id:'fmea',label:'Analisis FMEA Preventif'\}/)
  assert.match(app, /\{id:'mitigation',label:'Mitigasi dan Rencana Tindak Pengendalian'\}/)
  assert.doesNotMatch(app, /id:'evaluation',label:'Evaluasi Keberhasilan'/)
})

test('Manajemen Rumah Sakit contextual navigation separates workforce, professional performance and SPM/SPO', () => {
  const app = read('components/HomeClient.tsx')
  const registry = read('lib/aureka/module-registry.ts')
  assert.match(app, /id:'professional-performance',label:'OPPE dan FPPE',children:/)
  assert.match(app, /\{id:'directory',label:'Tenaga Kerja'\}/)
  assert.match(app, /\{id:'team',label:'Tim dan Penugasan'\}/)
  assert.match(app, /\{id:'oppe-fppe',label:'OPPE'\}/)
  assert.match(app, /\{id:'fppe',label:'FPPE'\}/)
  assert.match(app, /activeNavGroups=\[\{id:'spm',label:'Standar Pelayanan Minimal'/)
  assert.match(app, /id:'sop',label:'Standar Prosedur Operasional'/)
  assert.doesNotMatch(app, /id:'sop',label:'Standar Prosedur Operasional',disabled:true/)
  assert.match(registry, /id:'quality_development', label:'Pengembangan dan Pengendalian Mutu'/)
})

test('planned modules are visibly non-interactive rather than opening incomplete workspaces', () => {
  const app = read('components/HomeClient.tsx')
  const registry = read('lib/aureka/module-registry.ts')
  const nav = read('components/navigation/UnifiedModuleNavigation.tsx')
  assert.match(registry, /id:'in_house_training'.*childId:'training'.*status:'available'/)
  assert.match(app, /InHouseTrainingWorkspace/)
  assert.match(registry, /id:'realcost_audit'.*childId:'realcost'.*status:'available'/)
  assert.doesNotMatch(registry, /status:'planned', note:'Menunggu workbook XLSX Realcost/)
  assert.match(registry, /id:'secretariat'.*status:'beta'/)
  assert.match(app, /if\(item\.status==='planned'\)return/)
  assert.match(nav, /disabled=\{item\.disabled\}/)
})
