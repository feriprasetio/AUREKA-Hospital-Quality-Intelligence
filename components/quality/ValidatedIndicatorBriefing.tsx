'use client'
import {useState} from 'react'
import AggregateReportStudio from '@/components/workspace/AggregateReportStudio'
import {buildValidatedIndicatorBriefing,type ValidatedIndicatorBriefingInput} from '@/lib/aureka/validated-indicator-briefing'

export default function ValidatedIndicatorBriefing({results,year,scopeLabel,validatedRecords}:{results:readonly ValidatedIndicatorBriefingInput[];year:number;scopeLabel:string;validatedRecords:number}) {
 const [generated,setGenerated]=useState(false)
 const summary=generated?buildValidatedIndicatorBriefing(results):null
 return <details className="qraPanel arcticDomainSummary arcticBriefing">
  <summary>Briefing mutu · laporan tervalidasi</summary>
  <p>Seluruh indikator dalam unit dan tahun terpilih, tidak mengikuti filter kategori. Draf ini tidak diterbitkan atau mengubah data.</p>
  <button type="button" className="qraBtn" onClick={()=>setGenerated(true)}>Susun draf briefing</button>
  {summary&&<div role="status" className="arcticBriefingOutput">
   <h3>Draf briefing · {scopeLabel} · {year}</h3>
   <p>Sumber: profil indikator aktif dan laporan tervalidasi yang dihitung oleh mesin capaian existing.</p>
   {!validatedRecords?<p>Belum ada laporan tervalidasi. Tidak tersedia dasar untuk menyimpulkan capaian.</p>:<p>{validatedRecords.toLocaleString('id-ID')} laporan tervalidasi. {summary.observed} dari {summary.active} profil indikator memiliki pengamatan yang dapat dihitung.</p>}
   {validatedRecords>0&&summary.assessed>0?<p>{summary.met} dari {summary.assessed} profil dengan target terukur memenuhi target; {summary.below} belum memenuhi target. {summary.unassessed} profil belum dapat dinilai terhadap target. Tinjau hasil per indikator dan sumber data sebelum menetapkan tindak lanjut.</p>:<p>Belum tersedia target terukur dengan hasil tervalidasi yang dapat dinilai.</p>}
   <small>Perhitungan capaian per indikator tidak diubah. Jumlah profil bukan rerata capaian klinis. Draf memerlukan review pemilik indikator.</small>
   <AggregateReportStudio report={{title:'Draf briefing mutu tervalidasi',source:'Profil indikator aktif dan laporan tervalidasi · mesin capaian existing',scope:scopeLabel+' · '+year+' · seluruh kategori',snapshot:'Dataset tervalidasi yang sedang ditampilkan, tahun '+year,method:'Jumlah profil aktif, teramati dan target terukur dihitung dari hasil mesin existing. Tidak memasukkan laporan belum divalidasi.',limitation:'Jumlah profil bukan rerata capaian klinis. Jika belum ada laporan tervalidasi, tidak tersedia dasar menyimpulkan capaian. Draf memerlukan review pemilik indikator.',metrics:[['Laporan tervalidasi',validatedRecords],['Profil aktif',summary.active],['Profil teramati',summary.observed],['Profil dengan target terukur',summary.assessed],['Memenuhi target',summary.met],['Belum memenuhi target',summary.below],['Belum dapat dinilai',summary.unassessed]]}}/>
  </div>}
 </details>
}
