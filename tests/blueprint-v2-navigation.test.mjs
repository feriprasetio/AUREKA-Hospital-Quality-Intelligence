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
  for (const label of ["label: 'Beranda'", "label: 'Pasien'", "label: 'Indikator Mutu'", "label: 'Sumber Daya Manusia'", "label: 'Pengaturan'"]) {
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
  assert.ok(app.includes("active==='analytics'&&analyticsTab==='oppe'?<OppeAuditWorkspace"))
  assert.ok(app.includes("'tenaga-klinis':'staff'"))
  assert.ok(app.includes("if(next==='staff')next='analytics'"))
})

test('legacy bookmarks remain mapped while the new HR route is canonical', () => {
  const app = read('components/HomeClient.tsx')
  assert.ok(app.includes("'metadata':'analytics'"))
  assert.ok(app.includes("analytics:'#tenaga-klinis'"))
  assert.ok(app.includes("'tenaga-klinis':'staff'"))
})

test('home parent and child navigation use the approved labels and canonical route', () => {
  const app = read('components/HomeClient.tsx')
  assert.ok(app.includes('title="Halaman Utama"'))
  assert.ok(app.includes('<span>Beranda</span>'))
  assert.ok(app.includes("home:[{id:'welcome',label:'Beranda'},{id:'infographics',label:'Infografis'}]"))
  assert.ok(app.includes("active==='home'?(homeTab==='infographics'?'infografis':'beranda')"))
  assert.ok(app.includes("initialTab={homeTab} onTabChange={setHomeTab}"))
})
