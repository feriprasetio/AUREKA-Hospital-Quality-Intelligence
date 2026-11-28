'use client'
import {useEffect,useState} from 'react'
import {aurekaSupabase} from '@/lib/aureka/supabase'
import {parseStaffEducation,type StaffEducationRow} from '@/lib/aureka/improvement-source-engine'
import {toUserFacingError} from '@/lib/ui/error-feedback'
export default function StaffEducationPanel({staffId}:{staffId:string}){
 const [open,setOpen]=useState(false)
 const [attempt,setAttempt]=useState(0)
 const [data,setData]=useState<StaffEducationRow[]|null>(null)
 const [error,setError]=useState('')
 useEffect(()=>{
  if(!open)return
  const c=new AbortController();setData(null);setError('')
  void(async()=>{try{
   const {data,error}=await aurekaSupabase.rpc('aureka_staff_education_summary',{p_staff_id:staffId}).abortSignal(c.signal)
   if(error)throw error
   const rows=parseStaffEducation(data,staffId)
   if(!c.signal.aborted)setData(rows)
  }catch(e){if(!c.signal.aborted)setError(toUserFacingError(e,{fallback:'Riwayat pendidikan belum dapat dibaca sesuai kewenangan.'}))}})()
  return()=>c.abort()
 },[staffId,open,attempt])
 return <section className="scProfileCard"><h3>Pendidikan, Kehadiran & Sertifikasi</h3><button className="scProfileClose" type="button" onClick={()=>setOpen(x=>!x)}>{open?'Tutup riwayat pendidikan':'Lihat riwayat pendidikan'}</button>
 {open&&(error?<div className="scProfileNotice error" role="alert">{error}<button className="scProfileClose" type="button" onClick={()=>setAttempt(x=>x+1)}>Muat ulang</button></div>:data===null?<p role="status">Memuat riwayat pendidikan…</p>:data.length===0?<p className="scProfileEmpty">Belum ada kegiatan yang terhubung melalui Staff ID dalam ruang lingkup akses.</p>:<div className="scProfileList">{data.map(r=><div className="scProfileItem" key={r.participant_id}><strong>{r.title}</strong><span className="scProfileMeta">{r.event_type} · {r.start_at?new Date(r.start_at).toLocaleDateString('id-ID',{timeZone:'Asia/Pontianak'}):'—'} · {r.participant_status}</span><div>Hadir: {r.present_sessions}/{r.recorded_sessions} sesi tercatat · Sertifikat aktif: {r.valid_certificates}</div></div>)}</div>)}
 {open&&<p className="scProfileMeta">Maksimal 100 kegiatan terakhir sesuai akses. Sertifikat dicatat dari register resmi, bukan bukti otomatis kompetensi.</p>}
 </section>
}
