import test from 'node:test'
import assert from 'node:assert/strict'
import {aggregateReportHtml,aggregateReportCsv,reportPreflight,reportFingerprint,appendReportOperation,REPORT_DEFAULT_OPTIONS} from '../lib/aureka/aggregate-report-studio.ts'
const report={title:'Draf <script>alert(1)</script>',source:'Sumber existing',scope:'=unit',method:'Hitungan existing',limitation:'Bukan persetujuan',snapshot:'2026-11-28',metrics:[['Jumlah',2]],details:[['Rincian',1]]}
test('report preflight and HTML escape text, retain source and mandatory limitation',()=>{
 assert.equal(reportPreflight(report),true)
 const html=aggregateReportHtml(report,REPORT_DEFAULT_OPTIONS)
 assert.ok(!html.includes('<script>'));assert.ok(html.includes('&lt;script&gt;'));assert.ok(html.includes('Bukan persetujuan'));assert.ok(html.includes('DRAF, BELUM DISAHKAN'))
 const short=aggregateReportHtml(report,{details:false,notes:false})
 assert.ok(!short.includes('Rincian'));assert.ok(short.includes('Bukan persetujuan'))
 assert.ok(aggregateReportCsv(report,REPORT_DEFAULT_OPTIONS).includes("'=unit"))
 assert.throws(()=>aggregateReportHtml({...report,metrics:[['Invalid',NaN]]},REPORT_DEFAULT_OPTIONS))
 assert.equal(reportPreflight({...report,metrics:[['Negative',-1]]}),false)
})
test('review fingerprint changes with report data, options and scope',()=>{
 const a=reportFingerprint(report,REPORT_DEFAULT_OPTIONS)
 assert.notEqual(a,reportFingerprint(report,{details:false,notes:true}))
 assert.notEqual(a,reportFingerprint({...report,scope:'other'},REPORT_DEFAULT_OPTIONS))
 assert.notEqual(a,reportFingerprint({...report,metrics:[['Jumlah',3]]},REPORT_DEFAULT_OPTIONS))
})
test('local operation history bounded and monotonically numbered; requests not completion',()=>{
 let log=[]
 for(let i=0;i<30;i++)log=appendReportOperation(log,'html','requested')
 assert.equal(log.length,20);assert.equal(log.at(-1).id,30);assert.equal(log.at(-1).status,'requested')
})
