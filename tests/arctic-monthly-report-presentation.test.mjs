import test from 'node:test'
import assert from 'node:assert/strict'
import {monthlyQualityCoverage} from '../lib/aureka/monthly-quality-coverage.ts'
import {reportWorkflowState,reportFingerprint,reportPresentationPages,REPORT_DEFAULT_OPTIONS} from '../lib/aureka/aggregate-report-studio.ts'
test('monthly coverage preserves missing data and does not count profile records as unique people',()=>{
 const rows=[{continuous:false,monthly:[{month:2,observations:1,rate:0,validatedRecords:2}]},{continuous:true,monthly:[{month:2,observations:1,mean:0,validatedRecords:2}]},{continuous:false,monthly:[{month:2,observations:1,rate:null,validatedRecords:1}]},{continuous:false,monthly:[]}]
 assert.deepEqual(monthlyQualityCoverage(rows,2),{active:4,observed:3,measurable:2,withoutObservation:1,withoutMeasure:1,validatedProfileRecords:5})
 assert.equal(monthlyQualityCoverage(rows,13),null)
 assert.equal(monthlyQualityCoverage(rows,1).withoutObservation,4)
})
const report={title:'Draf',source:'Sumber',scope:'Unit',snapshot:'Periode',method:'Existing',limitation:'Draf',metrics:Array.from({length:9},(_,i)=>['M'+i,i])}
test('report workflow requires exact reviewed fingerprint, and presentation covers every metric once',()=>{
 const options=REPORT_DEFAULT_OPTIONS
 assert.equal(reportWorkflowState(report,options,null).steps.at(-1).status,'blocked')
 const reviewed=reportFingerprint(report,options)
 assert.equal(reportWorkflowState(report,options,reviewed).steps.at(-1).status,'ready')
 assert.equal(reportWorkflowState(report,{...options,notes:false},reviewed).accepted,false)
 const pages=reportPresentationPages(report,options)
 assert.deepEqual(pages.map(p=>p.rows.length),[4,4,1])
 assert.deepEqual(pages.flatMap(p=>p.rows),report.metrics)
 assert.deepEqual(reportPresentationPages({...report,scope:''},options),[])
})
