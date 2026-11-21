'use client'
import { useCallback,useEffect,useMemo,useState } from 'react'
import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'
import { aurekaSupabase } from '@/lib/aureka/supabase'

type Room={id:number;name:string}
type EventRow={id:string;event_code:string;title:string;topic:string;organizer:string;room_id:number|null;start_at:string;end_at:string|null;venue:string;instructor_json:string[];learning_objectives:string[];status:string}
type Staff={id:string;employee_code:string;display_name:string;profession_group:string;position_title:string;source_unit:string}
type Participant={id:string;event_id:string;participant_type:string;staff_id:string|null;full_name:string;participant_code:string;profession_or_program:string;room_id:number|null;status:string}
type Certificate={id:string;event_id:string;participant_id:string;certificate_number:string;verification_code:string;issue_date:string;object_path:string|null;revoked_at:string|null}
const education=()=>aurekaSupabase.schema('aureka_system')
const managers=['ADMIN','PMKP','MANAGEMENT','KABID']
const dateLabel=(v:string)=>new Date(v).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Pontianak'})
const clean=(v:string)=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,' ')
const esc=(v:string)=>clean(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')
const filename=(v:string)=>clean(v).replace(/[^A-Za-z0-9._-]+/g,'-')
async function digest(blob:Blob){const hash=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());return Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,'0')).join('')}
function makePdf(event:EventRow,p:Participant,num:string,code:string){
 const rows=[
  '0.08 0.22 0.36 RG 3 w 24 24 794 547 re S',
  'BT /F1 14 Tf 0 0 0 rg 70 500 Td ('+esc('UPT RSUD Sultan Syarif Mohamad Alkadrie Kota Pontianak')+') Tj ET',
  'BT /F1 28 Tf 0.08 0.22 0.36 rg 305 435 Td (SERTIFIKAT) Tj ET',
  'BT /F1 13 Tf 0.08 0.22 0.36 rg 315 405 Td (IN HOUSE TRAINING) Tj ET',
  'BT /F1 12 Tf 0 0 0 rg 360 365 Td (Diberikan kepada) Tj ET',
  'BT /F1 24 Tf 0.08 0.22 0.36 rg 120 325 Td ('+esc(p.full_name)+') Tj ET',
  'BT /F1 12 Tf 0 0 0 rg 70 285 Td ('+esc('Atas partisipasi dalam kegiatan '+event.title)+') Tj ET',
  'BT /F1 11 Tf 0 0 0 rg 70 260 Td ('+esc('Topik: '+(event.topic||'-'))+') Tj ET',
  'BT /F1 11 Tf 0 0 0 rg 70 235 Td ('+esc('Penyelenggara: '+event.organizer+' | '+(event.venue||'-'))+') Tj ET',
  'BT /F1 10 Tf 0 0 0 rg 70 80 Td ('+esc('Nomor: '+num+' | Kode verifikasi: '+code)+') Tj ET',
  'BT /F1 10 Tf 0 0 0 rg 570 110 Td (Pontianak) Tj ET',
  '0 0 0 RG 0.7 w 560 88 m 760 88 l S',
  'BT /F1 10 Tf 0 0 0 rg 570 68 Td (Pejabat yang berwenang) Tj ET'
 ]
 const stream=rows.join('\n')
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream'
 ]
 let pdf='%PDF-1.4\n';const offsets=[0]
 objects.forEach((o,i)=>{offsets.push(pdf.length);pdf+=(i+1)+' 0 obj\n'+o+'\nendobj\n'})
 const xref=pdf.length
 pdf+='xref\n0 '+(objects.length+1)+'\n0000000000 65535 f \n'
 for(let i=1;i<offsets.length;i++)pdf+=String(offsets[i]).padStart(10,'0')+' 00000 n \n'
 pdf+='trailer\n<< /Size '+(objects.length+1)+' /Root 1 0 R >>\nstartxref\n'+xref+'\n%%EOF'
 return new Blob([pdf],{type:'application/pdf'})
}

export default function InHouseTrainingWorkspace({role,userId,rooms=[],initialRoomId=null,lockRoomScope=false}:{
 role:string|null;userId:string;rooms?:Room[];initialRoomId?:number|null;lockRoomScope?:boolean
}){
 const canManage=managers.includes(role||'')
 const [view,setView]=useState<'overview'|'list'|'detail'>('overview')
 const [events,setEvents]=useState<EventRow[]>([])
 const [staff,setStaff]=useState<Staff[]>([])
 const [participants,setParticipants]=useState<Participant[]>([])
 const [certificates,setCertificates]=useState<Certificate[]>([])
 const [active,setActive]=useState<EventRow|null>(null)
 const [loading,setLoading]=useState(true)
 const [working,setWorking]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [showForm,setShowForm]=useState(false)
 const [title,setTitle]=useState('')
 const [topic,setTopic]=useState('')
 const [organizer,setOrganizer]=useState('Komite PMKP')
 const [start,setStart]=useState('')
 const [end,setEnd]=useState('')
 const [room,setRoom]=useState(initialRoomId==null?'':String(initialRoomId))
 const [venue,setVenue]=useState('UPT RSUD Sultan Syarif Mohamad Alkadrie Kota Pontianak')
 const [instructors,setInstructors]=useState('')
 const [selectedStaff,setSelectedStaff]=useState('')
 const [search,setSearch]=useState('')
 const [busyId,setBusyId]=useState('')

 const load=useCallback(async()=>{
  setLoading(true);setError('')
  const {data,error:e}=await education().from('education_events').select('id,event_code,title,topic,organizer,room_id,start_at,end_at,venue,instructor_json,learning_objectives,status').eq('event_type','in_house_training').order('start_at',{ascending:false}).limit(500)
  if(e){setEvents([]);setError('Register IHT belum dapat dimuat: '+e.message)}else setEvents((data||[]) as EventRow[])
  if(canManage){
   const {data:people,error:staffError}=await aurekaSupabase.schema('aureka_quality').from('staff_directory').select('id,employee_code,display_name,profession_group,position_title,source_unit').eq('directory_status','available').order('display_name').limit(2000)
   if(staffError)setError('Direktori tenaga kerja belum dapat dimuat: '+staffError.message)
   else setStaff((people||[]) as Staff[])
  }
  setLoading(false)
 },[canManage])
 useEffect(()=>{void load()},[load])
 const openEvent=async(event:EventRow)=>{
  setActive(event);setView('detail');setWorking(true);setError('');setNotice('')
  const [p,c]=await Promise.all([
   education().from('education_participants').select('id,event_id,participant_type,staff_id,full_name,participant_code,profession_or_program,room_id,status').eq('event_id',event.id).neq('status','cancelled').order('full_name'),
   education().from('education_certificates').select('id,event_id,participant_id,certificate_number,verification_code,issue_date,object_path,revoked_at').eq('event_id',event.id).is('revoked_at',null)
  ])
  if(p.error)setError('Daftar peserta tidak dapat dimuat: '+p.error.message);else setParticipants((p.data||[]) as Participant[])
  if(c.error)setError('Register sertifikat tidak dapat dimuat: '+c.error.message);else setCertificates((c.data||[]) as Certificate[])
  setWorking(false)
 }
 const create=async()=>{
  if(!canManage||working)return
  if(!title.trim()||!organizer.trim()||!start){setError('Nama kegiatan, penyelenggara, dan tanggal mulai wajib diisi.');return}
  const s=new Date(start),e=end?new Date(end):null
  if(Number.isNaN(s.getTime())||(e&&(Number.isNaN(e.getTime())||e<s))){setError('Rentang tanggal kegiatan tidak valid.');return}
  setWorking(true);setError('');setNotice('')
  const {data:auth,error:authError}=await aurekaSupabase.auth.getUser()
  if(authError||!auth.user){setWorking(false);setError('Sesi autentikasi tidak tersedia.');return}
  const {data,error:saveError}=await education().from('education_events').insert({
   event_type:'in_house_training',title:title.trim(),topic:topic.trim(),organizer:organizer.trim(),room_id:room?Number(room):null,
   start_at:s.toISOString(),end_at:e?.toISOString()||null,venue:venue.trim(),
   instructor_json:instructors.split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean),
   status:'published',certificate_template:{title:'SERTIFIKAT IN HOUSE TRAINING',page:'A4-landscape'}
  }).select('id,event_code,title,topic,organizer,room_id,start_at,end_at,venue,instructor_json,learning_objectives,status').single()
  setWorking(false)
  if(saveError||!data){setError('Kegiatan gagal disimpan: '+(saveError?.message||'respons kosong'));return}
  setShowForm(false);setNotice('Kegiatan IHT berhasil disimpan.');setTitle('');setTopic('')
  await load();void openEvent(data as EventRow)
 }
 const addStaff=async()=>{
  if(!canManage||!active||!selectedStaff||working)return
  const p=staff.find(x=>x.id===selectedStaff);if(!p){setError('Tenaga kerja tidak ditemukan.');return}
  setWorking(true);setError('')
  const matched=rooms.find(x=>x.name.trim().toLowerCase()===(p.source_unit||'').trim().toLowerCase())
  const {error:e}=await education().from('education_participants').upsert({
   event_id:active.id,participant_type:'staff',staff_id:p.id,participant_code:p.id,full_name:p.display_name,
   institution:'UPT RSUD Sultan Syarif Mohamad Alkadrie Kota Pontianak',profession_or_program:p.profession_group||p.position_title||'',
   room_id:matched?.id??active.room_id,status:'registered'
  },{onConflict:'event_id,participant_type,participant_code',ignoreDuplicates:true})
  setWorking(false);if(e){setError('Peserta gagal ditambahkan: '+e.message);return}
  setNotice('Peserta ditambahkan dari Direktori Tenaga Kerja.');setSelectedStaff('');await openEvent(active)
 }
 const markPresent=async(p:Participant)=>{
  if(!canManage||!active||busyId)return
  setBusyId(p.id);setError('')
  const {data:auth,error:authError}=await aurekaSupabase.auth.getUser()
  if(authError||!auth.user){setBusyId('');setError('Sesi autentikasi tidak tersedia.');return}
  const finish=active.end_at?new Date(active.end_at):new Date(active.start_at)
  const minutes=Math.max(0,Math.round((finish.getTime()-new Date(active.start_at).getTime())/60000))
  const {error:e}=await education().from('education_attendance').upsert({event_id:active.id,participant_id:p.id,attendance_status:'hadir',attended_minutes:minutes,checked_by:auth.user.id,session_label:'Kegiatan utama'},{onConflict:'participant_id,session_label'})
  if(e){setBusyId('');setError('Presensi gagal disimpan: '+e.message);return}
  const {error:u}=await education().from('education_participants').update({status:'completed'}).eq('id',p.id)
  setBusyId('');if(u){setError('Presensi tersimpan tetapi status peserta belum berubah: '+u.message);return}
  setNotice('Kehadiran peserta telah dicatat.');await openEvent(active)
 }
 const issueCertificate=async(p:Participant)=>{
  if(!canManage||!active||p.status!=='completed'||busyId)return
  const preview=window.open('about:blank','_blank');if(!preview){setError('Izinkan pop-up browser untuk menerbitkan PDF.');return}
  setBusyId(p.id);setError('')
  try{
   const {data,error:e}=await education().rpc('reserve_in_house_training_certificate',{p_event_id:active.id,p_participant_id:p.id})
   if(e)throw e
   const reservation=(Array.isArray(data)?data[0]:data) as any
   const certId=String(reservation?.id||''),number=String(reservation?.certificate_number||''),code=String(reservation?.verification_code||'')
   if(!certId||!number)throw new Error('Nomor sertifikat tidak dikembalikan server.')
   let path=String(reservation?.object_path||'')
   if(!path){
    const pdf=makePdf(active,p,number,code),hash=await digest(pdf)
    path=userId+'/education/in-house-training/'+filename(number)+'.pdf'
    const {error:uploadError}=await aurekaSupabase.storage.from('aureka-exports').upload(path,pdf,{contentType:'application/pdf',upsert:false})
    if(uploadError){
     const {data:existing,error:downloadError}=await aurekaSupabase.storage.from('aureka-exports').download(path)
     if(downloadError||!existing||await digest(existing)!==hash)throw uploadError
    }
    const {error:completeError}=await education().rpc('complete_in_house_training_certificate',{p_certificate_id:certId,p_object_path:path,p_file_sha256:hash})
    if(completeError)throw completeError
   }
   const {data:signed,error:signedError}=await aurekaSupabase.storage.from('aureka-exports').createSignedUrl(path,600)
   if(signedError||!signed?.signedUrl)throw signedError||new Error('PDF telah tersimpan, tautan sementara gagal dibuat.')
   preview.location.href=signed.signedUrl;setNotice('Sertifikat '+number+' berhasil diterbitkan.');await openEvent(active)
  }catch(err){preview.close();setError('Sertifikat gagal diterbitkan: '+(err instanceof Error?err.message:'Kesalahan tidak diketahui.'))}
  finally{setBusyId('')}
 }
 const download=async(c:Certificate)=>{
  if(!c.object_path){setError('Berkas PDF belum tersimpan.');return}
  const {data,error:e}=await aurekaSupabase.storage.from('aureka-exports').createSignedUrl(c.object_path,600)
  if(e||!data?.signedUrl){setError('Tautan PDF gagal dibuat: '+(e?.message||''));return}
  window.open(data.signedUrl,'_blank','noopener,noreferrer')
 }
 const countUpcoming=useMemo(()=>events.filter(x=>new Date(x.start_at).getTime()>=Date.now()&&x.status!=='cancelled').length,[events])
 const countDone=useMemo(()=>events.filter(x=>x.status==='completed').length,[events])
 const filtered=useMemo(()=>events.filter(x=>(x.title+' '+x.event_code+' '+x.topic).toLowerCase().includes(search.toLowerCase())),[events,search])
 const certFor=(participantId:string)=>certificates.find(x=>x.participant_id===participantId&&!x.revoked_at)||null

 return <section className="ihtWorkspace">
  <WorkspaceModuleHeader eyebrow="Pendidikan dan Pelatihan" title="In House Training" description="Register pelatihan, peserta tenaga kerja, presensi, dan penerbitan sertifikat PDF."/>
  {error&&<div className="ihtNotice error" role="alert">{error}</div>}{notice&&<div className="ihtNotice" role="status">{notice}</div>}
  {view==='overview'&&<>
   <div className="ihtMetrics"><div><span>Total Kegiatan</span><b>{events.length}</b></div><div><span>Kegiatan Selesai</span><b>{countDone}</b></div><div><span>Kegiatan Terjadwal</span><b>{countUpcoming}</b></div></div>
   <div className="ihtCard"><h3>Visual Intelligence · In House Training</h3><p>Ringkasan kegiatan pendidikan internal sesuai cakupan akses. Daftar peserta, presensi, dan sertifikat dibuka dari detail setiap kegiatan.</p><button type="button" disabled={loading} onClick={()=>setView('list')}>Lihat In House Training</button>{canManage&&<button type="button" onClick={()=>setShowForm(true)}>＋ Tambah Kegiatan</button>}</div>
  </>}
  {view==='list'&&<>
   <div className="ihtActions"><button type="button" onClick={()=>setView('overview')}>← Visual Intelligence</button><input aria-label="Cari kegiatan IHT" placeholder="Cari kegiatan…" value={search} onChange={e=>setSearch(e.target.value)}/>{canManage&&<button type="button" onClick={()=>setShowForm(true)}>＋ Tambah Kegiatan</button>}</div>
   {loading?<div className="ihtCard">Memuat register…</div>:filtered.length===0?<div className="ihtCard">Belum ada kegiatan In House Training.</div>:<div className="ihtCard"><div className="ihtTableWrap"><table><thead><tr><th>Kode</th><th>Kegiatan</th><th>Jadwal</th><th>Unit</th><th>Status</th><th></th></tr></thead><tbody>{filtered.map(x=><tr key={x.id}><td>{x.event_code}</td><td><b>{x.title}</b><small>{x.topic}</small></td><td>{dateLabel(x.start_at)}</td><td>{rooms.find(y=>y.id===x.room_id)?.name||'Seluruh RS'}</td><td>{x.status}</td><td><button type="button" onClick={()=>void openEvent(x)}>Lihat Detail</button></td></tr>)}</tbody></table></div></div>}
  </>}
  {view==='detail'&&active&&<>
   <div className="ihtActions"><button type="button" onClick={()=>setView('list')}>← Kembali ke Register</button><button type="button" disabled={working} onClick={()=>void openEvent(active)}>Muat Ulang</button></div>
   <div className="ihtCard"><b>{active.event_code} · {active.status}</b><h3>{active.title}</h3><p>{active.topic} · {dateLabel(active.start_at)} · {active.venue}</p><p>Penyelenggara: {active.organizer} · Narasumber: {(active.instructor_json||[]).join(', ')||'-'}</p></div>
   {canManage&&<div className="ihtCard"><h4>Tambah Peserta Tenaga Kerja</h4><div className="ihtActions"><select value={selectedStaff} onChange={e=>setSelectedStaff(e.target.value)}><option value="">Pilih dari Direktori Tenaga Kerja</option>{staff.map(p=><option key={p.id} value={p.id}>{p.display_name} · {p.profession_group||p.position_title}</option>)}</select><button type="button" disabled={!selectedStaff||working} onClick={()=>void addStaff()}>Tambah Peserta</button></div></div>}
   <div className="ihtCard"><h4>Daftar Peserta · {participants.length}</h4>{working?<p>Memuat peserta…</p>:participants.length===0?<p>Belum ada peserta.</p>:<div className="ihtTableWrap"><table><thead><tr><th>Nama</th><th>Profesi / Unit</th><th>Status</th><th>Sertifikat</th><th>Aksi</th></tr></thead><tbody>{participants.map(p=>{const c=certFor(p.id);return <tr key={p.id}><td>{p.full_name}</td><td>{p.profession_or_program||'-'} · {rooms.find(x=>x.id===p.room_id)?.name||'-'}</td><td>{p.status}</td><td>{c?.certificate_number||'Belum diterbitkan'}</td><td><div className="ihtActions">{canManage&&p.status!=='completed'&&<button type="button" disabled={busyId===p.id} onClick={()=>void markPresent(p)}>Konfirmasi Hadir</button>}{c?.object_path?<button type="button" onClick={()=>void download(c)}>Unduh PDF</button>:canManage&&p.status==='completed'?<button type="button" disabled={busyId===p.id} onClick={()=>void issueCertificate(p)}>Terbitkan Sertifikat PDF</button>:null}</div></td></tr>})}</tbody></table></div>}</div>
  </>}
  {showForm&&<div className="ihtBackdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!working)setShowForm(false)}}><section className="ihtCard ihtDialog" role="dialog" aria-modal="true" aria-labelledby="iht-create-title"><h3 id="iht-create-title">Tambah Kegiatan In House Training</h3>
   <label>Nama kegiatan *<input value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Topik / materi<input value={topic} onChange={e=>setTopic(e.target.value)}/></label><label>Penyelenggara *<input value={organizer} onChange={e=>setOrganizer(e.target.value)}/></label><label>Unit<select value={room} disabled={lockRoomScope} onChange={e=>setRoom(e.target.value)}><option value="">Seluruh Rumah Sakit</option>{rooms.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><label>Mulai *<input type="datetime-local" value={start} onChange={e=>setStart(e.target.value)}/></label><label>Selesai<input type="datetime-local" value={end} onChange={e=>setEnd(e.target.value)}/></label><label>Tempat<input value={venue} onChange={e=>setVenue(e.target.value)}/></label><label>Narasumber (pisahkan dengan koma)<textarea value={instructors} onChange={e=>setInstructors(e.target.value)}/></label>
   <div className="ihtActions"><button type="button" onClick={()=>setShowForm(false)} disabled={working}>Batal</button><button type="button" onClick={()=>void create()} disabled={working}>{working?'Menyimpan…':'Simpan Kegiatan'}</button></div></section></div>}
  <style>{'.ihtWorkspace{display:grid;gap:14px;color:var(--text,inherit)}.ihtMetrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.ihtMetrics>div,.ihtCard{border:1px solid var(--line,rgba(80,100,120,.2));border-radius:14px;background:var(--surface,rgba(255,255,255,.55));padding:14px}.ihtMetrics span{display:block;color:var(--muted);font-size:12px}.ihtMetrics b{font-size:25px}.ihtCard p,.ihtCard small{font-size:12px;color:var(--muted)}.ihtWorkspace button{padding:8px 12px;border-radius:9px;border:1px solid var(--line,rgba(80,100,120,.25));background:var(--surface,white);color:var(--text,inherit);font:inherit;font-size:12px;font-weight:750;cursor:pointer}.ihtActions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.ihtActions input,.ihtActions select,.ihtDialog input,.ihtDialog select,.ihtDialog textarea{min-height:36px;padding:8px 10px;border:1px solid var(--line,rgba(80,100,120,.25));border-radius:8px;background:var(--surface,white);color:var(--text,inherit);font:inherit}.ihtTableWrap{overflow:auto}.ihtTableWrap table{width:100%;border-collapse:collapse;min-width:780px;font-size:12px}.ihtTableWrap th,.ihtTableWrap td{text-align:left;padding:9px;border-bottom:1px solid var(--line,rgba(80,100,120,.15))}.ihtTableWrap small{display:block}.ihtNotice{padding:10px;border-radius:10px;background:rgba(30,115,160,.1);font-size:12px}.ihtNotice.error{background:rgba(180,40,40,.1)}.ihtBackdrop{position:fixed;inset:0;z-index:1100;display:grid;place-items:center;background:rgba(10,20,30,.5);padding:16px}.ihtDialog{width:min(650px,100%);max-height:90vh;overflow:auto}.ihtDialog label{display:grid;gap:5px;margin:9px 0;font-size:12px;font-weight:750}.ihtDialog input,.ihtDialog select,.ihtDialog textarea{width:100%;box-sizing:border-box}.ihtDialog textarea{min-height:60px}'}</style>
 </section>
}
