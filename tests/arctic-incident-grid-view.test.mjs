import test from 'node:test'
import assert from 'node:assert/strict'
import {incidentGridColumns,sortIncidentGrid,incidentGridPage} from '../lib/aureka/incident-grid-view.ts'
const make=(i)=>({id:String(i),incident_code:'IKP-'+i,incident_date:null,unit_name:'Uji',incident_type:'Jenis',summary:'Synthetic',status:'draft'})
test('mandatory identity, unit and status never disappear, unknown columns ignored',()=>{
 assert.deepEqual(incidentGridColumns(['incident_code','unit_name','status','summary','unknown']).map(c=>c[0]),['incident_code','incident_date','unit_name','incident_type','status'])
 assert.equal(incidentGridColumns().length,6)
})
test('10,000 synthetic records: stable full-list sorting, correct pages, no mutation',()=>{
 const rows=Array.from({length:10000},(_,i)=>make(10000-i))
 const sorted=sortIncidentGrid(rows,{key:'incident_code',direction:1})
 assert.equal(rows[0].incident_code,'IKP-10000')
 assert.equal(sorted[0].incident_code,'IKP-1')
 assert.equal(sorted.at(-1).incident_code,'IKP-10000')
 assert.equal(incidentGridPage(sorted,400,25).rows.at(-1).incident_code,'IKP-10000')
 assert.equal(incidentGridPage(sorted,9999,100).current,100)
})
test('empty, malformed page and null values',()=>{
 assert.deepEqual(incidentGridPage([],99,25),{rows:[],current:1,pages:1,start:0,end:0})
 assert.equal(incidentGridPage([make(1)],NaN,0).rows.length,1)
 const rows=[{...make(1),incident_date:null},{...make(2),incident_date:'2026-11-01'}]
 assert.equal(sortIncidentGrid(rows,{key:'incident_date',direction:1})[1].id,'1')
 assert.equal(sortIncidentGrid(rows,{key:'incident_date',direction:-1})[1].id,'1')
})
