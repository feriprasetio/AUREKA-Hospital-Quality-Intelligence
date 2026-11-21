'use client'
import {useEffect,useState} from 'react'
import {aurekaSupabase} from '@/lib/aureka/supabase'
import {toUserFacingError} from '@/lib/ui/error-feedback'

type Staff={id:string;employee_code:string;display_name:string;profession_group:string;position_title:string;source_unit:string}
type Profile={
 staff:{id:string;employee_code:string;display_name:string;profession_group:string;position_title:string;source_unit:string;directory_status:string}
 assignments:Array<{id:string;room_id:number;room_name:string;assignment_status:string;assigned_at:string;released_at:string|null;is_locked:boolean}>
 performance:Array<{id:string;evaluation_type:string;status:string;period_start:string;period_end:string;summary:Record<string,unknown>;review_note:string;validated_at:string|null;room_name:string}>
 incidents:Array<{id:string;incident_code:string;incident_date:string;unit_name:string;incident_type:string;status:string}>
 named_culture_history:Array<{survey_period:string;unit_name:string;submitted_at:string;response_count:number}>
 permissions:{performance:boolean;incidents:boolean;named_culture_history:boolean}
}
const dateText=(value:string|null|undefined)=>value?new Date(value+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):'—'
const title=(s:string)=>s==='oppe'?'OPPE':s==='fppe'?'FPPE':s.toUpperCase()

export default function StaffCrossModuleProfilePanel({staff,onClose}:{staff:Staff;onClose:()=>void}){
 const [data,setData]=useState<Profile|null>(null)
 const [loading,setLoading]=useState(true)
 const [error,setError]=useState('')
 useEffect(()=>{
  let active=true
  ;(async()=>{
   setLoading(true);setError('')
   const {data:result,error:e}=await aurekaSupabase.rpc('aureka_staff_cross_module_profile',{p_staff_id:staff.id})
   if(!active)return
   if(e){setError(toUserFacingError(e,{fallback:'Profil lintas modul belum dapat dimuat sesuai kewenangan akun.'}));setData(null)}
   else setData(result as Profile)
   setLoading(false)
  })()
  return()=>{active=false}
 },[staff.id])
 return <div className="scProfileBackdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}>
  <section className="scProfileDialog" role="dialog" aria-modal="true" aria-labelledby="sc-profile-title">
   <style>{'.scProfileBackdrop{position:fixed;inset:0;z-index:1200;display:grid;place-items:center;padding:16px;background:rgba(12,25,18,.52);backdrop-filter:blur(7px)}.scProfileDialog{width:min(980px,100%);max-height:92vh;overflow:auto;padding:20px;border-radius:20px;border:1px solid rgba(255,255,255,.75);background:var(--surface,#f8fbf9);color:var(--text,#21372c);box-shadow:0 24px 80px rgba(0,0,0,.26)}.scProfileHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.scProfileHead h2{font-size:19px;margin:3px 0}.scProfileHead p{font-size:12px;color:var(--muted);margin:0}.scProfileClose{border:1px solid var(--line);border-radius:9px;padding:8px 11px;background:var(--surface);color:inherit;cursor:pointer}.scProfileGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}.scProfileCard{padding:13px;border:1px solid var(--line,rgba(50,70,60,.15));border-radius:13px;background:rgba(255,255,255,.45);min-width:0}.scProfileCard h3{font-size:13px;margin:0 0 10px}.scProfileList{display:grid;gap:8px}.scProfileItem{padding:9px 0;border-top:1px solid var(--line,rgba(50,70,60,.1));font-size:12px;line-height:1.55}.scProfileItem:first-child{border-top:0;padding-top:0}.scProfileItem strong{display:block;font-size:12px}.scProfileMeta{color:var(--muted);font-size:12px}.scProfileTag{display:inline-flex;padding:3px 7px;border-radius:20px;background:rgba(80,110,90,.1);font-size:11px;font-weight:800}.scProfileNotice{padding:12px;border-radius:10px;background:rgba(20,120,80,.08);font-size:12px;line-height:1.55}.scProfileNotice.error{background:rgba(180,45,45,.1)}.scProfileEmpty{font-size:12px;color:var(--muted);padding:12px 0}@media(max-width:700px){.scProfileGrid{grid-template-columns:1fr}.scProfileDialog{padding:15px}}'} </style>
   <header className="scProfileHead"><div><span className="scProfileMeta">DIREKTORI INDUK SDM · PROFIL LINTAS MODUL</span><h2 id="sc-profile-title">{staff.display_name}</h2><p>{staff.employee_code} · {staff.profession_group} · {staff.position_title||'Jabatan belum dicantumkan'} · {staff.source_unit||'Unit sumber belum dicantumkan'}</p></div><button type="button" className="scProfileClose" onClick={onClose}>Tutup</button></header>
   {loading?<div className="scProfileEmpty">Memuat hubungan data pegawai…</div>:error?<div className="scProfileNotice error" role="alert">{error}</div>:data&&<>
    <div className="scProfileGrid">
     <section className="scProfileCard"><h3>Tim dan Penugasan</h3>{data.assignments.length===0?<div className="scProfileEmpty">Belum ada penugasan aktif/riwayat yang berada dalam ruang lingkup akses.</div>:<div className="scProfileList">{data.assignments.map(x=><div className="scProfileItem" key={x.id}><strong>{x.room_name||'Unit'}</strong><span className="scProfileMeta">{x.assignment_status} · {x.is_locked?'Roster terkunci':'Belum terkunci'} · Mulai {dateText(x.assigned_at.slice(0,10))}{x.released_at?' · Berakhir '+dateText(x.released_at.slice(0,10)):''}</span></div>)}</div>}</section>
     <section className="scProfileCard"><h3>Evaluasi Kinerja Klinis · OPPE / FPPE</h3>{!data.permissions.performance?<div className="scProfileEmpty">Role akun tidak memiliki kewenangan membaca evaluasi kinerja.</div>:data.performance.length===0?<div className="scProfileEmpty">Belum ada evaluasi OPPE/FPPE pada ruang lingkup akses.</div>:<div className="scProfileList">{data.performance.map(x=><div className="scProfileItem" key={x.id}><strong>{title(x.evaluation_type)} · {x.status}</strong><span className="scProfileMeta">{x.room_name||'Unit'} · {dateText(x.period_start)} – {dateText(x.period_end)}{x.validated_at?' · Validasi '+dateText(x.validated_at.slice(0,10)):''}</span>{x.review_note&&<div className="scProfileMeta">Catatan: {x.review_note}</div>}</div>)}</div>}</section>
     <section className="scProfileCard"><h3>Insiden Keselamatan Pasien</h3>{!data.permissions.incidents?<div className="scProfileEmpty">Role akun tidak memiliki kewenangan membaca keterkaitan insiden.</div>:data.incidents.length===0?<div className="scProfileEmpty">Tidak ditemukan tautan atribusi insiden untuk tenaga kerja ini.</div>:<div className="scProfileList">{data.incidents.map(x=><div className="scProfileItem" key={x.id}><strong>{x.incident_code} · {x.incident_type}</strong><span className="scProfileMeta">{x.unit_name} · {dateText(x.incident_date)} · {x.status}</span></div>)}</div>}</section>
     <section className="scProfileCard"><h3>Riwayat Survei Budaya Keselamatan</h3>{!data.permissions.named_culture_history?<div className="scProfileEmpty">Riwayat survei bernama hanya tersedia bagi role yang berwenang. Respons anonim tidak ditautkan ke profil individu.</div>:data.named_culture_history.length===0?<div className="scProfileEmpty">Tidak ada respons survei bernama yang terhubung ke identitas ini. Respons anonim tetap terpisah.</div>:<div className="scProfileList">{data.named_culture_history.map((x,i)=><div className="scProfileItem" key={x.survey_period+'-'+x.unit_name+'-'+i}><strong>{x.survey_period} · {x.unit_name}</strong><span className="scProfileMeta">{x.response_count} pengiriman bernama · Terakhir {new Date(x.submitted_at).toLocaleDateString('id-ID')}</span></div>)}</div>}</section>
    </div>
    <p className="scProfileMeta" style={{marginTop:12}}>Tampilan mengikuti hak akses dan ruang lingkup akun. Profil ini tidak menampilkan NIK/NIP, identitas pasien, atau isi respons survei anonim.</p>
   </>}
  </section>
 </div>
}
