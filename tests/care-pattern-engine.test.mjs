import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCarePattern, doctorsForCarePattern } from '../lib/aureka/care-pattern-engine.ts'
import { readWorkspaceHash } from '../lib/aureka/workspace-route.ts'
const scope={year:2026,room:null,ready:false}
const fixture={allowed:true,year:2026,scope_room_id:null,includes_ready:false,named_allowed:false,records:10,ready_records:0,visit_source_records:5,visit_classified:3,discharge_source_records:5,discharge_dated:4,discharge_timed:1,attributed_records:null,visit_categories:[{label:'Visite',count:3}],discharge_days:[{day:1,count:4}],discharge_hours:[{hour:10,count:1}],doctors:[]}
test('care patterns fail closed for invalid scope and missing counts',()=>{assert.equal(parseCarePattern(fixture,scope).records,10);assert.throws(()=>parseCarePattern(fixture,{...scope,year:2025}),/cakupan/);assert.throws(()=>parseCarePattern({...fixture,discharge_timed:5},scope),/konsisten/);assert.throws(()=>parseCarePattern({...fixture,ready_records:1},scope),/konsisten/)})
test('patient pattern route resolves new tabs without changing readmission',()=>{for(const tab of ['visite','pemulangan','readmisi'])assert.deepEqual(readWorkspaceHash('#pasien/register-pasien/pola-perawatan/'+tab),{module:'patients',section:tab})})

test('reject duplicate aggregate buckets and inconsistent named counts',()=>{
  assert.throws(()=>parseCarePattern({...fixture,visit_categories:[{label:'Visite',count:1},{label:'Visite',count:2}]},scope),/konsisten/)
  assert.throws(()=>parseCarePattern({...fixture,named_allowed:true,attributed_records:null},scope),/konsisten/)
  assert.throws(()=>parseCarePattern({...fixture,named_allowed:true,attributed_records:11},scope),/konsisten/)
})
test('DPJP threshold applies independently in each active analysis',()=>{
  const row={staff_id:'demo-1',name:'Demo',visite_n:null,discharge_n:5,clock_n:null,visit_regular:null,visit_late:null}
  const named={...fixture,named_allowed:true,attributed_records:5,discharge_dated:5,discharge_days:[{day:1,count:5}],doctors:[row]}
  const parsed=parseCarePattern(named,scope)
  assert.deepEqual(doctorsForCarePattern(parsed,'visite'),[])
  assert.deepEqual(doctorsForCarePattern(parsed,'pemulangan'),[row])
  assert.throws(()=>parseCarePattern({...named,doctors:[{...row,visite_n:3,visit_regular:2,visit_late:1}]},scope),/konsisten/)
  assert.throws(()=>parseCarePattern({...named,doctors:[{...row,clock_n:6}]},scope),/konsisten/)
  assert.throws(()=>parseCarePattern({...named,doctors:[row,row]},scope),/konsisten/)
})
