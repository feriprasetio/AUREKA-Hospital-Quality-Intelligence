import test from 'node:test'
import assert from 'node:assert/strict'
import {resolveProfileVersions,compareProfileVersions} from '../lib/aureka/profile-version-compare.ts'
import {summarizeReconciliationPreview} from '../lib/aureka/reconciliation-preview.ts'
import {stepReadGridHistory,normalizeReadGridView} from '../lib/aureka/read-grid.ts'
const anchor={id:'v2',code:'1.1',room_id:1,profile_year:2026,version:2,target_text:'80%',schema_json:{a:1,b:2}}
const older={...anchor,id:'v1',version:1,target_text:'75%',schema_json:{b:2,a:1}}
test('version comparison is exact-scope, refuses ambiguity and does not fabricate historical rows',()=>{
 const rows=[anchor,older,{...older,id:'other',room_id:2},{...older,id:'last-year',profile_year:2025}]
 assert.deepEqual(resolveProfileVersions(rows,anchor).rows.map(r=>r.id),['v2','v1'])
 assert.equal(resolveProfileVersions([...rows,{...older,id:'duplicate'}],anchor).ambiguous,true)
 assert.equal(resolveProfileVersions([older],anchor).rows.length,0)
 assert.equal(compareProfileVersions(older,anchor).find(r=>r.label==='Target').changed,true)
 assert.equal(compareProfileVersions(older,anchor).find(r=>r.label==='Konfigurasi pengukuran (JSON)').changed,false)
 assert.equal(compareProfileVersions(rows[2],anchor),null)
})
test('reconciliation dry run uses group counts without mutations or inventing missing counts',()=>{
 const input=Object.freeze([{affected_count:3,auto_fixable:true},{affected_count:2,auto_fixable:false}])
 assert.deepEqual(summarizeReconciliationPreview(input,[{affected_count:4,pending_count:2,needs_source_correction_count:1}]),{responseGroups:2,responseEntries:5,autoGroups:1,autoEntries:3,manualGroups:1,warningGroups:1,warningEntries:4,pendingWarnings:2,sourceCorrectionWarnings:1})
 assert.equal(summarizeReconciliationPreview([{affected_count:-1,auto_fixable:true}],[]),null)
 assert.equal(summarizeReconciliationPreview([],[{affected_count:1,pending_count:undefined,needs_source_correction_count:0}]),null)
})
test('undo redo tracks only normalized presentation configuration and bounds history',()=>{
 const display=[{id:'id',label:'ID'},{id:'detail',label:'Detail'}]
 const a=normalizeReadGridView({},display,[]),b=normalizeReadGridView({hidden:['detail'],size:50},display,[])
 let state=stepReadGridHistory({past:[],future:[]},a,'change',b)
 assert.deepEqual(state.view,b)
 state=stepReadGridHistory(state.history,state.view,'undo');assert.deepEqual(state.view,a)
 state=stepReadGridHistory(state.history,state.view,'redo');assert.deepEqual(state.view,b)
 state=stepReadGridHistory(state.history,state.view,'undo')
 state=stepReadGridHistory(state.history,state.view,'change',{...a,size:100});assert.deepEqual(state.history.future,[])
 for(let i=0;i<40;i++)state=stepReadGridHistory(state.history,state.view,'change',{...a,size:i%2?25:50})
 assert.equal(state.history.past.length,20)
})
