import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Sekretariat is owned by PMKP, visible in the PMKP category, and discloses backend readiness', () => {
  const registry = read('lib/aureka/module-registry.ts')
  const home = read('components/HomeClient.tsx')
  assert.ok(registry.includes("id:'secretariat', label:'Sekretariat', group:'quality_patient_safety'"))
  assert.ok(registry.includes("owner:'Komite Peningkatan Mutu dan Keselamatan Pasien'"))
  assert.ok(registry.includes("routeHash:'#sekretariat'"))
  assert.ok(registry.includes('requiredRoles:GOVERNANCE_ROLES'))
  assert.ok(registry.includes("{ id:'secretariat', label:'Sekretariat', moduleId:'secretariat', childId:'register', status:'planned'"))
  assert.ok(home.includes("disabled={item.status==='planned'}"))
  assert.ok(home.includes("if(item.status==='planned')return"))
  assert.ok(home.includes("'sekretariat':'secretariat'"))
  const workspace = read('components/governance/SecretariatWorkspace.tsx')
  assert.ok(workspace.includes('Pencatatan Sekretariat belum diaktifkan'))
})

test('Sekretariat follows Administrasi Kegiatan with Register Kegiatan and Kirim Undangan subtabs', () => {
  const home = read('components/HomeClient.tsx')
  const start = home.indexOf('secretariat:[', home.indexOf('const sidebarChildGroups'))
  const end = home.indexOf('settings:[', start)
  assert.ok(start >= 0 && end > start)
  const group = home.slice(start, end)
  assert.ok(group.includes("{id:'administration',label:'Administrasi Kegiatan',children:"))
  assert.ok(group.includes("{id:'register',label:'Register Kegiatan'}"))
  assert.ok(group.includes("{id:'invitations',label:'Kirim Undangan'}"))
  assert.equal(group.split("{id:'").length - 1, 3)
})

test('Sekretariat contextual selection and deep links preserve one canonical module state', () => {
  const home = read('components/HomeClient.tsx')
  assert.ok(home.includes("if(moduleId==='secretariat')"))
  assert.ok(home.includes('setSecretariatSection(childId as SecretariatSection)'))
  assert.ok(home.includes("if(next==='secretariat')"))
  assert.ok(home.includes("setSecretariatSection(sectionMap[section||'']||'register')"))
  assert.ok(home.includes("secretariat:'#sekretariat'"))
  assert.ok(home.includes("active==='secretariat'?secretariatSection"))
  assert.ok(home.includes("active==='secretariat'?<SecretariatWorkspace section={secretariatSection}/>"))
})

test('Secretariat workspace is transparent about backend readiness and contains no synthetic records', () => {
  const workspace = read('components/governance/SecretariatWorkspace.tsx')
  for (const label of ['Register Kegiatan', 'Kirim Undangan', 'Undangan', 'Materi', 'Absensi Digital', 'Notulensi', 'Gambar']) assert.ok(workspace.includes(label), label)
  assert.ok(workspace.includes('Meeting ID'))
  assert.ok(workspace.includes('Pencatatan Sekretariat belum diaktifkan'))
  assert.ok(workspace.includes('Tidak ada data contoh atau catatan rapat fiktif'))
  assert.ok(workspace.includes('Dokumen Terkendali'))
  assert.ok(!workspace.includes('aurekaSupabase'))
  assert.ok(!workspace.includes('.from('))
  assert.ok(!workspace.includes('.rpc('))
  assert.ok(!workspace.includes('upsert('))
})
