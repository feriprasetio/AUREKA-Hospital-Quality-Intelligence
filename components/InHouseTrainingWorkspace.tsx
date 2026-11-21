'use client'
import { useCallback,useEffect,useMemo,useState } from 'react'
import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'
import CertificateTemplateEditor from '@/components/CertificateTemplateEditor'
import { loadCertificateLayout, pdfPoint, type CertificateLayout, type CertificateElementId } from '@/lib/aureka/certificate-template'
import { aurekaSupabase } from '@/lib/aureka/supabase'

type Room={id:number;name:string}
type EventRow={id:string;event_code:string;title:string;topic:string;organizer:string;room_id:number|null;start_at:string;end_at:string|null;venue:string;instructor_json:string[];learning_objectives:string[];status:string}
type Staff={id:string;employee_code:string;display_name:string;profession_group:string;position_title:string;source_unit:string}
type Participant={id:string;event_id:string;participant_type:string;staff_id:string|null;full_name:string;participant_code:string;profession_or_program:string;room_id:number|null;status:string}
type Certificate={id:string;event_id:string;participant_id:string;certificate_number:string;verification_code:string;issue_date:string;object_path:string|null;revoked_at:string|null;render_snapshot?:{kind:string;layout:CertificateLayout;data:{event:EventRow;participant:Participant}}|null}
const education=()=>aurekaSupabase.schema('aureka_system')
const managers=['ADMIN','PMKP','MANAGEMENT','KABID']
const dateLabel=(v:string)=>new Date(v).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Pontianak'})
const clean=(v:string)=>v.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,' ')
const esc=(v:string)=>clean(v).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)')
const filename=(v:string)=>clean(v).replace(/[^A-Za-z0-9._-]+/g,'-')
async function digest(blob:Blob){const hash=await crypto.subtle.digest('SHA-256',await blob.arrayBuffer());return Array.from(new Uint8Array(hash)).map(v=>v.toString(16).padStart(2,'0')).join('')}
function makePdf(event:EventRow,p:Participant,num:string,code:string,layout:CertificateLayout){
 const point=(id:CertificateElementId,fallback:{x:number;y:number})=>pdfPoint(layout,id,fallback)
 const text=(id:CertificateElementId,value:string,size:number,color:string,fallback:{x:number;y:number},font='F1',align:'left'|'center'='center',offsetY=0)=>{
  const safe=esc(value),pos=point(id,fallback),width=clean(value).length*size*0.25
  const x=align==='center'?pos.x-width:pos.x
  return 'BT /'+font+' '+size+' Tf '+color+' rg '+x.toFixed(1)+' '+(pos.y+offsetY)+' Td ('+safe+') Tj ET'
 }
 const logo=(id:'logo_pemkot'|'logo_rsud',label:string,fallback:{x:number;y:number})=>{
  const pos=point(id,fallback)
  return [
   '0.08 0.22 0.36 RG 1.4 w '+(pos.x-22)+' '+(pos.y-18)+' 44 36 re S',
   text(id,label,7,'0.08 0.22 0.36',fallback)
  ]
 }
 const signature=(id:'signature_left'|'signature_right',label:string,fallback:{x:number;y:number})=>{
  const pos=point(id,fallback)
  return [
   '0.18 0.29 0.40 RG 0.7 w '+(pos.x-76)+' '+(pos.y+18)+' m '+(pos.x+76)+' '+(pos.y+18)+' l S',
   text(id,label,10,'0 0 0',fallback)
  ]
 }
 const rows=[
  '0.08 0.22 0.36 RG 2.2 w 24 24 794 547 re S',
  '0.39 0.68 0.82 RG 0.8 w 34 34 774 527 re S',
  ...logo('logo_pemkot','PEMKOT',{x:10,y:13}),
  ...logo('logo_rsud','RSUD',{x:90,y:13}),
  text('institution','DINAS KESEHATAN KOTA PONTIANAK',12,'0.08 0.22 0.36',{x:50,y:12},'F1','center',8),
  text('institution','UPT RSUD SULTAN SYARIF MOHAMAD ALKADRIE KOTA PONTIANAK',10,'0.08 0.22 0.36',{x:50,y:12},'F1','center',-9),
  text('title','SERTIFIKAT',30,'0.08 0.22 0.36',{x:50,y:25},'F2'),
  text('subtitle','IN HOUSE TRAINING',13,'0.08 0.22 0.36',{x:50,y:31}),
  text('recipient_label','Diberikan kepada',12,'0 0 0',{x:50,y:38}),
  text('recipient_name',p.full_name,24,'0.08 0.22 0.36',{x:50,y:45}),
  text('role','Sebagai Peserta',12,'0 0 0',{x:50,y:52}),
  text('activity','Atas partisipasi dalam kegiatan '+event.title,12,'0 0 0',{x:50,y:59}),
  text('details','Topik: '+(event.topic||'-')+'  |  Penyelenggara: '+event.organizer,10,'0 0 0',{x:50,y:65}),
  text('details',event.venue||'UPT RSUD Sultan Syarif Mohamad Alkadrie Kota Pontianak',9,'0 0 0',{x:50,y:65},'F1','center',-14),
  text('issue_date','Pontianak, '+dateLabel(new Date().toISOString()).split(' pukul ')[0],10,'0 0 0',{x:77,y:79}),
  ...signature('signature_left','Direktur',{x:24,y:86}),
  ...signature('signature_right','Pejabat yang berwenang',{x:76,y:86}),
  text('verification','Nomor: '+num+'  |  Kode verifikasi: '+code,8,'0.18 0.29 0.40',{x:91,y:91}),
  text('footer','AUREKA DOCUMENT INTELLIGENCE',8,'0.08 0.22 0.36',{x:50,y:96})
 ]
 const stream=rows.join('\n')
 const objects=[
  '<< /Type /Catalog /Pages 2 0 R >>',
  '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
  '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 595] /Resources << /Font << /F1 4 0 R /F2 6 0 R >> >> /Contents 5 0 R >>',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  '<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream',
  '<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>'
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
 const [showTemplateEditor,setShowTemplateEditor]=useState(false)

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
   education().from('education_certificates').select('id,event_id,participant_id,certificate_number,verification_code,issue_date,object_path,revoked_at,render_snapshot').eq('event_id',event.id).is('revoked_at',null)
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
  const preview=window.open('about:blank','_blank')
  if(!preview){setError('Izinkan jendela browser untuk menampilkan sertifikat.');return}
  setBusyId(p.id);setError('')
  try{
   const layout=await loadCertificateLayout('in_house_training')
   const {data,error:e}=await education().rpc('reserve_in_house_training_certificate',{p_event_id:active.id,p_participant_id:p.id})
   if(e)throw e
   const reservation=(Array.isArray(data)?data[0]:data) as any
   const number=String(reservation?.certificate_number||''),code=String(reservation?.verification_code||'')
   if(!number)throw new Error('Nomor sertifikat tidak dikembalikan server.')
   const proposedSnapshot={kind:'in_house_training',event_id:active.id,participant_id:p.id,
    layout,data:{event:active,participant:p}}
   const {data:frozen,error:freezeError}=await education().rpc('freeze_browser_certificate_snapshot',{
    p_certificate_id:String(reservation.id),p_snapshot:proposedSnapshot
   })
   if(freezeError)throw freezeError
   const snapshot=(frozen?.snapshot||proposedSnapshot) as typeof proposedSnapshot
   const pdf=makePdf(snapshot.data.event,snapshot.data.participant,number,code,snapshot.layout)
   const url=URL.createObjectURL(pdf)
   preview.location.href=url
   window.setTimeout(()=>URL.revokeObjectURL(url),60_000)
   await openEvent(active)
   setNotice('Sertifikat '+number+' diterbitkan sebagai data nomor/verifikasi; PDF dibuat sementara di browser tanpa Storage.')
  }catch(err){preview.close();setError('Sertifikat gagal diterbitkan: '+(err instanceof Error?err.message:'Kesalahan tidak diketahui.'))}
  finally{setBusyId('')}
 }
 const download=async(c:Certificate)=>{
  if(!active){setError('Pilih kegiatan sebelum membuka sertifikat.');return}
  const participant=participants.find(p=>p.id===c.participant_id)
  if(!participant){setError('Peserta sertifikat tidak dapat ditemukan.');return}
  const preview=window.open('about:blank','_blank')
  if(!preview){setError('Izinkan jendela browser untuk membuka PDF.');return}
  try{
   const layout=await loadCertificateLayout('in_house_training')
   const frozen=c.render_snapshot
   const pdf=makePdf(frozen?.data?.event||active,frozen?.data?.participant||participant,c.certificate_number,c.verification_code,frozen?.layout||layout)
   const url=URL.createObjectURL(pdf)
   preview.location.href=url
   window.setTimeout(()=>URL.revokeObjectURL(url),60_000)
  }catch(err){preview.close();setError(err instanceof Error?err.message:'PDF gagal dibangun.')}
 }
 const countUpcoming=useMemo(()=>events.filter(x=>new Date(x.start_at).getTime()>=Date.now()&&x.status!=='cancelled').length,[events])
 const countDone=useMemo(()=>events.filter(x=>x.status==='completed').length,[events])
 const filtered=useMemo(()=>events.filter(x=>(x.title+' '+x.event_code+' '+x.topic).toLowerCase().includes(search.toLowerCase())),[events,search])
 const certFor=(participantId:string)=>certificates.find(x=>x.participant_id===participantId&&!x.revoked_at)||null

 return <section className="ihtWorkspace">
  <WorkspaceModuleHeader title="In House Training"/>
  {canManage&&<div className="ihtActions"><button type="button" onClick={()=>setShowTemplateEditor(true)}>Atur template sertifikat</button></div>}
  {showTemplateEditor&&<CertificateTemplateEditor templateKey="in_house_training" role={role} onClose={()=>setShowTemplateEditor(false)}/>} 
  {error&&<div className="ihtNotice error" role="alert">{error}</div>}{notice&&<div className="ihtNotice" role="status">{notice}</div>}
  {view==='overview'&&<>
   <div className="ihtMetrics"><div><span>Total Kegiatan</span><b>{events.length}</b></div><div><span>Kegiatan Selesai</span><b>{countDone}</b></div><div><span>Kegiatan Terjadwal</span><b>{countUpcoming}</b></div></div>
   <div className="ihtCard"><h3>Ringkasan pelatihan</h3><button type="button" disabled={loading} onClick={()=>setView('list')}>Lihat In House Training</button>{canManage&&<button type="button" onClick={()=>setShowForm(true)}>＋ Tambah Kegiatan</button>}</div>
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
