'use client'
import {useState} from 'react'
import {aggregateReportCsv,aggregateReportHtml,reportFingerprint,reportPreflight,reportRows,appendReportOperation,REPORT_DEFAULT_OPTIONS,type AggregateReport,type ReportOptions,type ReportOperation} from '@/lib/aureka/aggregate-report-studio'
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
 const ready=reportPreflight(report)
 const fingerprint=reportFingerprint(report,options)
 const accepted=ready&&reviewed===fingerprint
 const change=(patch:Partial<ReportOptions>)=>{setOptions(previous=>({...previous,...patch}));setReviewed(null);setMessage('')}
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
   <article className="arcticReportPreview" data-report-preview>
    <small>AUREKA · DRAF BELUM DISAHKAN</small><h3>{report.title}</h3>
    <dl><dt>Sumber</dt><dd>{report.source}</dd><dt>Cakupan</dt><dd>{report.scope}</dd><dt>Snapshot</dt><dd>{report.snapshot}</dd><dt>Metode</dt><dd>{report.method}</dd></dl>
    <table><thead><tr><th>Indikator tinjauan</th><th>Jumlah</th></tr></thead><tbody>{reportRows(report,options).map(([label,value],i)=><tr key={i}><th scope="row">{label}</th><td>{value.toLocaleString('id-ID')}</td></tr>)}</tbody></table>
    <p><strong>Batasan wajib:</strong> {report.limitation}</p>{options.notes&&<p>Tindak lanjut: periksa data sumber dan tinjau temuan bersama pemilik proses. Draf ini bukan pengesahan atau keputusan klinis.</p>}
   </article>
   {!ready&&<p role="alert">Preflight gagal: metadata atau hitungan belum valid.</p>}
   <label><input data-report-review type="checkbox" checked={accepted} disabled={!ready} onChange={e=>{setReviewed(e.target.checked?fingerprint:null);if(e.target.checked)setLog(previous=>appendReportOperation(previous,'review','reviewed'));setMessage('')}}/> Saya telah memeriksa sumber, cakupan, angka, dan batasan draf ini.</label>
   <div className="arcticReportActions"><button type="button" className="akBtn akBtnPrimary" data-report-html disabled={!accepted} onClick={()=>exportReport('html')}>Unduh HTML siap cetak</button><button type="button" className="akBtn akBtnGhost" data-report-csv disabled={!accepted} onClick={()=>exportReport('csv')}>Unduh CSV draf</button></div>
   {message&&<p role="status">{message}</p>}
   <details className="arcticReportOperations"><summary>Riwayat operasi sesi · {log.length}</summary><p>Hanya aktivitas lokal saat editor ini terbuka. Bukan audit trail server, antrean background, atau bukti unduhan selesai.</p>{log.length?<ol>{log.map(item=><li key={item.id}>#{item.id} · {item.action==='review'?'Review draf':item.action.toUpperCase()} · {item.status==='reviewed'?'Ditinjau pengguna':item.status==='requested'?'Unduhan diminta':'Gagal'}</li>)}</ol>:<p>Belum ada operasi.</p>}</details>
  </section>
 </details>
}
