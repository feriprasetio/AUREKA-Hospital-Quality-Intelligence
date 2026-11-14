'use client'
import {useEffect,useState} from 'react'
import type {SupabaseClient} from '@supabase/supabase-js'
import type {ReactNode} from 'react'
import CountUp from '@/components/CountUp'

type Room={id:number;name:string}
type Totals={done?:boolean;reported:number|null;rooms:number;riskTotal:number|null;riskVeryHigh:number|null;incidentsOpen:number|null}
const MONTHS=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']
const fmt=(v:number|null,done?:boolean):ReactNode=>v==null?(done?'–':<span className="hlKpiSkel" aria-label="Memuat"/>):<CountUp value={v}/>

/** Empat angka utama Beranda: pelaporan bulan ini, risiko, risiko sangat tinggi, IKP terbuka. */
export default function HomeKpis({supabase,rooms,isAdmin,roomId,showSafety}:{supabase:SupabaseClient;rooms:Room[];isAdmin:boolean;roomId:number|null;showSafety:boolean}){
 const year=new Date().getFullYear()
 const month=new Date().getMonth()+1
 const scopeRooms=roomId!=null?rooms.filter(r=>Number(r.id)===Number(roomId)):isAdmin?rooms:[]
 const [t,setT]=useState<Totals>({reported:null,rooms:scopeRooms.length,riskTotal:null,riskVeryHigh:null,incidentsOpen:null})
 useEffect(()=>{let cancelled=false
  const ids=new Set(scopeRooms.map(r=>Number(r.id)))
  void (async()=>{
   const [rep,sum]=await Promise.allSettled([
    supabase.rpc('aureka_quality_room_reporting_status',{p_year:year}),
    showSafety?supabase.rpc('aureka_gov_infographics_summary_secure',{p_year:year,p_room:roomId}):Promise.resolve({data:null,error:null})
   ])
   if(cancelled)return
   let reported:number|null=null
   if(rep.status==='fulfilled'&&!rep.value.error&&Array.isArray(rep.value.data)){
    reported=new Set((rep.value.data as any[]).filter(r=>Number(r.month)===month&&ids.has(Number(r.room_id))).map(r=>Number(r.room_id))).size
   }
   const s:any=sum.status==='fulfilled'&&!sum.value.error?sum.value.data:null
   setT({done:true,reported,rooms:ids.size,riskTotal:s?.risk?.total??null,riskVeryHigh:s?.risk?.very_high??null,incidentsOpen:s?.incidents?.open??null})
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
 return <div className="hlKpiRow" role="list" aria-label="Ringkasan angka utama">
  {cards.map(c=><article role="listitem" key={c.label} className={'hlKpiCard '+c.tone}><span>{c.label}</span><strong>{c.value}</strong><small>{c.note}</small></article>)}
 </div>
}
