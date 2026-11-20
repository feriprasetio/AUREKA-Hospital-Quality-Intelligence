import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Audit Realcost is an available module under Peningkatan Kinerja Klinis', () => {
  const registry = read('lib/aureka/module-registry.ts')
  const app = read('components/HomeClient.tsx')
  const groupStart = registry.indexOf("{ id:'clinical_performance'")
  const groupEnd = registry.indexOf("{ id:'quality_patient_safety'", groupStart)
  const group = registry.slice(groupStart, groupEnd)
  assert.match(group, /id:'realcost_audit', label:'Audit Realcost', moduleId:'clinical', childId:'realcost', status:'available'/)
  assert.match(group, /requiredRoles:\['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS'\]/)
  assert.match(app, /const RealcostAuditWorkspace=dynamic\(\(\)=>import\('@\/components\/RealcostAuditWorkspace'\)/)
  assert.match(app, /realcostAuditOpen/)
  assert.ok(app.includes("audit=realcostAuditOpen?'realcost'"))
  assert.ok(app.includes("active==='clinical'&&realcostAuditOpen?<RealcostAuditWorkspace"))
})

test('Realcost import domain separates aggregate, episode detail and patient identity privileges', () => {
  const migration = read('supabase/migrations/20261121080000_realcost_audit_domain.sql')
  assert.match(migration, /realcost\.read\.aggregate/)
  assert.match(migration, /realcost\.read\.detail/)
  assert.match(migration, /realcost\.import/)
  assert.match(migration, /create table if not exists aureka_quality\.realcost_patient_identity/)
  assert.match(migration, /patient\.read\.identifiable/)
  assert.match(migration, /create or replace function public\.aureka_realcost_dashboard/)
  assert.match(migration, /create unique index if not exists realcost_imports_completed_source_hash_uidx/)
})

test('Realcost dashboard starts with one navigation action and detail workspace owns the rest', () => {
  const workspace = read('components/RealcostAuditWorkspace.tsx')
  const parser = read('lib/aureka/realcost-xlsx-import.ts')
  assert.match(workspace, /Visual Intelligence Audit Realcost/)
  assert.match(workspace, />Lihat Audit Realcost</)
  assert.match(workspace, /Diagnosis & Prosedur/)
  assert.match(parser, /NAMA_PASIEN/)
  assert.match(parser, /MRN/)
  assert.match(parser, /SEP/)
  assert.match(parser, /CODER_ID/)
  assert.match(parser, /source_payload/)
})
