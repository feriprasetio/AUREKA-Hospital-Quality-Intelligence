import { readWorkspaceHash } from '../lib/aureka/workspace-route.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Sekretariat is owned by PMKP, visible in the PMKP category, and active', () => {
  const registry = read('lib/aureka/module-registry.ts')
  const home = read('components/HomeClient.tsx')
  assert.ok(registry.includes("id:'secretariat', label:'Sekretariat', group:'quality_patient_safety'"))
  assert.ok(registry.includes("owner:'Komite Peningkatan Mutu dan Keselamatan Pasien'"))
  assert.ok(registry.includes("routeHash:'#sekretariat'"))
  assert.ok(registry.includes('requiredRoles:GOVERNANCE_ROLES'))
  assert.ok(registry.includes("{ id:'secretariat', label:'Sekretariat', moduleId:'secretariat', childId:'register', status:'available'"))
  assert.ok(home.includes("disabled={item.status==='planned'}"))
  assert.ok(home.includes("if(item.status==='planned')return"))
  assert.deepEqual(readWorkspaceHash("#sekretariat"), { module:"secretariat", section:"register" })
  const workspace = read('components/governance/SecretariatWorkspace.tsx')
  assert.ok(workspace.includes('Register Dokumen'))
  assert.ok(workspace.includes('Kode rapat'))
})

test('Sekretariat follows Administrasi Kegiatan with Register Kegiatan and Kirim Undangan subtabs', () => {
  const home = read('components/HomeClient.tsx')
  const start = home.indexOf('secretariat:[', home.indexOf('const sidebarChildGroups'))
  const end = home.indexOf('account:[', start)
  assert.ok(start >= 0 && end > start)
  const group = home.slice(start, end)
  assert.ok(group.includes("{id:'administration',label:'Administrasi Kegiatan',children:"))
  assert.ok(group.includes("{id:'register',label:'Register Kegiatan'}"))
  assert.ok(group.includes("{id:'invitations',label:'Kirim Undangan'}"))
  assert.match(group, /id:'programs',label:'Program Kerja Tahunan',children:/)
  assert.match(group, /Rencana Kegiatan dan Timeline/)
  assert.match(group, /Area Prioritas/)
  assert.match(group, /Usulan Indikator Baru/)
})

test('Sekretariat contextual selection and deep links preserve one canonical module state', () => {
  const home = read('components/HomeClient.tsx')
  for (const alias of ['undangan', 'invitations', 'kirim-undangan']) {
    assert.deepEqual(readWorkspaceHash('#sekretariat/' + alias), { module: 'secretariat', section: 'invitations' })
  }
  assert.deepEqual(readWorkspaceHash('#sekretariat/program-kerja/area-prioritas'), { module: 'analytics', section: 'priorities' })
  assert.match(home, /setSecretariatSection\(section==='invitations'\?'invitations':'register'\)/)
  assert.match(home, /active==='secretariat'\?<SecretariatWorkspace section=\{secretariatSection\}/)
})

test('Secretariat workspace uses the existing backend register and contains no synthetic records', () => {
  const workspace = read('components/governance/SecretariatWorkspace.tsx')
  for (const label of ['Register Sekretariat', 'Undangan', 'Materi', 'Absensi Digital', 'Notulensi', 'Gambar']) assert.ok(workspace.includes(label), label)
  assert.ok(workspace.includes("from('pmkp_meetings')"))
  assert.ok(workspace.includes("from('pmkp_meeting_documents')"))
  assert.ok(workspace.includes('readLocalDocument(item.file)'))
  assert.ok(workspace.includes("source_mode:'data_only'"))
  assert.doesNotMatch(workspace, /\.storage\.from\(/)
  assert.ok(workspace.includes('Kode rapat'))
  assert.doesNotMatch(workspace, /className="secPrivacyNote"|fetch\(.*https?:/)
  assert.ok(!workspace.includes('Pencatatan Sekretariat belum diaktifkan'))
  assert.ok(!workspace.includes('Tidak ada data contoh atau catatan rapat fiktif'))
  assert.ok(!workspace.includes('upsert('))
})
