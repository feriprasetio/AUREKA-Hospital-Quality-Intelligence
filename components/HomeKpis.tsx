'use client'
import {useEffect,useState} from 'react'
import type {SupabaseClient} from '@supabase/supabase-js'
import type {ReactNode} from 'react'
import CountUp from '@/components/CountUp'
import type { NavigateFn } from '@/lib/aureka/focus'
import { readAurekaOverdueIncidents, readAurekaPortfolioSummary, readAurekaProgramList, readAurekaQualityRoomReportingStatus } from '@/lib/aureka/metric-contracts'

type Room={id:number;name:string}
type OverdueRtl={id:string;title:string;pj:string;due:string}
type Totals={overdueRtl?:OverdueRtl[];overdueIkp?:number|null;done?:boolean;reported:number|null;rooms:number;riskTotal:number|null;riskVeryHigh:number|null;incidentsOpen:number|null;dataStatus:'loading'|'complete'|'partial'|'unavailable';retrievedAt:string|null}
const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const fmt=(v:number|null,done?:boolean):ReactNode=>v==null?(done?'–':<span className="hlKpiSkel" aria-label="Memuat"/>):<CountUp value={v}/>

/** Empat angka utama Beranda: pelaporan bulan ini, risiko, risiko sangat tinggi, IKP terbuka. */
export default function HomeKpis({supabase,rooms,isAdmin,roomId,showSafety,onNavigate}:{supabase:SupabaseClient;rooms:Room[];isAdmin:boolean;roomId:number|null;showSafety:boolean;onNavigate?:NavigateFn}){
 const year=new Date().getFullYear()
 const month=new Date().getMonth()+1
 const scopeRooms=roomId!=null?rooms.filter(r=>Number(r.id)===Number(roomId)):isAdmin?rooms:[]
 const [t,setT]=useState<Totals>({reported:null,rooms:scopeRooms.length,riskTotal:null,riskVeryHigh:null,incidentsOpen:null,dataStatus:'loading',retrievedAt:null})
 useEffect(()=>{
  let cancelled=false
  const ids=new Set(scopeRooms.map(r=>Number(r.id)))
  void (async()=>{
   const roomName=roomId!=null?rooms.find(r=>Number(r.id)===Number(roomId))?.name:undefined
   const [reporting,summary,overdueIncidents,program]=await Promise.all([
    readAurekaQualityRoomReportingStatus(supabase,year),
    showSafety?readAurekaPortfolioSummary(supabase,year,roomId):Promise.resolve(null),
    showSafety?readAurekaOverdueIncidents(supabase,{unitName:roomName,olderThanHours:48}):Promise.resolve(null),
    showSafety?readAurekaProgramList(supabase,year):Promise.resolve(null),
   ])
   if(cancelled)return
   let reported:number|null=null
   if(reporting.status==='complete'&&reporting.data){
    reported=new Set(reporting.data.filter(r=>r.month===month&&ids.has(r.room_id)).map(r=>r.room_id)).size
   }
   const s=summary?.status==='complete'?summary.data:null
   const overdueIkp=overdueIncidents?.status==='complete'?overdueIncidents.data:null
   const g=program?.status==='complete'?program.data:null
   const now=new Date()
   const overdueRtl:OverdueRtl[]=(Array.isArray(g?.actions)?g.actions:[])
    .filter((a:any)=>a?.due_date&&!['terverifikasi','dibatalkan','selesai'].includes(String(a.status))&&new Date(String(a.due_date)+'T23:59:59')<now&&(roomId==null||Number(a.assigned_room_id)===Number(roomId)))
    .sort((a:any,b:any)=>String(a.due_date).localeCompare(String(b.due_date)))
    .map((a:any)=>({id:String(a.id),title:String(a.title||'Tanpa judul'),pj:String(a.assigned_to_name||a.room_name||'Belum ada penanggung jawab'),due:String(a.due_date)}))
   const results=[reporting,...(showSafety?[summary,overdueIncidents,program].filter(Boolean) as any[]:[])]
   const complete=results.filter((r:any)=>r?.status==='complete').length
   const dataStatus=complete===results.length?'complete':complete===0?'unavailable':'partial'
   const retrievedAt=results.map((r:any)=>r?.retrievedAt).filter(Boolean).sort().at(-1)??null
   setT({
    done:true,overdueRtl,overdueIkp,reported,rooms:ids.size,
    riskTotal:s?.risk?.total??null,
    riskVeryHigh:s?.risk?.very_high??null,
    incidentsOpen:s?.incidents?.open??null,
    dataStatus,retrievedAt,
   })
  })().catch(()=>{
   if(!cancelled)setT(current=>({...current,done:true,reported:null,overdueIkp:null,riskTotal:null,riskVeryHigh:null,incidentsOpen:null,dataStatus:'unavailable'}))
  })
  return()=>{cancelled=true}
 // eslint-disable-next-line react-hooks/exhaustive-deps
 },[supabase,year,month,roomId,isAdmin,rooms.length,showSafety])
 const cards=[
  {label:`Ruangan lapor ${MONTHS[month-1]}`,value:t.reported==null?(t.done?'–':<span className="hlKpiSkel" aria-label="Memuat"/>):<><CountUp value={t.reported}/>/{t.rooms}</>,note:'Periode berjalan',tone:''},
  ...(showSafety?[
   {label:'Risiko terdaftar',value:fmt(t.riskTotal,t.done),note:roomId!=null?'Ruangan terpilih':'Seluruh unit kerja',tone:''},
   {label:'Risiko sangat tinggi',value:fmt(t.riskVeryHigh,t.done),note:'Prioritas manajemen',tone:'hlKpiDanger'},
   {label:'Laporan IKP terbuka',value:fmt(t.incidentsOpen,t.done),note:t.incidentsOpen===0?'Tidak ada yang tertunda':'Perlu tindak lanjut',tone:''}
  ]:[])
 ]
 // Batas waktu: sisa hari bulan berjalan (zona Pontianak) untuk pengisian logbook, dan IKP > 2×24 jam tanpa tindak lanjut.
 const today=Number(new Intl.DateTimeFormat('en-US',{day:'numeric',timeZone:'Asia/Pontianak'}).format(new Date()))
 const daysLeft=new Date(year,month,0).getDate()-today
 const notReported=t.reported==null?null:Math.max(0,t.rooms-t.reported)
 const deadlines:{key:string;tone:'warn'|'danger';text:string;action:string;go:()=>void}[]=[]
 if(notReported&&notReported>0)deadlines.push({key:'logbook',tone:daysLeft<=5?'danger':'warn',
  text:t.rooms===1?`Logbook ${MONTHS[month-1]} ruangan ini belum diisi · ${daysLeft<=0?'hari terakhir bulan ini':'sisa '+daysLeft+' hari'}`:`${notReported} dari ${t.rooms} ruangan belum mengisi logbook ${MONTHS[month-1]} · ${daysLeft<=0?'hari terakhir bulan ini':'sisa '+daysLeft+' hari'}`,
  action:t.rooms===1?'Isi logbook':'Lihat ruangan',go:()=>onNavigate?.('quality')})
 if(t.overdueIkp&&t.overdueIkp>0)deadlines.push({key:'ikp',tone:'danger',text:`${t.overdueIkp} laporan insiden menunggu tindak lanjut lebih dari 2×24 jam`,action:'Buka insiden',go:()=>onNavigate?.('safety',{tab:'incidents'})})
 const rtl=t.overdueRtl||[]
 if(rtl.length)deadlines.push({key:'rtl',tone:'danger',text:`${rtl.length} rencana tindak lanjut (RTL) lewat tenggat`,action:'Buka RTL',go:()=>onNavigate?.('rtl')})
 const fmtDue=(d:string)=>{const days=Math.floor((Date.now()-new Date(d+'T23:59:59').getTime())/86400000)+1;return new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short'}).format(new Date(d+'T00:00:00'))+' · telat '+days+' hari'}
 return <>
 <div className="hlKpiRow" role="list" aria-label="Ringkasan angka utama">
  {cards.map(c=><article role="listitem" key={c.label} className={'hlKpiCard '+c.tone}><span>{c.label}</span><strong>{c.value}</strong><small>{c.note}</small></article>)}
 </div>
 <div className="hlDataTrust" role="status">
  <span className={'hlDataTrustState '+t.dataStatus}>{t.dataStatus==='complete'?'Sumber terbaca':t.dataStatus==='partial'?'Sebagian sumber belum tersedia':t.dataStatus==='loading'?'Memeriksa sumber':'Sumber belum tersedia'}</span>
  <small>{t.retrievedAt?'Pembacaan terakhir '+new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Pontianak'}).format(new Date(t.retrievedAt)):'Nilai yang tidak tersedia ditampilkan sebagai - dan tidak dianggap nol.'}</small>
 </div>
 {deadlines.length>0&&<section className="hlDeadlines" aria-label="Batas waktu yang perlu diperhatikan">
  {deadlines.map(d=><div key={d.key} className={'hlDeadline '+d.tone}>
   <span className="hlDeadlineIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 3h6"/></svg></span>
   <p>{d.text}</p>
   {onNavigate&&<button type="button" onClick={d.go}>{d.action}</button>}
   {d.key==='rtl'&&<ul className="hlRtlList">{rtl.slice(0,5).map(a=><li key={a.id}><b>{a.title}</b><span>{a.pj}</span><em>{fmtDue(a.due)}</em></li>)}{rtl.length>5&&<li className="more">+{rtl.length-5} lainnya</li>}</ul>}
  </div>)}
 </section>}
 <style>{`
  .hlDataTrust{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:10px;padding:9px 12px;border:1px solid rgba(120,145,165,.24);border-radius:10px;background:rgba(245,249,252,.7)}
  .hlDataTrustState{font-size:11px;font-weight:800;color:#34536d}
  .hlDataTrustState.complete{color:#176b4a}
  .hlDataTrustState.partial{color:#92601d}
  .hlDataTrustState.unavailable{color:#a33a36}
  .hlDataTrust small{font-size:11px;color:#62788b}
  html[data-mode="gelap"] .hlDataTrust{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.12)}
  html[data-mode="gelap"] .hlDataTrustState,html[data-mode="gelap"] .hlDataTrust small{color:#c3ccd8}
 `}</style>
 </>
}
