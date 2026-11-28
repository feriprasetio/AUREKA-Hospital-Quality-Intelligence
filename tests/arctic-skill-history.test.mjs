import test from 'node:test'
import assert from 'node:assert/strict'
import {CONTINUUM_SKILLS,visibleContinuumSkills} from '../lib/aureka/continuum-skill-library.ts'
import {resolveRiskStatusHistory} from '../lib/aureka/risk-status-history.ts'
test('skill catalog only includes real read-only adapters authorized by category and current route gate',()=>{
 assert.equal(CONTINUUM_SKILLS.length,5)
 assert.deepEqual(visibleContinuumSkills([],()=>true),[])
 assert.deepEqual(visibleContinuumSkills(['quality_patient_safety'],()=>false),[])
 assert.deepEqual(visibleContinuumSkills(['quality_patient_safety'],d=>d.module==='risk').map(x=>x.skill.id),['risk-register-review'])
 assert.deepEqual(visibleContinuumSkills(['director_supervisory_board'],d=>d.section==='recommendations').map(x=>x.skill.id),['governance-action-review'])
 assert.deepEqual(visibleContinuumSkills(['director_supervisory_board'],()=>false),[])
 assert.ok(CONTINUUM_SKILLS.every(skill=>skill.version===1&&skill.effect==='read-only'))
})
test('status history uses recorded events and excludes hidden or unrelated plans',()=>{
 const plans=[{id:'a',owner_room_id:1},{id:'b',owner_room_id:2},{id:'c',owner_room_id:1}].map(p=>({...p,title:p.id,plan_code:p.id}))
 const relations=[{plan_id:'a',risk_id:'r'},{plan_id:'b',risk_id:'r'},{plan_id:'c',risk_id:'other'}]
 const events=[{id:'1',plan_id:'a',created_at:'2026-01-01'},{id:'2',plan_id:'a',created_at:'2026-02-01'},{id:'3',plan_id:'b',created_at:'2026-03-01'},{id:'4',plan_id:'c',created_at:'2026-04-01'}].map(e=>({...e,from_status:'draft',to_status:'approved',action:'review'}))
 assert.deepEqual(resolveRiskStatusHistory('r',['r'],plans,relations,events,p=>p.owner_room_id===1).map(x=>x.event.id),['2','1'])
 assert.deepEqual(resolveRiskStatusHistory('r',[],plans,relations,events,()=>true),[])
})
