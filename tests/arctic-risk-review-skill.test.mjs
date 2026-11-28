import test from 'node:test'
import assert from 'node:assert/strict'
import { reviewRiskSnapshot,riskReviewCsv,RISK_REVIEW_SKILL } from '../lib/aureka/risk-review-skill.ts'
const method={score:(p,d)=>p===5&&d===5?25:1,level:s=>s===25?'Sangat Tinggi':'Sangat Rendah'}
const valid={likelihood:5,impact:5,risk_score:25,risk_level:'Sangat Tinggi',residual_likelihood:null,residual_impact:null,residual_score:null,residual_level:null,owner_name:'',due_date:null,existing_controls:'',status:'Open'}
test('risk review uses injected existing method and does not mutate or invent scores',()=>{
 const rows=Object.freeze([Object.freeze(valid),Object.freeze({...valid,risk_score:5,risk_level:'Tinggi'}),Object.freeze({...valid,status:'Controlled',residual_score:2})])
 const result=reviewRiskSnapshot(rows,method)
 assert.equal(result.total,3);assert.equal(result.baselineMismatch,1);assert.equal(result.activePriority,1)
 assert.equal(result.residualMissing,2);assert.equal(result.residualMismatch,1);assert.equal(result.missingOwner,2)
 assert.equal(result.distribution.reduce((n,x)=>n+x.total,0),3)
 assert.equal(rows[1].risk_score,5)
})
test('invalid parameter, unknown level and zero rows are distinct',()=>{
 const r=reviewRiskSnapshot([{...valid,likelihood:0,risk_level:'?',status:'?'}],method)
 assert.equal(r.baselineMismatch,1);assert.equal(r.unknownLevel,1);assert.equal(r.unknownStatus,1);assert.equal(r.activePriority,0)
 assert.equal(reviewRiskSnapshot([],method).total,0)
})
test('aggregate report is draft, source-linked and formula-safe',()=>{
 const csv=riskReviewCsv(reviewRiskSnapshot([valid],method),'=test','2026-11-28T00:00:00Z')
 assert.match(csv,/Draf review baca-saja/)
 assert.match(csv,/aureka_risk\.risk_register/)
 assert.match(csv,/'=test/)
 assert.equal(RISK_REVIEW_SKILL.effect,'read-only')
})
