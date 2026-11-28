'use client'
import { useState } from 'react'
import AurekaModal from '@/components/ui/AurekaModal'
import { RISK_REVIEW_SKILL, reviewRiskSnapshot, riskReviewMetrics, riskReviewCsv, type RiskReviewRow, type RiskReviewResult } from '@/lib/aureka/risk-review-skill'
import { downloadCsv } from '@/lib/aureka/csv-export'
import AggregateReportStudio from '@/components/workspace/AggregateReportStudio'
type Props={rows:readonly RiskReviewRow[];scope:string;scopeKey:string;refreshedAt:string|null;ready:boolean;onRefresh:()=>void;score:(likelihood:number,impact:number)=>number;level:(score:number)=>string}
export default function RiskReviewSkill({rows,scope,scopeKey,refreshedAt,ready,onRefresh,score,level}:Props){
 const [open,setOpen]=useState(false)
 const [run,setRun]=useState<{rows:readonly RiskReviewRow[];scopeKey:string;refreshedAt:string;result:RiskReviewResult}|null>(null)
 const current=ready&&run&&run.rows===rows&&run.scopeKey===scopeKey&&run.refreshedAt===refreshedAt?run:null
 const close=()=>{setOpen(false);setRun(null)}
 return <>
  <button type="button" className="rmButton subtle" data-arctic-risk-review onClick={()=>{setRun(null);setOpen(true)}}>Evaluasi risiko</button>
  <AurekaModal open={open} onClose={close} title="Skill · Evaluasi risiko" subtitle="PMKP · Manajemen Risiko · Baca-saja" size="lg" footer={<>
   <button type="button" className="akBtn akBtnGhost" onClick={close}>Tutup</button>
   {current?<button type="button" className="akBtn akBtnPrimary" data-risk-review-export onClick={()=>downloadCsv('draf-evaluasi-risiko.csv',riskReviewCsv(current.result,scope,current.refreshedAt))}>Unduh CSV ringkasan</button>:<button type="button" className="akBtn akBtnPrimary" data-risk-review-run disabled={!ready||!refreshedAt} onClick={()=>{if(ready&&refreshedAt)setRun({rows,scopeKey,refreshedAt,result:reviewRiskSnapshot(rows,{score,level})})}}>Jalankan tinjauan</button>}
  </>}>
   <section className="arcticRiskReview" aria-label="Preflight evaluasi risiko">
    <dl><dt>Sumber</dt><dd>{RISK_REVIEW_SKILL.source}</dd><dt>Cakupan</dt><dd>{scope}</dd><dt>Data pada hasil filter</dt><dd>{rows.length.toLocaleString('id-ID')} risiko</dd><dt>Snapshot terakhir berhasil dimuat</dt><dd>{refreshedAt?new Date(refreshedAt).toLocaleString('id-ID'):'Belum terverifikasi'}</dd></dl>
    {!ready&&<div role="status"><p>Data belum siap atau sedang diperbarui. Tidak ada hasil yang dinyatakan valid.</p><button type="button" className="akBtn akBtnGhost" onClick={onRefresh}>Muat ulang data</button></div>}
    {run&&!current&&<p role="alert">Data atau filter telah berubah. Jalankan ulang tinjauan sebelum ekspor.</p>}
    {!current&&<p>Validasi hanya membaca skor, level, dan kelengkapan yang tersimpan. Metode matriks existing digunakan untuk menemukan ketidaksesuaian, bukan mengubah nilai, status, atau keputusan mitigasi. Tidak mengirim data ke NARA atau layanan lain.</p>}
    {current&&<div data-risk-review-result>
     <h4>Draf tinjauan</h4><p>Perlu diperiksa oleh pengguna berwenang. Jumlah bukan keputusan penerimaan risiko.</p>
     <table><thead><tr><th>Indikator tinjauan</th><th>Jumlah</th></tr></thead><tbody>{riskReviewMetrics(current.result).map(([label,value])=><tr key={label}><td>{label}</td><td data-review-metric={label}>{value.toLocaleString('id-ID')}</td></tr>)}</tbody></table>
     <h4>Distribusi level tersimpan</h4><table><thead><tr><th>Level</th><th>Total</th><th>Aktif</th></tr></thead><tbody>{current.result.distribution.map(x=><tr key={x.level}><td>{x.level}</td><td>{x.total}</td><td>{x.active}</td></tr>)}</tbody></table>
     <p>Langkah berikutnya: verifikasi ketidaksesuaian di register, tinjau risiko aktif prioritas, dan lengkapi pemilik, tenggat, serta kontrol melalui alur mitigasi existing. Ekspor hanya agregat; tidak memuat identitas atau kronologi.</p>
     <AggregateReportStudio key={current.refreshedAt+current.scopeKey} report={{title:'Draf evaluasi risiko',source:RISK_REVIEW_SKILL.source,scope,snapshot:current.refreshedAt,method:'Pemeriksaan nilai tersimpan memakai matriks dan level existing, tanpa perubahan nilai.',limitation:'Jumlah agregat bukan keputusan penerimaan risiko. Verifikasi dengan pemilik risiko. Tidak berisi identitas atau kronologi.',metrics:riskReviewMetrics(current.result),details:current.result.distribution.flatMap(x=>[[x.level+' · total',x.total],[x.level+' · aktif',x.active]] as const)}}/>
    </div>}
   </section>
  </AurekaModal>
 </>
}
