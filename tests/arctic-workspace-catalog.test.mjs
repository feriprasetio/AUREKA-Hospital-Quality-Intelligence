import test from 'node:test'
import assert from 'node:assert/strict'
import { CONTINUUM_ARCHETYPES, resolveContinuumWorkspace, resolveContinuumPin, pinContinuumWorkspace, WORKSPACE_PIN_LIMIT } from '../lib/aureka/continuum-workspace.ts'
import { readWorkspaceHash } from '../lib/aureka/workspace-route.ts'

test('Continuum taxonomy has 16 unique archetypes without changing legacy layout ids',()=>{
  assert.equal(CONTINUUM_ARCHETYPES.length,16)
  assert.equal(new Set(CONTINUUM_ARCHETYPES).size,16)
})
test('canonical sections select their own workspace type, not label heuristics',()=>{
  for(const [hash,expected] of [
    ['#beranda','executive'],['#pasien/direktori-pasien','data-grid'],
    ['#pasien/pola-perawatan/los','analytics'],['#peningkatan-kinerja-klinis/realcost','audit-evaluation'],
    ['#indikator-mutu/form-logbook','data-grid'],['#indikator-mutu/rekonsiliasi','reconciliation'],
    ['#keselamatan-pasien/investigation','workflow'],['#keselamatan-pasien/survey','form'],
    ['#manajemen-risiko/connections','object-explorer'],['#manajemen-risiko/profile','matrix'],
    ['#sekretariat/register','event'],['#sekretariat/undangan','action-inbox'],
    ['#nara-ai','intelligence'],['#pengaturan/appearance','configuration'],
    ['#peningkatan-kinerja-klinis/clinical-pathway/manual','document'],
    ['#sumber-daya-manusia/fppe','audit-evaluation']
  ]){
    const {module,section}=readWorkspaceHash(hash)
    assert.equal(resolveContinuumWorkspace(module,section)?.archetype,expected,hash)
  }
  assert.equal(resolveContinuumWorkspace('risk','patient-record-id'),null)
  assert.equal(resolveContinuumWorkspace('constructor','prototype'),null)
})
test('pins are allowlisted, unique and bounded; raw ids are dropped',()=>{
  let pins=['private-record','home:','home:']
  pins=pinContinuumWorkspace(pins,'safety:incidents')
  assert.deepEqual(pins,['home:','safety:incidents'])
  for(const id of ['risk:register','patients:directory','staff:directory','quality:audit-indicators','nara:'])pins=pinContinuumWorkspace(pins,id)
  assert.equal(pins.length,WORKSPACE_PIN_LIMIT)
  assert.equal(resolveContinuumPin('private-record'),null)
  assert.equal(resolveContinuumPin('safety:incidents')?.section,'incidents')
  assert.deepEqual(pinContinuumWorkspace(pins,'not-a-destination'),pins)
})
