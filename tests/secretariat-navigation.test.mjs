import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Sekretariat is registered inside Governance & Organization with a canonical route', () => {
  const registry = read('lib/aureka/module-registry.ts')
  const home = read('components/HomeClient.tsx')
  assert.ok(registry.includes("id:'secretariat', label:'Sekretariat', group:'governance'"))
  assert.ok(registry.includes("owner:'Komite Peningkatan Mutu dan Keselamatan Pasien'"))
  assert.ok(registry.includes("routeHash:'#sekretariat'"))
  assert.ok(registry.includes('requiredRoles:GOVERNANCE_ROLES'))
  const qualityDomain = home.slice(home.indexOf("{id:'quality_risk'"), home.indexOf("{id:'performance_management'"))
  assert.ok(qualityDomain.includes("id:'secretariat',label:'Sekretariat',moduleId:'secretariat'"))
  assert.ok(home.includes("'sekretariat':'secretariat'"))
})

test('Sekretariat exposes exactly the five V3 contextual work areas', () => {
  const home = read('components/HomeClient.tsx')
  const start = home.indexOf('secretariat:[')
  const end = home.indexOf('],', start)
  assert.ok(start >= 0 && end > start)
  const groups = home.slice(start, end)
  for (const item of [
    "{id:'invitations',label:'Undangan'}",
    "{id:'materials',label:'Materi'}",
    "{id:'attendance',label:'Absensi'}",
    "{id:'minutes',label:'Notulensi'}",
    "{id:'documentation',label:'Dokumentasi Foto'}",
  ]) assert.ok(groups.includes(item), item)
  assert.equal(groups.split("{id:'").length - 1, 5)
})

test('Sekretariat contextual selection and deep links preserve one canonical module state', () => {
  const home = read('components/HomeClient.tsx')
  assert.ok(home.includes("if(moduleId==='secretariat')"))
  assert.ok(home.includes('setSecretariatSection(childId as SecretariatSection)'))
  assert.ok(home.includes("if(next==='secretariat')"))
  assert.ok(home.includes("setSecretariatSection(sectionMap[section||'']||'invitations')"))
  assert.ok(home.includes("secretariat:'#sekretariat'"))
  assert.ok(home.includes("active==='secretariat'?secretariatSection"))
  assert.ok(home.includes("active==='secretariat'?<SecretariatWorkspace section={secretariatSection}/>"))
})

test('Secretariat workspace is transparent about backend readiness and contains no synthetic records', () => {
  const workspace = read('components/governance/SecretariatWorkspace.tsx')
  for (const label of ['Undangan', 'Materi', 'Absensi', 'Notulensi', 'Dokumentasi Foto']) assert.ok(workspace.includes(label), label)
  assert.ok(workspace.includes('Meeting ID'))
  assert.ok(workspace.includes('Pencatatan Sekretariat belum diaktifkan'))
  assert.ok(workspace.includes('Tidak ada data contoh atau catatan rapat fiktif'))
  assert.ok(workspace.includes('Dokumen Terkendali'))
  assert.ok(!workspace.includes('aurekaSupabase'))
  assert.ok(!workspace.includes('.from('))
  assert.ok(!workspace.includes('.rpc('))
  assert.ok(!workspace.includes('upsert('))
})
