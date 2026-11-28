import { buildCsvTable } from './csv-export.ts'
export type ReportMetric=readonly [string,number]
export type AggregateReport={title:string;source:string;scope:string;method:string;limitation:string;metrics:readonly ReportMetric[];details?:readonly ReportMetric[];snapshot:string}
export type ReportOptions={details:boolean;notes:boolean}
export const REPORT_DEFAULT_OPTIONS:ReportOptions={details:true,notes:true}
export function normalizeReportOptions(input:Partial<ReportOptions>):ReportOptions{
 return {details:input.details===true,notes:input.notes===true}
}
export function reportFingerprint(report:AggregateReport,options:ReportOptions):string{
 return JSON.stringify([report.title,report.source,report.scope,report.method,report.limitation,report.snapshot,report.metrics,report.details??[],normalizeReportOptions(options)])
}
export function reportPreflight(report:AggregateReport):boolean{
 return Boolean(report.title.trim()&&report.source.trim()&&report.scope.trim()&&report.method.trim()&&report.limitation.trim()&&report.snapshot.trim()&&report.metrics.length&&[...report.metrics,...(report.details??[])].every(([label,value])=>label.trim()&&Number.isSafeInteger(value)&&value>=0))
}
export function reportRows(report:AggregateReport,options:ReportOptions):ReportMetric[]{
 return [...report.metrics,...(options.details?report.details??[]:[])]
}
const escape=(value:string)=>value.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]??c))
export function aggregateReportHtml(report:AggregateReport,options:ReportOptions):string{
 if(!reportPreflight(report))throw new Error('Data laporan belum valid.')
 const rows=reportRows(report,options).map(([label,value])=>'<tr><th scope="row">'+escape(label)+'</th><td>'+value.toLocaleString('id-ID')+'</td></tr>').join('')
 return '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src \'none\'; style-src \'unsafe-inline\'; base-uri \'none\'; form-action \'none\'"><title>'+escape(report.title)+'</title><style>body{font:15px/1.55 system-ui,sans-serif;color:#0b1f33;max-width:850px;margin:48px auto;padding:0 24px}h1{font-size:26px}small{color:#53697b}table{width:100%;border-collapse:collapse;margin:24px 0}th,td{border-bottom:1px solid #d4dee6;padding:9px;text-align:left}td{text-align:right;font-variant-numeric:tabular-nums}dl{display:grid;grid-template-columns:120px 1fr;gap:6px}dd{margin:0;overflow-wrap:anywhere}@media print{body{margin:0;padding:0}tr{break-inside:avoid}thead{display:table-header-group}}</style></head><body><small>AUREKA / ARCTIC CONTINUUM · DRAF, BELUM DISAHKAN</small><h1>'+escape(report.title)+'</h1><dl><dt>Sumber</dt><dd>'+escape(report.source)+'</dd><dt>Cakupan</dt><dd>'+escape(report.scope)+'</dd><dt>Snapshot</dt><dd>'+escape(report.snapshot)+'</dd><dt>Metode</dt><dd>'+escape(report.method)+'</dd></dl><table><thead><tr><th>Indikator tinjauan</th><th>Jumlah</th></tr></thead><tbody>'+rows+'</tbody></table><p><strong>Batasan wajib:</strong> '+escape(report.limitation)+'</p>'+(options.notes?'<p>Tindak lanjut: periksa data sumber dan tinjau temuan bersama pemilik proses. Draf ini bukan pengesahan atau keputusan klinis.</p>':'')+'</body></html>'
}
export function aggregateReportCsv(report:AggregateReport,options:ReportOptions):string{
 if(!reportPreflight(report))throw new Error('Data laporan belum valid.')
 return buildCsvTable(['Jenis','Keterangan','Nilai'],[['Metadata','Status','Draf belum disahkan'],['Metadata','Sumber',report.source],['Metadata','Cakupan',report.scope],['Metadata','Snapshot',report.snapshot],['Metadata','Metode',report.method],['Metadata','Batasan',report.limitation],...reportRows(report,options).map(([label,value])=>['Tinjauan',label,value])])
}
export type ReportOperation={id:number;action:'review'|'html'|'csv';status:'reviewed'|'requested'|'failed'}
export function appendReportOperation(log:readonly ReportOperation[],action:ReportOperation['action'],status:ReportOperation['status']):ReportOperation[]{
 return [...log,{id:(log.at(-1)?.id??0)+1,action,status}].slice(-20)
}

// The workflow is intentionally a versioned, read-only template, not arbitrary code or a mutation engine.
export const REPORT_WORKFLOW_TEMPLATE=Object.freeze({id:'aggregate-report-review',version:1,effect:'read-only',nodes:['preflight','preview','review','export-request'] as const})
export function reportWorkflowState(report:AggregateReport,options:ReportOptions,reviewed:string|null){
 const valid=reportPreflight(report),accepted=valid&&reviewed===reportFingerprint(report,options)
 return {valid,accepted,steps:REPORT_WORKFLOW_TEMPLATE.nodes.map(id=>({id,status:id==='preflight'?(valid?'passed':'blocked'):id==='preview'?(valid?'ready':'blocked'):id==='review'?(accepted?'passed':valid?'required':'blocked'):(accepted?'ready':'blocked')}))}
}
export function reportPresentationPages(report:AggregateReport,options:ReportOptions){
 if(!reportPreflight(report))return []
 const rows=reportRows(report,options)
 const pages:Array<{title:string;rows:ReportMetric[]}>=[]
 for(let start=0;start<rows.length;start+=4)pages.push({title:report.title,rows:rows.slice(start,start+4)})
 return pages
}
