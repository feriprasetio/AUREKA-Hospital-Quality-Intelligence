'use client'
import {useState} from 'react'
import {aggregateReportCsv,aggregateReportHtml,reportFingerprint,reportPreflight,reportRows,appendReportOperation,reportWorkflowState,reportPresentationPages,REPORT_WORKFLOW_TEMPLATE,REPORT_DEFAULT_OPTIONS,type AggregateReport,type ReportOptions,type ReportOperation} from '@/lib/aureka/aggregate-report-studio'
import {downloadCsv} from '@/lib/aureka/csv-export'
function downloadHtml(html:string){
 const url=URL.createObjectURL(new Blob([html],{type:'text/html;charset=utf-8'}))
 const anchor=document.createElement('a')
 try{anchor.href=url;anchor.download='aureka-draf-laporan.html';document.body.appendChild(anchor);anchor.click()}
 finally{anchor.remove();window.setTimeout(()=>URL.revokeObjectURL(url),1500)}
}
export default function AggregateReportStudio({report}:{report:AggregateReport}){
 const [options,setOptions]=useState<ReportOptions>(REPORT_DEFAULT_OPTIONS)
 const [reviewed,setReviewed]=useState<string|null>(null)
 const [log,setLog]=useState<ReportOperation[]>([])
 const [message,setMessage]=useState('')
 const [presenting,setPresenting]=useState(false)
 const [slide,setSlide]=useState(0)
 const ready=reportPreflight(report)
 const fingerprint=reportFingerprint(report,options)
 const workflow=reportWorkflowState(report,options,reviewed)
 const accepted=workflow.accepted
 const pages=reportPresentationPages(report,options)
 const currentSlide=Math.min(slide,Math.max(0,pages.length-1))
 const change=(patch:Partial<ReportOptions>)=>{setOptions(previous=>({...previous,...patch}));setReviewed(null);setMessage('');setSlide(0)}
 const exportReport=(format:'html'|'csv')=>{
  if(!accepted||!reportPreflight(report))return
  try{
   if(format==='html')downloadHtml(aggregateReportHtml(report,options))
   else downloadCsv('aureka-draf-laporan.csv',aggregateReportCsv(report,options))
   setLog(previous=>appendReportOperation(previous,format,'requested'))
   setMessage('Permintaan unduhan dikirim ke browser. Periksa hasil pada daftar unduhan.')
  }catch{
   setLog(previous=>appendReportOperation(previous,format,'failed'))
   setMessage('Pembuatan atau permintaan unduhan gagal. Coba kembali setelah memeriksa perangkat.')
  }
 }
 return <details className="arcticReportStudio" data-arctic-report-studio>
  <summary>Document Studio · Susun laporan draf</summary>
  <section aria-label="Konfigurasi laporan">
   <p>Dokumen agregat baca-saja. Tidak menerbitkan laporan resmi, mengubah data, atau menyimpan dokumen pada server.</p>
   <fieldset><legend>Bagian laporan</legend>{Boolean(report.details?.length)&&<label><input type="checkbox" checked={options.details} onChange={e=>change({details:e.target.checked})}/> Sertakan rincian agregat</label>}<label><input type="checkbox" checked={options.notes} onChange={e=>change({notes:e.target.checked})}/> Sertakan panduan tindak lanjut</label></fieldset>
   <details className="arcticReportWorkflow" data-report-workflow><summary>Alur review laporan · template v{REPORT_WORKFLOW_TEMPLATE.version}</summary><p>Pratinjau alur baca-saja. Tidak membuat persetujuan resmi, perubahan database, atau pekerjaan background.</p><ol>{workflow.steps.map(step=><li key={step.id}><strong>{{preflight:'Validasi sumber dan angka',preview:'Pratinjau draf',review:'Review pengguna','export-request':'Permintaan ekspor'}[step.id]}</strong> · {{passed:'Lulus',blocked:'Tertahan',ready:'Siap',required:'Perlu review'}[step.status]}</li>)}</ol></details>
   <button type="button" className="akBtn akBtnGhost" data-report-present aria-pressed={presenting} disabled={!ready} onClick={()=>{setPresenting(v=>!v);setSlide(0)}}>{presenting?'Kembali ke dokumen':'Mode presentasi'}</button>
   {presenting&&ready&&pages[currentSlide]?<section className="arcticReportPresentation" aria-label="Presentasi laporan" data-report-presentation><small>DRAF · {report.scope}</small><h3>{pages[currentSlide].title}</h3><dl>{pages[currentSlide].rows.map(([label,value],i)=><div key={i}><dt>{label}</dt><dd>{value.toLocaleString('id-ID')}</dd></div>)}</dl><p>Sumber: {report.source} · {report.snapshot}</p><p>{report.limitation}</p><div className="arcticReportActions"><button type="button" className="akBtn akBtnGhost" data-report-prev disabled={currentSlide===0} onClick={()=>setSlide(currentSlide-1)}>Sebelumnya</button><span role="status">{currentSlide+1} / {pages.length}</span><button type="button" className="akBtn akBtnGhost" data-report-next disabled={currentSlide>=pages.length-1} onClick={()=>setSlide(currentSlide+1)}>Berikutnya</button></div></section>:<article className="arcticReportPreview" data-report-preview>
    <small>AUREKA · DRAF BELUM DISAHKAN</small><h3>{report.title}</h3>
    <dl><dt>Sumber</dt><dd>{report.source}</dd><dt>Cakupan</dt><dd>{report.scope}</dd><dt>Snapshot</dt><dd>{report.snapshot}</dd><dt>Metode</dt><dd>{report.method}</dd></dl>
    <table><thead><tr><th>Indikator tinjauan</th><th>Jumlah</th></tr></thead><tbody>{reportRows(report,options).map(([label,value],i)=><tr key={i}><th scope="row">{label}</th><td>{value.toLocaleString('id-ID')}</td></tr>)}</tbody></table>
    <p><strong>Batasan wajib:</strong> {report.limitation}</p>{options.notes&&<p>Tindak lanjut: periksa data sumber dan tinjau temuan bersama pemilik proses. Draf ini bukan pengesahan atau keputusan klinis.</p>}
   </article>}
   {!ready&&<p role="alert">Preflight gagal: metadata atau hitungan belum valid.</p>}
   <label><input data-report-review type="checkbox" checked={accepted} disabled={!ready} onChange={e=>{setReviewed(e.target.checked?fingerprint:null);if(e.target.checked)setLog(previous=>appendReportOperation(previous,'review','reviewed'));setMessage('')}}/> Saya telah memeriksa sumber, cakupan, angka, dan batasan draf ini.</label>
   <div className="arcticReportActions"><button type="button" className="akBtn akBtnPrimary" data-report-html disabled={!accepted} onClick={()=>exportReport('html')}>Unduh HTML siap cetak</button><button type="button" className="akBtn akBtnGhost" data-report-csv disabled={!accepted} onClick={()=>exportReport('csv')}>Unduh CSV draf</button></div>
   {message&&<p role="status">{message}</p>}
   <details className="arcticReportOperations"><summary>Riwayat operasi sesi · {log.length}</summary><p>Hanya aktivitas lokal saat editor ini terbuka. Bukan audit trail server, antrean background, atau bukti unduhan selesai.</p>{log.length?<ol>{log.map(item=><li key={item.id}>#{item.id} · {item.action==='review'?'Review draf':item.action.toUpperCase()} · {item.status==='reviewed'?'Ditinjau pengguna':item.status==='requested'?'Unduhan diminta':'Gagal'}</li>)}</ol>:<p>Belum ada operasi.</p>}</details>
  </section>
 </details>
}
