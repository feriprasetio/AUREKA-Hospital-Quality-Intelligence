'use client'

import {useCallback,useEffect,useMemo,useState} from 'react'
import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'
import {aurekaSupabase} from '@/lib/aureka/supabase'
import {toUserFacingError} from '@/lib/ui/error-feedback'

type Room={id:number;name:string}
type Meeting={id:string;meeting_code:string;title:string;meeting_type:string;meeting_date:string;start_time:string|null;end_time:string|null;room_id:number|null;location:string;organizer:string;agenda:string;status:string}
type Recipient={user_id:string;display_name:string;email:string|null;room_id:number;room_name:string;role_code:string}
type Invite={id:string;meeting_id:string;invited_user_id:string|null;invited_room_id:number|null;invitee_name:string;invitee_email:string|null;invitee_role:string|null;delivery_status:string;invitation_note:string;sent_at:string|null;response_status:'pending'|'accepted'|'declined';response_note:string;responded_at:string|null;created_at:string;meeting?:Meeting|null}
const db=()=>aurekaSupabase.schema('aureka_system')
const managers=['ADMIN','PMKP','MANAGEMENT']
const dateText=(v:string|null|undefined)=>v?new Date(v+'T00:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'}):'—'
const timeText=(v:string|null|undefined)=>v?String(v).slice(0,5):'—'

export default function SecretariatInvitationWorkspace({role,userId,rooms=[],initialRoomId=null,lockRoomScope=false}:{
 role:string|null;userId:string;rooms?:Room[];initialRoomId?:number|null;lockRoomScope?:boolean
}){
 const canManage=managers.includes(role||'')
 const [meetings,setMeetings]=useState<Meeting[]>([])
 const [invites,setInvites]=useState<Invite[]>([])
 const [recipients,setRecipients]=useState<Recipient[]>([])
 const [meetingId,setMeetingId]=useState('')
 const [recipientId,setRecipientId]=useState('')
 const [note,setNote]=useState('')
 const [loading,setLoading]=useState(true)
 const [recipientLoading,setRecipientLoading]=useState(false)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const selectedMeeting=meetings.find(x=>x.id===meetingId)||null
 const selectedRecipient=recipients.find(x=>x.user_id===recipientId)||null

 const load=useCallback(async()=>{
  setLoading(true);setError('')
  if(canManage){
   let q=db().from('pmkp_meetings').select('id,meeting_code,title,meeting_type,meeting_date,start_time,end_time,room_id,location,organizer,agenda,status').order('meeting_date',{ascending:false}).limit(300)
   if(lockRoomScope&&initialRoomId!=null)q=q.eq('room_id',initialRoomId)
   const {data,error:e}=await q
   if(e){setMeetings([]);setError('Daftar kegiatan tidak dapat dimuat: '+toUserFacingError(e,{fallback:'Periksa hak akses Sekretariat.'}))}
   else{
    const list=(data||[]) as Meeting[]
    setMeetings(list)
    if(!meetingId&&list.length)setMeetingId(list[0].id)
    else if(meetingId&&!list.some(x=>x.id===meetingId))setMeetingId(list[0]?.id||'')
   }
  }else if(userId){
   const {data,error:e}=await db().from('pmkp_meeting_invitees')
    .select('id,meeting_id,invited_user_id,invited_room_id,invitee_name,invitee_email,invitee_role,delivery_status,invitation_note,sent_at,response_status,response_note,responded_at,created_at,meeting:pmkp_meetings(id,meeting_code,title,meeting_type,meeting_date,start_time,end_time,room_id,location,organizer,agenda,status)')
    .eq('invited_user_id',userId).order('created_at',{ascending:false}).limit(250)
   if(e){setInvites([]);setError('Kotak masuk undangan belum dapat dimuat: '+toUserFacingError(e,{fallback:'Periksa hak akses dan migrasi Sekretariat.'}))}
   else setInvites((data||[]) as unknown as Invite[])
  }else setError('Identitas pengguna belum tersedia.')
  setLoading(false)
 },[canManage,lockRoomScope,initialRoomId,userId])

 useEffect(()=>{void load()},[load])

 const loadRecipients=useCallback(async()=>{
  if(!canManage||!selectedMeeting){setRecipients([]);setRecipientId('');return}
  setRecipientLoading(true);setError('')
  const {data,error:e}=await aurekaSupabase.rpc('aureka_pmkp_list_pic_recipients',{p_room_id:selectedMeeting.room_id})
  if(e){setRecipients([]);setError('Daftar akun PIC tidak dapat dimuat: '+toUserFacingError(e,{fallback:'Pastikan akun PIC aktif dan sudah menyelesaikan password awal.'}))}
  else{
   const list=(data||[]) as Recipient[]
   setRecipients(list)
   if(recipientId&&!list.some(x=>x.user_id===recipientId))setRecipientId('')
  }
  setRecipientLoading(false)
 },[canManage,selectedMeeting,recipientId])
 useEffect(()=>{void loadRecipients()},[loadRecipients])

 const loadManagerInvites=useCallback(async()=>{
  if(!canManage||!meetingId){setInvites([]);return}
  const {data,error:e}=await db().from('pmkp_meeting_invitees')
   .select('id,meeting_id,invited_user_id,invited_room_id,invitee_name,invitee_email,invitee_role,delivery_status,invitation_note,sent_at,response_status,response_note,responded_at,created_at')
   .eq('meeting_id',meetingId).order('created_at',{ascending:false}).limit(500)
  if(e){setInvites([]);setError('Daftar penerima undangan gagal dimuat: '+toUserFacingError(e,{fallback:'Periksa hak akses register undangan.'}))}
  else setInvites((data||[]) as Invite[])
 },[canManage,meetingId])
 useEffect(()=>{void loadManagerInvites()},[loadManagerInvites])

 const pendingCount=useMemo(()=>invites.filter(x=>x.response_status==='pending'&&x.delivery_status==='sent').length,[invites])
 const send=async()=>{
  if(!canManage||!selectedMeeting||!selectedRecipient||busy)return
  setBusy(true);setError('');setNotice('')
  const {data,error:e}=await aurekaSupabase.rpc('aureka_pmkp_send_meeting_invitation',{
   p_meeting_id:meetingId,p_invited_user_id:recipientId,p_note:note.trim()
  })
  setBusy(false)
  if(e){setError('Undangan tidak dapat dikirim: '+toUserFacingError(e,{fallback:'Periksa kegiatan, status akun PIC, dan kesesuaian unit.'}));return}
  setNotice('Undangan berhasil dikirim ke kotak masuk AUREKA '+selectedRecipient.display_name+' ('+selectedRecipient.room_name+'). Pengiriman email eksternal tidak dilakukan.')
  setNote('')
  await loadManagerInvites()
 }
 const respond=async(invite:Invite,response:'accepted'|'declined')=>{
  if(canManage||busy)return
  setBusy(true);setError('');setNotice('')
  const {data,error:e}=await aurekaSupabase.rpc('aureka_pmkp_respond_meeting_invitation',{
   p_invitee_id:invite.id,p_response:response,p_note:''
  })
  setBusy(false)
  if(e){setError('Respons undangan gagal disimpan: '+toUserFacingError(e,{fallback:'Periksa status undangan dan akun pengguna.'}));return}
  setNotice(response==='accepted'?'Kehadiran telah dikonfirmasi.':'Undangan ditandai tidak dapat dihadiri.')
  await load()
 }
 const roomName=(id:number|null)=>id==null?'Seluruh Rumah Sakit':rooms.find(x=>Number(x.id)===Number(id))?.name||'Unit'

 return <section className="siw">
  <style>{'.siw{display:grid;gap:14px;color:var(--text,inherit)}.siwPanel{padding:16px;border:1px solid var(--line,rgba(60,80,100,.16));border-radius:16px;background:var(--surface,rgba(255,255,255,.65))}.siwToolbar{display:flex;gap:9px;align-items:end;flex-wrap:wrap}.siwField{display:grid;gap:5px;min-width:0;font-size:12px;font-weight:800}.siwField input,.siwField select,.siwField textarea{min-height:39px;padding:9px 10px;border:1px solid var(--line,rgba(60,80,100,.2));border-radius:9px;background:var(--surface,white);color:var(--text,inherit);font:inherit}.siwField textarea{min-height:65px}.siw button{padding:9px 12px;border:1px solid var(--line,rgba(70,90,100,.2));border-radius:9px;background:var(--surface,white);color:var(--text,inherit);font:inherit;font-size:12px;font-weight:800;cursor:pointer}.siw button.primary{background:var(--accent,#1e6b50);color:white;border-color:transparent}.siw button:disabled{opacity:.5;cursor:not-allowed}.siwNotice{padding:11px 13px;border-radius:10px;background:rgba(25,120,85,.08);font-size:12px;line-height:1.55}.siwNotice.error{background:rgba(190,45,45,.09)}.siwGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.siwKpi{padding:13px;border:1px solid var(--line);border-radius:12px}.siwKpi span{display:block;color:var(--muted);font-size:12px}.siwKpi b{display:block;font-size:24px;margin-top:4px}.siwList{display:grid;gap:10px}.siwCard{padding:14px;border:1px solid var(--line,rgba(60,80,100,.14));border-radius:13px;background:var(--surface,rgba(255,255,255,.45));display:grid;gap:9px}.siwCardHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.siwCard h3{margin:0;font-size:14px}.siwMeta{display:flex;gap:8px 14px;flex-wrap:wrap;color:var(--muted);font-size:12px}.siwTag{display:inline-flex;padding:5px 8px;border-radius:30px;background:rgba(100,120,130,.1);font-size:11px;font-weight:800}.siwTag.accepted{background:rgba(25,135,85,.12);color:#176b43}.siwTag.declined{background:rgba(180,50,40,.1);color:#9a352f}.siwTag.pending{background:rgba(180,130,30,.12);color:#86600e}.siwActions{display:flex;gap:8px;flex-wrap:wrap}.siwEmpty{padding:22px;text-align:center;color:var(--muted);font-size:12px}.siwHint{color:var(--muted);font-size:12px;line-height:1.55}.siwTwo{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}@media(max-width:640px){.siwTwo{grid-template-columns:1fr}}'} </style>
  <WorkspaceModuleHeader eyebrow="Governance · Administrasi Kegiatan" title={canManage?'Kirim Undangan PIC':'Kotak Masuk Undangan'} description={canManage?'Pilih kegiatan dan akun PIC unit yang terdaftar. Undangan muncul langsung di akun AUREKA penerima.':'Tinjau undangan kegiatan Komite PMKP dan konfirmasikan kehadiran melalui akun AUREKA.'}/>
  {error&&<div className="siwNotice error" role="alert">{error}</div>}{notice&&<div className="siwNotice" role="status">{notice}</div>}
  {loading?<div className="siwPanel">Memuat undangan…</div>:canManage?<>
   <div className="siwGrid"><div className="siwKpi"><span>Kegiatan tersedia</span><b>{meetings.length}</b></div><div className="siwKpi"><span>Penerima pada kegiatan terpilih</span><b>{invites.length}</b></div><div className="siwKpi"><span>Menunggu respons</span><b>{pendingCount}</b></div></div>
   <section className="siwPanel">
    <h3 style={{marginTop:0}}>Distribusi Undangan PIC</h3>
    <p className="siwHint">Pemilihan penerima diambil dari akun PIC aktif yang terhubung ke unit. Undangan dicatat pada Meeting ID yang sama dan disampaikan melalui kotak masuk internal AUREKA; tidak ada email yang dikirim dari fitur ini.</p>
    <div className="siwTwo">
     <label className="siwField">Kegiatan / Meeting ID<select value={meetingId} onChange={e=>setMeetingId(e.target.value)}><option value="">Pilih kegiatan…</option>{meetings.map(x=><option key={x.id} value={x.id}>{x.meeting_code} · {x.title} · {dateText(x.meeting_date)}</option>)}</select></label>
     <label className="siwField">Akun PIC penerima<select value={recipientId} onChange={e=>setRecipientId(e.target.value)} disabled={!selectedMeeting||recipientLoading}><option value="">{recipientLoading?'Memuat akun PIC…':'Pilih PIC unit…'}</option>{recipients.map(x=><option key={x.user_id} value={x.user_id}>{x.display_name} · {x.room_name}{x.email?' · '+x.email:''}</option>)}</select></label>
    </div>
    {selectedMeeting&&<div className="siwCard" style={{marginTop:12}}><div className="siwCardHead"><h3>{selectedMeeting.title}</h3><span className="siwTag">{selectedMeeting.meeting_code}</span></div><div className="siwMeta"><span>{dateText(selectedMeeting.meeting_date)}</span><span>{timeText(selectedMeeting.start_time)}–{timeText(selectedMeeting.end_time)}</span><span>{roomName(selectedMeeting.room_id)}</span><span>{selectedMeeting.location||'Lokasi belum ditetapkan'}</span></div><p className="siwHint">{selectedMeeting.agenda||'Agenda belum dicantumkan.'}</p></div>}
    <label className="siwField" style={{marginTop:10}}>Catatan undangan (opsional)<textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="Instruksi persiapan atau dokumen yang perlu dibawa…"/></label>
    <div className="siwActions" style={{marginTop:10}}><button type="button" className="primary" disabled={!selectedMeeting||!selectedRecipient||busy} onClick={()=>void send()}>{busy?'Mengirim…':'Kirim ke Kotak Masuk PIC'}</button><button type="button" disabled={busy} onClick={()=>void load()}>Muat Ulang</button></div>
   </section>
   <section className="siwPanel"><div className="siwCardHead"><h3>Daftar Penerima · {selectedMeeting?.meeting_code||'Pilih kegiatan'}</h3><span className="siwTag">{invites.length} penerima</span></div>
    {!meetingId?<div className="siwEmpty">Pilih kegiatan untuk melihat penerima.</div>:invites.length===0?<div className="siwEmpty">Belum ada PIC yang diundang pada kegiatan ini.</div>:<div className="siwList">{invites.map(x=><article className="siwCard" key={x.id}><div className="siwCardHead"><div><h3>{x.invitee_name}</h3><div className="siwMeta"><span>{x.invitee_role||'PIC'}</span><span>{roomName(x.invited_room_id)}</span><span>{x.invitee_email||'Email tidak tercatat'}</span></div></div><span className={'siwTag '+x.response_status}>{x.response_status==='accepted'?'Hadir':x.response_status==='declined'?'Tidak dapat hadir':'Menunggu respons'}</span></div><div className="siwMeta"><span>Status pengiriman: {x.delivery_status}</span><span>Dikirim: {x.sent_at?new Date(x.sent_at).toLocaleString('id-ID'):'—'}</span><span>Respons: {x.responded_at?new Date(x.responded_at).toLocaleString('id-ID'):'—'}</span></div>{x.response_note&&<p className="siwHint">Catatan PIC: {x.response_note}</p>}</article>)}</div>}
   </section>
  </>:<>
   <div className="siwGrid"><div className="siwKpi"><span>Total undangan</span><b>{invites.length}</b></div><div className="siwKpi"><span>Menunggu respons</span><b>{pendingCount}</b></div><div className="siwKpi"><span>Dikonfirmasi hadir</span><b>{invites.filter(x=>x.response_status==='accepted').length}</b></div></div>
   <section className="siwPanel"><h3 style={{marginTop:0}}>Kotak Masuk Undangan</h3>{invites.length===0?<div className="siwEmpty">Belum ada undangan kegiatan yang ditujukan ke akun ini.</div>:<div className="siwList">{invites.map(x=>{const meeting=x.meeting||null;return <article className="siwCard" key={x.id}><div className="siwCardHead"><div><h3>{meeting?.title||'Undangan Kegiatan Komite PMKP'}</h3><div className="siwMeta"><span>{meeting?.meeting_code||'Meeting ID tidak tersedia'}</span><span>{meeting?.meeting_type||'Kegiatan'}</span><span>{roomName(x.invited_room_id)}</span></div></div><span className={'siwTag '+x.response_status}>{x.response_status==='accepted'?'Dikonfirmasi':x.response_status==='declined'?'Tidak dapat hadir':'Menunggu respons'}</span></div><div className="siwMeta"><span>Tanggal: {dateText(meeting?.meeting_date)}</span><span>Waktu: {timeText(meeting?.start_time)}–{timeText(meeting?.end_time)}</span><span>Lokasi: {meeting?.location||'Belum ditetapkan'}</span><span>Pengundang: {meeting?.organizer||'Sekretariat'}</span></div><div className="siwHint">Agenda: {meeting?.agenda||'Belum dicantumkan.'}{x.invitation_note?' Catatan: '+x.invitation_note:''}</div>{x.response_status==='pending'&&x.delivery_status==='sent'&&<div className="siwActions"><button type="button" className="primary" disabled={busy} onClick={()=>void respond(x,'accepted')}>Konfirmasi Hadir</button><button type="button" disabled={busy} onClick={()=>void respond(x,'declined')}>Tidak Dapat Hadir</button></div>}</article>})}</div>}</section>
  </>}
 </section>
}
