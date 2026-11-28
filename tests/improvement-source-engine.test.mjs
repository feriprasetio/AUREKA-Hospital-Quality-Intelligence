import test from 'node:test'
import assert from 'node:assert/strict'
import {IMPROVEMENT_SOURCE_TYPES,parseImprovementSources,parseImprovementLinks,parseStaffEducation} from '../lib/aureka/improvement-source-engine.ts'
import {readWorkspaceHash} from '../lib/aureka/workspace-route.ts'
const id='00000000-0000-0000-0000-000000000001'
const row={source_id:id,label:'Profil mutu',source_status:'published',room_id:14}
test('13 domains use canonical routes and unique keys',()=>{assert.equal(IMPROVEMENT_SOURCE_TYPES.length,13);assert.equal(new Set(IMPROVEMENT_SOURCE_TYPES.map(x=>x[0])).size,13);for(const [, ,route] of IMPROVEMENT_SOURCE_TYPES)assert.notEqual(readWorkspaceHash(route).module,'home')})
test('source links require valid identity and no duplicates',()=>{assert.equal(parseImprovementSources([row]).length,1);assert.throws(()=>parseImprovementSources([row,row]));assert.throws(()=>parseImprovementSources([{...row,source_id:'bad'}]));assert.equal(parseImprovementLinks([{...row,source_kind:'indicator',linked_at:'2026-11-28'}]).length,1);assert.throws(()=>parseImprovementLinks([{...row,source_kind:'bad',linked_at:'x'}]))})
test('staff education rejects identity mismatch and impossible attendance',()=>{const e={participant_id:id,event_id:id,title:'IHT',event_type:'training',start_at:null,participant_status:'active',present_sessions:1,recorded_sessions:2,valid_certificates:0};assert.equal(parseStaffEducation({staff_id:id,rows:[e]},id).length,1);assert.throws(()=>parseStaffEducation({staff_id:'bad',rows:[e]},id));assert.throws(()=>parseStaffEducation({staff_id:id,rows:[{...e,present_sessions:3}]},id))})
