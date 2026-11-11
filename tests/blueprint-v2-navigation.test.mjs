import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('home exposes only Beranda and one canonical read-only Infografis entry', () => {
  const home = read('components/HomeLandingWorkspace.tsx')
  assert.match(home, /tabButton\('welcome','Beranda'\)/)
  assert.match(home, /tabButton\('infographics','Infografis'\)/)
  assert.doesNotMatch(home, /tabButton\('achievements'/)
  assert.doesNotMatch(home, /tab==='achievements'/)
  assert.doesNotMatch(home, /OverviewDashboard|QualityResultsWorkspace|PatientSafetyWorkspace|RiskManagementWorkspace/)
})

test('primary navigation labels follow the approved domain terminology', () => {
  const registry = read('lib/aureka/module-registry.ts')
  assert.match(registry, /label: 'Beranda'/)
  assert.match(registry, /label: 'Pasien'/)
  assert.match(registry, /label: 'Indikator Mutu'/)
  assert.match(registry, /label: 'Sumber Daya Manusia'/)
  assert.match(registry, /label: 'Pengaturan'/)
})

test('OPPE and FPPE are reachable from the SDM navigation and not from the quality menu', () => {
  const app = read('components/HomeClient.tsx')
  const qualityGroup = app.match(/quality:\[([\s\S]*?)\n   \],/)?.[1] || ''
  const staffGroup = app.match(/staff:\[([\s\S]*?)\n   \],/)?.[1] || ''
  assert.doesNotMatch(qualityGroup, /oppe-fppe/)
  assert.match(staffGroup, /Daftar Tenaga Kerja/)
  assert.match(staffGroup, /Tim dan Penugasan/)
  assert.match(staffGroup, /oppe-fppe/)
  assert.match(app, /active==='analytics'&&analyticsTab==='oppe'\?<OppeAuditWorkspace/)
  assert.match(app, /'tenaga-klinis':'staff'/)
  assert.match(app, /if\(next==='staff'\)next='analytics'/)
})

test('legacy bookmarks remain mapped while the new HR route is canonical', () => {
  const app = read('components/HomeClient.tsx')
  assert.match(app, /'metadata':'analytics'/)
  assert.match(app, /analytics:'#tenaga-klinis'/)
  assert.match(app, /'tenaga-klinis':'staff'/)
})

test('sidebar home label and breadcrumb use Beranda terminology', () => {
  const app = read('components/HomeClient.tsx')
  assert.match(app, //title="Halaman Utama"//)
  assert.match(app, /<NavIcon id="home"\/><span>Beranda<\/span>/)
  assert.match(app, /<b>Beranda<\/b>/)
})
