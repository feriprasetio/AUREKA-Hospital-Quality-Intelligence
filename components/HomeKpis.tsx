'use client'
import {useEffect,useState} from 'react'
import type {SupabaseClient} from '@supabase/supabase-js'
import type {ReactNode} from 'react'
import CountUp from '@/components/CountUp'
import type { NavigateFn } from '@/lib/aureka/focus'

type Room={id:number;name:string}
type Totals={overdueIkp?:number|null;done?:boolean;reported:number|null;rooms:number;riskTotal:number|null;riskVeryHigh:number|null;incidentsOpen:number|null}
const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const fmt=(v:number|null,done?:boolean):ReactNode=>v==null?(done?'–':<span className="hlKpiSkel" aria-label="Memuat"/>):<CountUp value={v}/>

/** Empat angka utama Beranda: pelaporan bulan ini, risiko, risiko sangat tinggi, IKP terbuka. */
export default function HomeKpis({supabase,rooms,isAdmin,roomId,showSafety,onNavigate}:{supabase:SupabaseClient;rooms:Room[];isAdmin:boolean;roomId:number|null;showSafety:boolean;onNavigate?:NavigateFn}){
 const year=new Date().getFullYear()
 const month=new Date().getMonth()+1
 const scopeRooms=roomId!=null?rooms.filter(r=>Number(r.id)===Number(roomId)):isAdmin?rooms:[]
 const [t,setT]=useState<Totals>({reported:null,rooms:scopeRooms.length,riskTotal:null,riskVeryHigh:null,incidentsOpen:null})
 useEffect(()=>{let cancelled=false
  const ids=new Set(scopeRooms.map(r=>Number(r.id)))
  void (async()=>{
   const roomName=roomId!=null?rooms.find(r=>Number(r.id)===Number(roomId))?.name:undefined
   const cutoff=new Date(Date.now()-48*3600*1000).toISOString()
   let ikpQ:any=supabase.schema('aureka_patient_safety').from('incidents').select('id',{count:'exact',head:true}).in('status',['submitted','under_review']).lt('created_at',cutoff)
   if(roomName)ikpQ=ikpQ.eq('unit_name',roomName)
   const [rep,sum,ikp]=await Promise.allSettled([
    supabase.rpc('aureka_quality_room_reporting_status',{p_year:year}),
    showSafety?supabase.rpc('aureka_gov_infographics_summary_secure',{p_year:year,p_room:roomId}):Promise.resolve({data:null,error:null}),
    showSafety?ikpQ:Promise.resolve({count:null,error:null})
   ])
   if(cancelled)return
   let reported:number|null=null
   if(rep.status==='fulfilled'&&!rep.value.error&&Array.isArray(rep.value.data)){
    reported=new Set((rep.value.data as any[]).filter(r=>Number(r.month)===month&&ids.has(Number(r.room_id))).map(r=>Number(r.room_id))).size
   }
   const s:any=sum.status==='fulfilled'&&!sum.value.error?sum.value.data:null
   const overdueIkp=ikp.status==='fulfilled'&&!(ikp.value as any).error?((ikp.value as any).count??null):null
   setT({done:true,overdueIkp,reported,rooms:ids.size,riskTotal:s?.risk?.total??null,riskVeryHigh:s?.risk?.very_high??null,incidentsOpen:s?.incidents?.open??null})
  })()
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
 return <>
 <div className="hlKpiRow" role="list" aria-label="Ringkasan angka utama">
  {cards.map(c=><article role="listitem" key={c.label} className={'hlKpiCard '+c.tone}><span>{c.label}</span><strong>{c.value}</strong><small>{c.note}</small></article>)}
 </div>
 {deadlines.length>0&&<section className="hlDeadlines" aria-label="Batas waktu yang perlu diperhatikan">
  {deadlines.map(d=><div key={d.key} className={'hlDeadline '+d.tone}>
   <span className="hlDeadlineIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9 3h6"/></svg></span>
   <p>{d.text}</p>
   {onNavigate&&<button type="button" onClick={d.go}>{d.action}</button>}
  </div>)}
 </section>}
 </>
}
