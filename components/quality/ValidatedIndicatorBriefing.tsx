'use client'
import {useState} from 'react'
import AggregateReportStudio from '@/components/workspace/AggregateReportStudio'
import {buildValidatedIndicatorBriefing} from '@/lib/aureka/validated-indicator-briefing'
import {monthlyQualityCoverage,QUALITY_MONTH_NAMES} from '@/lib/aureka/monthly-quality-coverage'
import type {IndicatorResult} from '@/lib/aureka/quality-results-engine'

export default function ValidatedIndicatorBriefing({results,year,scopeLabel,validatedRecords}:{results:readonly IndicatorResult[];year:number;scopeLabel:string;validatedRecords:number}) {
 const [generated,setGenerated]=useState(false)
 const [month,setMonth]=useState(0)
 const [monthlyGenerated,setMonthlyGenerated]=useState(false)
 const coverage=monthlyGenerated?monthlyQualityCoverage(results,month):null
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
  <section className="arcticMonthlyReview" aria-label="Rekap mutu bulanan tervalidasi"><h3>Rekap mutu bulanan · kelengkapan hasil</h3><p>Gunakan agregat per bulan dari mesin capaian yang sama. Tidak menghitung ulang target atau merata-ratakan indikator yang berbeda.</p><label>Bulan <select data-quality-review-month value={month} onChange={e=>{setMonth(Number(e.target.value));setMonthlyGenerated(false)}}><option value={0}>Pilih bulan</option>{QUALITY_MONTH_NAMES.map((name,index)=><option key={name} value={index+1}>{name}</option>)}</select></label><button type="button" className="qraBtn" data-quality-monthly-run disabled={!month} onClick={()=>setMonthlyGenerated(true)}>Susun rekap bulanan</button>{coverage&&<div data-quality-monthly-result><p>{coverage.observed} dari {coverage.active} profil memiliki pengamatan pada bulan ini. {coverage.withoutObservation} profil belum memiliki pengamatan yang dapat dihitung.</p><AggregateReportStudio key={month} report={{title:'Draf rekap mutu bulanan',source:'Agregat bulanan mesin capaian indikator tervalidasi',scope:scopeLabel+' · '+QUALITY_MONTH_NAMES[month-1]+' '+year+' · seluruh kategori',snapshot:'Dataset tervalidasi pada workspace saat ini',method:'Hitung profil aktif, profil dengan pengamatan, dan ketersediaan rate atau mean existing.',limitation:'Hitungan laporan per profil dapat menghitung satu laporan lebih dari sekali. Bukan jumlah pasien, bukan status kelulusan target, dan bukan rerata capaian rumah sakit.',metrics:[['Profil aktif',coverage.active],['Profil dengan pengamatan',coverage.observed],['Profil dengan nilai terukur',coverage.measurable],['Profil tanpa pengamatan',coverage.withoutObservation],['Profil teramati tanpa nilai terukur',coverage.withoutMeasure],['Catatan tervalidasi per profil (tidak unik)',coverage.validatedProfileRecords]]}}/></div>}</section>
 </details>
}
