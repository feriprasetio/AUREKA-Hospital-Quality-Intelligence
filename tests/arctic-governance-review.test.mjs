import test from 'node:test'
import assert from 'node:assert/strict'
import {scopedGovernanceActions,governanceReview} from '../lib/aureka/governance-review.ts'
test('governance review shares the visible register scope and never infers hidden parents',()=>{
 const rows=[{recommendation_id:'a',status:'berjalan',due_date:'2026-10-01'},{recommendation_id:'b',status:'selesai',due_date:'2026-10-01'},{recommendation_id:null,status:'terbuka',due_date:null},{recommendation_id:'a',status:'terverifikasi',due_date:'2026-10-01'}].map(x=>({...x,improvement_method:'PDSA',cycle_plan:'p',cycle_do:'d',cycle_study_check:'s',cycle_act:x.status==='terbuka'?'':'a'}))
 const snapshot=JSON.stringify(rows)
 const scoped=scopedGovernanceActions(rows,['a'])
 const result=governanceReview(scoped,'2026-11-01')
 assert.equal(result.total,3);assert.equal(result.overdue,1);assert.equal(result.withoutDue,1);assert.equal(result.incompleteCycle,1);assert.equal(result.unlinked,1);assert.equal(result.status.find(x=>x.status==='selesai').count,0)
 assert.equal(JSON.stringify(rows),snapshot)
})
