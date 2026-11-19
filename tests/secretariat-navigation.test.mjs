import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Sekretariat is registered inside Governance & Organization with a canonical route', () => {
  const registry = read('lib/aureka/module-registry.ts')
  const home = read('components/HomeClient.tsx')

  assert.match(registry, /export type SecretariatSection = 'invitations' \| 'materials' \| 'attendance' \| 'minutes' \| 'documentation'/)
  assert.match(registry, /id:'secretariat', label:'Sekretariat', group:'governance'/)
  assert.match(registry, /routeHash:'#sekretariat'/)
  assert.match(registry, /requiredRoles:GOVERNANCE_ROLES/)
  assert.match(home, /id:'governance_organization',label:'Governance & Organization'[\s\S]*?id:'secretariat',label:'Sekretariat',moduleId:'secretariat'/)
  assert.match(home, /'sekretariat':'secretariat'/)
})

test('Sekretariat exposes exactly the five V3 contextual work areas', () => {
  const home = read('components/HomeClient.tsx')
  const groups = home.slice(home.indexOf('secretariat:['), home.indexOf('],', home.indexOf('secretariat:[')) + 2)

  for (const item of [
    "{id:'invitations',label:'Undangan'}",
    "{id:'materials',label:'Materi'}",
    "{id:'attendance',label:'Absensi'}",
    "{id:'minutes',label:'Notulensi'}",
    "{id:'documentation',label:'Dokumentasi Foto'}",
  ]) assert.ok(groups.includes(item), item)
  assert.equal((groups.match(/\{id:'/g) || []).length, 5)
})

test('Sekretariat contextual selection and deep links preserve one canonical module state', () => {
  const home = read('components/HomeClient.tsx')
  assert.match(home, /moduleId==='secretariat'[\s\S]*setSecretariatSection/)
  assert.match(home, /if\(next==='secretariat'\)[\s\S]*setSecretariatSection\(sectionMap\[section\|\|''\]||'invitations'\)/)
  assert.match(home, /secretariat:'#sekretariat'/)
  assert.match(home, /active==='secretariat'\?secretariatSection/)
  assert.match(home, /active==='secretariat'\?<SecretariatWorkspace section=\{secretariatSection\}\/>/)
})

test('Secretariat workspace is honest about backend readiness and contains no synthetic meeting records', () => {
  const workspace = read('components/governance/SecretariatWorkspace.tsx')
  for (const label of ['Undangan', 'Materi', 'Absensi', 'Notulensi', 'Dokumentasi Foto']) assert.ok(workspace.includes(label), label)
  assert.match(workspace, /Meeting ID/)
  assert.match(workspace, /Pencatatan Sekretariat belum diaktifkan/)
  assert.match(workspace, /Tidak ada data contoh atau catatan rapat fiktif/)
  assert.match(workspace, /Dokumen Terkendali/)
  assert.doesNotMatch(workspace, /aurekaSupabase|\.from\(|\.rpc\(|insert\(|upsert\(/)
})
