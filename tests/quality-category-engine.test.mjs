import test from 'node:test'
import assert from 'node:assert/strict'
import { QUALITY_CATEGORY_CATALOG, resolveQualityCategory, buildQualityCategoryAnalytics, buildCategoryNaraBrief } from '../lib/aureka/quality-category-engine.ts'

const profile = (kind,code,title,room=1) => ({
  id: room+'-'+code, code, room_id:room, title,
  indicator_type:kind, schema_json:{indicator_direction:'positive'},
  options_json:[{label:'Sesuai',code:1},{label:'Pengecualian',code:2},{label:'Tidak sesuai',code:3},{label:'Bukan sasaran',code:null}],
  measurement_grain:'patient_episode', target_operator:'>=', target_value:80, target_text:'≥80%',
})
const result = (p,n=1,d=1,met=true) => ({
  profile:p,kind:'ratio',continuous:false,unit:'%',monthly:Array.from({length:12},(_,i)=>({
    month:i+1,numerator:i===0?n:0,denominator:i===0?d:0,rate:i===0?n/d*100:null,mean:null,targetAttainment:null,
    observations:i===0?d:0,readyRecords:0,validatedRecords:i===0?d:0,
  })),
  annualNumerator:n,annualDenominator:d,annualRate:n/d*100,annualMean:null,annualTargetAttainment:null,
  monthlyMeanRate:n/d*100,observations:d,readyRecords:0,validatedRecords:d,latestInputAt:null,targetMet:met,
})
test('2026 reference catalogue exposes exactly 19 program categories and 9 clinical audit diagnoses',()=>{
  assert.equal(QUALITY_CATEGORY_CATALOG.length,19)
  assert.equal(QUALITY_CATEGORY_CATALOG.filter(item=>item.kind==='audit').length,9)
  assert.equal(QUALITY_CATEGORY_CATALOG.filter(item=>item.program==='INM').length,1)
  assert.equal(QUALITY_CATEGORY_CATALOG.filter(item=>item.program==='IMP-RS').length,6)
})
test('classification accepts source column G labels and repository program titles',()=>{
  assert.equal(resolveQualityCategory(profile('(INM) Indikator Nasional Mutu','A','A')).id,'inm')
  assert.equal(resolveQualityCategory(profile('INM Indikator Nasional Mutu','B','B')).id,'inm')
  assert.equal(resolveQualityCategory(profile('(IMP-RS) Perbaikan Sistem','C','C')).id,'imp-rs-perbaikan-sistem')
  assert.equal(resolveQualityCategory(profile('IMP-Unit Audit Medis STEMI','D','D')).id,'audit-stemi')
  assert.equal(resolveQualityCategory(profile('(IMP-Unit) Audit Medis Stroke','E','E')).id,'audit-stroke')
  assert.equal(resolveQualityCategory(profile('IMP-Unit Audit Medis Buatan','F','F')).program,'IMP-Unit')
})
test('audit aggregation separates unique cases from criteria and correctly counts coded/excluded values',()=>{
  const one=profile('IMP-Unit Audit Medis STEMI','26.1','ECG',26)
  const two=profile('IMP-Unit Audit Medis STEMI','26.2','Killip',26)
  const records=[{id:'a',room_id:26,subject_key:'episode-1',record_date:'2026-01-01',status:'validated',
    core_data:{indicator_values:{'26.1':{answer:'Sesuai',code:1},'26.2':{answer:'Pengecualian',code:2}}}},
    {id:'b',room_id:26,subject_key:'episode-2',record_date:'2026-01-02',status:'validated',
    core_data:{indicator_values:{'26.1':{answer:'Tidak sesuai',code:3},'26.2':{answer:'Bukan sasaran',code:null}}}},
    {id:'c',room_id:26,subject_key:'episode-3',record_date:'2026-01-03',status:'ready',
    core_data:{indicator_values:{'26.1':{answer:'Sesuai',code:1}}}}]
  const out=buildQualityCategoryAnalytics([result(one,1,2,false),result(two,0,2,false)],records,2026)
  const cat=out.find(x=>x.definition.id==='audit-stemi')
  assert.ok(cat)
  assert.deepEqual(cat.codes,{code1:1,code2:1,code3:1,uncoded:1,pending:0})
  assert.equal(cat.subjects,2)
  assert.equal(cat.configured,2)
  const brief=buildCategoryNaraBrief(cat,2026,'Rawat Inap')
  assert.match(brief,/Code 2=1/)
  assert.doesNotMatch(brief,/episode-1|episode-2/)
})
test('missing or unapproved responses never inflate official code distribution',()=>{
 const p=profile('IMP-Unit Audit Medis Stroke','26.9','LOS',26)
 const rows=[{id:'1',room_id:26,record_date:'2026-02-03',status:'validated',core_data:{indicator_values:{'26.9':{answer:'Sesuai',code:1,review_status:'pending'}}}},
 {id:'2',room_id:26,record_date:'2026-02-04',status:'validated',core_data:{indicator_values:{'26.9':{answer:'Sesuai',code:1,review_status:'classified'}}}},
 {id:'3',room_id:26,record_date:'2025-02-04',status:'validated',core_data:{indicator_values:{'26.9':{answer:'Sesuai',code:1}}}},
 {id:'4',room_id:26,record_date:'2026-02-05',status:'draft',core_data:{indicator_values:{'26.9':{answer:'Sesuai',code:1}}}}]
 const out=buildQualityCategoryAnalytics([result(p)],rows,2026)[0]
 assert.equal(out.codes.code1,1)
 assert.equal(out.codes.pending,1)
})
