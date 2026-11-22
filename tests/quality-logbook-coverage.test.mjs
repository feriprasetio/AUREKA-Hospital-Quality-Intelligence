import test from 'node:test'
import assert from 'node:assert/strict'
import { isCategoricalResponseRecorded, isIndicatorApplicableToDiagnosis } from '../lib/aureka/quality-logbook-coverage.ts'

test('no-code options are answered but remain unclassified for N/D',()=>{
  const opts=[{label:'Patuh',code:1},{label:'Pengecualian',code:2},{label:'Tidak patuh',code:3},{label:'Bukan pasien SC emergency',code:null}]
  assert.equal(isCategoricalResponseRecorded(opts,{answer:'Bukan pasien SC emergency',code:null}),true)
  assert.equal(isCategoricalResponseRecorded(opts,{answer:'Patuh',code:1}),true)
  assert.equal(isCategoricalResponseRecorded(opts,{answer:'Patuh',code:3}),false)
  assert.equal(isCategoricalResponseRecorded(opts,{answer:'',code:null}),false)
  assert.equal(isCategoricalResponseRecorded(opts,{answer:'Lainnya',code:null,source_option:true}),true)
})

test('clinical audit only applies to the matching diagnosis bundle',()=>{
  assert.equal(isIndicatorApplicableToDiagnosis('IMP-Unit Audit Medis STEMI','STEMI akut'),true)
  assert.equal(isIndicatorApplicableToDiagnosis('IMP-Unit Audit Medis Stroke','STEMI akut'),false)
  assert.equal(isIndicatorApplicableToDiagnosis('IMP-Unit Audit Medis Sirosis','Sirosis Hepatis'),true)
  assert.equal(isIndicatorApplicableToDiagnosis('IMP-Unit Audit Medis Stroke',''),false)
  assert.equal(isIndicatorApplicableToDiagnosis('INM Indikator Nasional Mutu',''),true)
})
