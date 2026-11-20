import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('global sidebar uses seven categories and module-level entries only', () => {
  const registry = read('lib/aureka/module-registry.ts')
  const app = read('components/HomeClient.tsx')
  const start = registry.indexOf('export const AUREKA_NAVIGATION_GROUPS')
  const end = registry.indexOf('] as const', start)
  const source = registry.slice(start, end)

  for (const id of ['command_center','patient_registry','clinical_performance','quality_patient_safety','hospital_management','director_supervisory_board','settings']) {
    assert.ok(source.includes("id:'" + id + "'"), 'missing category ' + id)
  }
  for (const label of [
    'Pengembangan dan Pengendalian Mutu',
    'Sumber Daya Manusia',
    'Pendidikan dan Pelatihan',
    'Preferensi Akun',
    'Preferensi Sistem',
  ]) assert.ok(source.includes("label:'" + label + "'"), 'missing sidebar module ' + label)

  for (const tabLabel of ['Standar Pelayanan Minimal (SPM)','Standar Prosedur Operasional (SPO)','Tenaga Kerja','Tim dan Penugasan','OPPE','FPPE','In House Training','Orientasi Mahasiswa','Profil Pengguna','Konfigurasi Sistem','Preferensi Tampilan']) {
    assert.ok(!source.includes("label:'" + tabLabel + "'"), 'tab leaked into global sidebar: ' + tabLabel)
  }
  assert.match(app, /visibleSidebarDomains\.map\(domain=>/)
  assert.match(app, /domain\.items\.map\(item=>/)
  assert.match(app, /aria-label="Tujuh kategori utama AUREKA"/)
})

test('Manajemen Rumah Sakit contextual navigation separates modules, tabs and subtabs', () => {
  const app = read('components/HomeClient.tsx')
  const nav = read('components/navigation/UnifiedModuleNavigation.tsx')
  assert.match(app, /id:'workforce',label:'Sumber Daya Manusia',children:/)
  assert.match(app, /id:'professional-performance',label:'OPPE dan FPPE',children:/)
  assert.match(app, /id:'account',label:'Preferensi Akun',children:/)
  assert.match(app, /id:'system',label:'Preferensi Sistem',children:/)
  assert.match(app, /quality-development.*children:\[\{id:'spm'/)
  assert.match(app, /id:'sop',label:'Standar Prosedur Operasional',disabled:true/)
  assert.match(nav, /disabled=\{item\.disabled\}/)
})

test('planned modules and tabs are visibly non-interactive rather than opening incomplete workspaces', () => {
  const app = read('components/HomeClient.tsx')
  const registry = read('lib/aureka/module-registry.ts')
  const nav = read('components/navigation/UnifiedModuleNavigation.tsx')
  assert.match(registry, /status:'planned', note:'Register IHT/)
  assert.match(registry, /status:'planned', note:'Menunggu workbook XLSX Realcost/)
  assert.match(app, /if\(item\.status==='planned'\)return/)
  assert.match(nav, /disabled=\{item\.disabled\}/)
})


test('module pages are navigated from the expanded category sidebar, not a duplicate horizontal rail', () => {
  const app = read('components/HomeClient.tsx')
  const css = read('app/aureka-global-navigation.css')
  assert.match(app, /className="sidebarModuleChildren"/)
  assert.match(app, /className="sidebarModuleChild"/)
  assert.match(app, /nestedItems\.map\(child/)
  assert.match(app, /selectSidebarChild\(item\.moduleId,child\.id\)/)
  assert.match(app, /item\.id==='quality_indicators'/)
  assert.match(app, /item\.id==='patient_safety'/)
  assert.match(app, /item\.id==='risk_management'/)
  assert.match(app, /item\.id==='annual_program'/)
  assert.match(app, /\{false&&activeNavModuleId&&<UnifiedModuleNavigation/)
  assert.match(css, /\.sidebarModuleChildren/)
  assert.match(css, /\.sidebarModuleChild\.active/)
})
