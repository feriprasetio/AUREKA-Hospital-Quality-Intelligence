import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('home exposes only Beranda and one canonical Infografis entry', () => {
  const home = read('components/HomeLandingWorkspace.tsx')
  assert.ok(home.includes("tabButton('welcome','Beranda')"))
  assert.ok(home.includes("tabButton('infographics','Infografis')"))
  assert.ok(!home.includes("tabButton('achievements'"))
  assert.ok(!home.includes("tab==='achievements'"))
  assert.ok(!home.includes('OverviewDashboard'))
})

test('primary navigation labels follow the approved domain terminology', () => {
  const registry = read('lib/aureka/module-registry.ts')
  for (const label of ["label:'Beranda'", "label:'Pasien'", "label:'Indikator Mutu'", "label:'Peningkatan Kinerja Klinis'", "label:'Keselamatan Pasien'", "label:'Manajemen Risiko'", "label:'Program'", "label:'Sumber Daya Manusia'", "label:'Pengaturan'"]) {
    assert.ok(registry.includes(label), 'Missing registry label: ' + label)
  }
})

test('OPPE and FPPE are reachable from SDM navigation and not from quality navigation', () => {
  const app = read('components/HomeClient.tsx')
  const qualityStart = app.indexOf('quality:[')
  const qualityEnd = app.indexOf('\n   ],', qualityStart)
  const staffStart = app.indexOf('staff:[')
  const staffEnd = app.indexOf('\n   ],', staffStart)
  const qualityGroup = app.slice(qualityStart, qualityEnd)
  const staffGroup = app.slice(staffStart, staffEnd)
  assert.ok(!qualityGroup.includes('oppe-fppe'))
  assert.ok(staffGroup.includes('Daftar Tenaga Kerja'))
  assert.ok(staffGroup.includes('Tim dan Penugasan'))
  assert.ok(staffGroup.includes('oppe-fppe'))
  // Blueprint v2 §9: OPPE dan FPPE menu terpisah, satu workspace dengan layar awal berbeda
  assert.ok(app.includes("active==='analytics'&&(analyticsTab==='oppe'||analyticsTab==='fppe')?<OppeAuditWorkspace"))
  assert.ok(staffGroup.includes("{id:'fppe',label:'FPPE'}"))
  assert.ok(app.includes("'sumber-daya-manusia':'staff'"))
  assert.ok(app.includes("if(next==='staff'){setAnalyticsTab(section==='oppe-fppe'||section==='oppe'?'oppe':section==='fppe'?'fppe':'directory')"))
})

test('legacy bookmarks remain mapped while the new HR route is canonical', () => {
  const app = read('components/HomeClient.tsx')
  assert.ok(app.includes("'metadata':'analytics'"))
  assert.ok(app.includes("analytics:'#program'"))
  assert.ok(app.includes("staff:'#sumber-daya-manusia'"))
  assert.ok(app.includes("'tenaga-klinis':'staff'"))
})

test('home parent and child navigation use the approved labels and canonical route', () => {
  const app = read('components/HomeClient.tsx')
  assert.ok(app.includes('title="Beranda"'))
  assert.ok(app.includes("home:[{id:'welcome',label:'Beranda'},{id:'infographics',label:'Infografis'}]"))
  assert.ok(app.includes("active==='home'?(homeTab==='infographics'?'infografis':'beranda')"))
  // Infografis kini dashboard terpadu tersendiri; Beranda tetap HomeLandingWorkspace
  assert.ok(app.includes("homeTab==='infographics'\n     ? <InfographicsDashboard"))
  assert.ok(app.includes('initialTab="welcome" onTabChange={setHomeTab}'))
})


test('indicator and clinical audit domains have separate navigation and canonical routes', () => {
  const app = read('components/HomeClient.tsx')
  const registry = read('lib/aureka/module-registry.ts')
  assert.ok(registry.includes("id:'quality', label:'Indikator Mutu'"))
  assert.ok(registry.includes("id:'clinical', label:'Peningkatan Kinerja Klinis'"))
  assert.ok(app.includes("clinical:["))
  assert.match(app, /quality:role==='DEWAN_PENGAWAS'/)
  // Route kanonis Hasil Capaian membedakan Unit Keseluruhan dan Kategori Indikator
  assert.ok(app.includes("hash='#indikator-mutu/'+(qualityResultsView?'hasil-capaian/'+(qualityResultsGroup==='category'?'kategori-indikator':'unit-keseluruhan'):'form-logbook')"))
  assert.ok(app.includes("hash='#peningkatan-kinerja-klinis/'+audit+(qualityResultsView?'/hasil-capaian':'')"))
  assert.ok(app.includes("active==='clinical'&&clinicalPathwayOpen?<ClinicalPathwayWorkspace"))
})
