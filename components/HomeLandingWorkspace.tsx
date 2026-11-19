'use client'

import { useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NavigateFn } from '@/lib/aureka/focus'
import HomeKpis from '@/components/HomeKpis'

type Room = { id: number; name: string }
type Props = {
  supabase: SupabaseClient
  userName: string
  userId: string
  rooms: Room[]
  isAdmin: boolean
  roomId: number | null
  roomName: string | null
  manager: boolean
  scopeToRoom?: boolean
  onNavigate: NavigateFn
  onReminderRead?: () => void
  onAskNara?: (prompt: string, pageContext: string) => void
}

export default function HomeLandingWorkspace({
  supabase,userName,userId,rooms,isAdmin,roomId,roomName,manager,scopeToRoom=false,onNavigate,onReminderRead,onAskNara
}:Props) {
  // Pengingat aktif hanya ditampilkan sampai pengguna menandainya sudah dibaca.
  // Status baca disimpan per akun di database; pesan asli pada Chat Komite PMKP tetap utuh.
  const [reminders,setReminders] = useState<{id:string;at:string;body:string;sent?:number}[]>([])
  // Admin: pengingat yang sudah dikirim bisa disembunyikan dari Beranda (disimpan per akun di perangkat ini).
  const hiddenKey='aureka-reminder-hidden:'+userId
  const [hiddenReminder,setHiddenReminder]=useState<string|null>(null)
  useEffect(()=>{try{setHiddenReminder(localStorage.getItem(hiddenKey))}catch{setHiddenReminder(null)}},[hiddenKey])
  const hideReminder=(id:string)=>{setHiddenReminder(id);try{localStorage.setItem(hiddenKey,id)}catch{/* abaikan */}}
  const [reminderSaving,setReminderSaving] = useState<string|null>(null)
  useEffect(()=>{
    if(!userId){setReminders([]);return}
    let cancelled=false
    if(manager||roomId==null){
      // Pengelola / cakupan semua ruangan: tampilkan pengingat terakhir yang dikirim Komite PMKP (digabung per isi pesan).
      ;(async()=>{
        const sys=supabase.schema('aureka_system')
        const {data:convs,error}=await sys.from('support_conversations')
          .select('id,created_at')
          .eq('subject','Pengingat Komite PMKP')
          .gt('created_at',new Date(Date.now()-30*86400000).toISOString())
          .order('created_at',{ascending:false})
          .limit(200)
        if(error||cancelled||!convs?.length){if(!cancelled)setReminders([]);return}
        const ids=(convs as any[]).map(c=>String(c.id))
        const {data:msgs}=await sys.from('support_messages').select('conversation_id,body,created_at').in('conversation_id',ids).order('created_at',{ascending:true})
        if(cancelled)return
        const first=new Map<string,string>()
        for(const m of (msgs??[]) as any[]){const k=String(m.conversation_id);if(!first.has(k))first.set(k,String(m.body||''))}
        const latest=(convs as any[])[0]
        const body=first.get(String(latest.id))||''
        const sent=(convs as any[]).filter(c=>(first.get(String(c.id))||'')===body).length
        setReminders([{id:String(latest.id),at:String(latest.created_at),body,sent}])
      })().catch(()=>{if(!cancelled)setReminders([])})
      return()=>{cancelled=true}
    }
    ;(async()=>{
      const sys=supabase.schema('aureka_system')
      const {data:convs,error}=await sys.from('support_conversations')
        .select('id,created_at')
        .eq('subject','Pengingat Komite PMKP')
        .eq('room_id',roomId)
        .gt('created_at',new Date(Date.now()-30*86400000).toISOString())
        .order('created_at',{ascending:false})
        .limit(20)
      if(error)throw error
      if(cancelled||!convs?.length){if(!cancelled)setReminders([]);return}
      const conversationIds=(convs as any[]).map(c=>String(c.id))
      const {data:reads,error:readError}=await sys.from('support_reminder_reads')
        .select('conversation_id')
        .eq('user_id',userId)
        .in('conversation_id',conversationIds)
      if(readError)throw readError
      if(cancelled)return
      const readIds=new Set((reads??[]).map((row:any)=>String(row.conversation_id)))
      const unreadConversations=(convs as any[]).filter(c=>!readIds.has(String(c.id))).slice(0,5)
      if(!unreadConversations.length){setReminders([]);return}
      const unreadIds=unreadConversations.map(c=>String(c.id))
      const {data:msgs,error:messageError}=await sys.from('support_messages')
        .select('conversation_id,body,created_at')
        .in('conversation_id',unreadIds)
        .order('created_at',{ascending:true})
      if(messageError)throw messageError
      if(cancelled)return
      setReminders(unreadConversations.map(c=>({
        id:String(c.id),
        at:String(c.created_at),
        body:String((msgs??[]).find((m:any)=>m.conversation_id===c.id)?.body||'')
      })))
    })().catch(()=>{
      if(!cancelled)setReminders([])
    })
    return()=>{cancelled=true}
  },[supabase,roomId,manager,userId])

  const markReminderRead=async(reminderId:string)=>{
    if(!userId||reminderSaving===reminderId)return
    setReminderSaving(reminderId)
    try{
      const {error}=await supabase.schema('aureka_system').from('support_reminder_reads')
        .insert({conversation_id:reminderId,user_id:userId})
      // Duplicate requests are idempotent: the original read timestamp remains unchanged.
      if(error&&error.code!=='23505')throw error
      setReminders(current=>current.filter(item=>item.id!==reminderId))
      onReminderRead?.()
    }catch{
      window.dispatchEvent(new CustomEvent('aureka:notification',{detail:{
        message:'Pengingat belum dapat ditandai sudah dibaca. Periksa koneksi dan coba kembali.',
        kind:'error',
        module:'Pengingat Komite PMKP'
      }}))
    }finally{
      setReminderSaving(current=>current===reminderId?null:current)
    }
  }

  const [refreshKey,setRefreshKey]=useState(0)\n   const [refreshing,setRefreshing]=useState(false)\n   useEffect(()=>{if(refreshKey===0)return;setRefreshing(true);const done=window.setTimeout(()=>setRefreshing(false),700);return()=>window.clearTimeout(done)},[refreshKey])\n   const [activity,setActivity] = useState<{lastAt:string|null;pending:{label:string;count:number;module:string}[];partial:boolean}>({lastAt:null,pending:[],partial:false})
  useEffect(() => {
    let cancelled=false
    if(!userId){setActivity({lastAt:null,pending:[],partial:true});return}
    if(scopeToRoom&&roomId==null){setActivity({lastAt:null,pending:[],partial:false});return}
    const q=(schema:string,table:string)=>supabase.schema(schema).from(table)
    const scoped=(query:any,column:string,value:unknown)=>scopeToRoom&&value!=null?query.eq(column,value):query
    ;(async()=>{
      const jobs=await Promise.all([
        scoped(q('aureka_quality','quality_records').select('updated_at').eq('entered_by',userId),'room_id',roomId).order('updated_at',{ascending:false}).limit(1),
        scoped(q('aureka_quality','quality_records').select('id',{count:'exact',head:true}).eq('entered_by',userId).in('status',['draft','reopened']),'room_id',roomId),
        scoped(q('aureka_quality','clinical_pathway_audits').select('updated_at').or('created_by.eq.'+userId+',updated_by.eq.'+userId),'room_id',roomId).order('updated_at',{ascending:false}).limit(1),
        scoped(q('aureka_quality','clinical_pathway_audits').select('id',{count:'exact',head:true}).eq('created_by',userId).in('status',['draft','reopened']),'room_id',roomId),
        scoped(q('aureka_quality','clinical_death_audits').select('updated_at').or('created_by.eq.'+userId+',updated_by.eq.'+userId),'room_id',roomId).order('updated_at',{ascending:false}).limit(1),
        scoped(q('aureka_quality','clinical_death_audits').select('id',{count:'exact',head:true}).eq('created_by',userId).in('status',['draft','reopened']),'room_id',roomId),
        scoped(q('aureka_patient_safety','incidents').select('updated_at').eq('created_by',userId),'unit_name',roomName).order('updated_at',{ascending:false}).limit(1),
        scoped(q('aureka_patient_safety','incidents').select('id',{count:'exact',head:true}).eq('created_by',userId).in('status',['draft','submitted','under_review','investigation']),'unit_name',roomName),
        scoped(q('aureka_risk','risk_register').select('updated_at').or('created_by.eq.'+userId+',updated_by.eq.'+userId),'unit_id',roomId).order('updated_at',{ascending:false}).limit(1),
        scoped(q('aureka_risk','risk_register').select('id',{count:'exact',head:true}).eq('created_by',userId).neq('status','Controlled').neq('status','Accepted'),'unit_id',roomId),
        scoped(q('aureka_risk','mitigation_plans').select('updated_at').eq('created_by',userId),'owner_room_id',roomId).order('updated_at',{ascending:false}).limit(1),
        scoped(q('aureka_risk','mitigation_plans').select('id',{count:'exact',head:true}).eq('created_by',userId).in('status',['pending_kabid','pending_director','pending_board','in_progress']),'owner_room_id',roomId),
      ])
      if(cancelled)return
      const [qualityLast,quality,cpLast,cp,deathLast,death,incidentLast,incidents,riskLast,risks,planLast,plans]=jobs
      const dates=[qualityLast,cpLast,deathLast,incidentLast,riskLast,planLast].flatMap(result=>(result.data??[]).map((row:any)=>String(row.updated_at??''))).filter(Boolean).sort()
      const lastAt=dates.at(-1)||null
      const pending=[
        {label:'Catatan indikator mutu yang belum selesai',count:quality.count??0,module:'Indikator Mutu'},
        {label:'Audit Clinical Pathway yang masih draf/perbaikan',count:cp.count??0,module:'Peningkatan Kinerja Klinis'},
        {label:'Telaah klinis/kematian yang masih draf/perbaikan',count:death.count??0,module:'Peningkatan Kinerja Klinis'},
        {label:'Laporan insiden yang masih dalam proses',count:incidents.count??0,module:'Keselamatan Pasien'},
        {label:'Risiko yang masih memerlukan pengendalian',count:risks.count??0,module:'Manajemen Risiko'},
        {label:'Rencana mitigasi yang masih berjalan/menunggu persetujuan',count:plans.count??0,module:'Manajemen Risiko'},
      ].filter(item=>item.count>0)
      setActivity({lastAt,pending,partial:jobs.some(result=>Boolean(result.error))})
    })().catch(()=>{if(!cancelled)setActivity({lastAt:null,pending:[],partial:true})})
    return()=>{cancelled=true}
  },[supabase,userId,scopeToRoom,roomId,roomName,refreshKey])

  const firstName = userName.trim().split(/\s+/)[0] || 'Pengguna'
  const greeting = (() => {
    const h = Number(new Intl.DateTimeFormat('en-US',{hour:'2-digit',hour12:false,timeZone:'Asia/Pontianak'}).format(new Date()))
    return h<4?'Selamat malam':h<11?'Selamat pagi':h<15?'Selamat siang':h<18?'Selamat sore':'Selamat malam'
  })()
  const dateLabel = new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric',timeZone:'Asia/Pontianak'}).format(new Date())

  return <section className="ccWorkspace" aria-label="AUREKA Command Center">
    <style>{`
      .ccWorkspace{display:grid;gap:16px;min-width:0;color:#20384d}
      .ccTop{display:flex;align-items:flex-start;justify-content:space-between;gap:18px;padding:21px 23px;border:1px solid rgba(255,255,255,.82);border-radius:18px;background:linear-gradient(125deg,rgba(255,255,255,.84),rgba(239,246,251,.76));box-shadow:0 8px 26px rgba(34,67,93,.055);backdrop-filter:blur(16px)}
      .ccEyebrow{display:block;margin-bottom:7px;color:#71899d;font-size:11px;font-weight:800;letter-spacing:.11em;text-transform:uppercase}
      .ccTitle{margin:0;color:#183b58;font-size:clamp(23px,3vw,31px);font-weight:850;letter-spacing:-.045em;line-height:1.15}
      .ccSub{margin:7px 0 0;color:#61798d;font-size:12px;line-height:1.55}
      .ccScope{display:inline-flex;align-items:center;gap:7px;margin-top:12px;padding:6px 10px;border:1px solid #dce7ef;border-radius:999px;background:rgba(255,255,255,.64);color:#476780;font-size:11px;font-weight:750}
      .ccScopeDot{width:7px;height:7px;border-radius:50%;background:#789bb7}
      .ccTopActions{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
      .ccAction{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:38px;padding:9px 12px;border:1px solid #d5e1eb;border-radius:10px;background:rgba(255,255,255,.74);color:#31536f;font-size:11px;font-weight:750;cursor:pointer;transition:background .15s,border-color .15s,transform .15s}
      .ccAction:hover{background:#fff;border-color:#aebfd0;transform:translateY(-1px)}
      .ccAction.primary{background:#285a80;border-color:#285a80;color:#fff}
      .ccAction.primary:hover{background:#204b6d}
      .ccAction:disabled{opacity:.55;cursor:wait;transform:none}
      .ccSection{min-width:0;padding:17px 18px;border:1px solid #e1e9f0;border-radius:15px;background:rgba(255,255,255,.84);box-shadow:0 4px 18px rgba(34,67,93,.035)}
      .ccSectionHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:13px}
      .ccSectionHead h2{margin:0;color:#24455f;font-size:14px;font-weight:800}
      .ccSectionHead p{margin:4px 0 0;color:#7a8fa1;font-size:11px;line-height:1.45}
      .ccMeta{color:#7a8fa1;font-size:11px;text-align:right}
      .ccKpiGrid{display:grid;gap:12px}
      .ccKpiGrid .hlKpiRow{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
      .ccKpiGrid .hlKpiCard{min-width:0;padding:13px 14px;border:1px solid #e2eaf1;border-radius:12px;background:#f8fafc}
      .ccKpiGrid .hlKpiCard>span{display:block;color:#6b8296;font-size:11px;line-height:1.4}
      .ccKpiGrid .hlKpiCard>strong{display:block;margin:7px 0 3px;color:#1e405c;font-size:25px;line-height:1.1;font-weight:850}
      .ccKpiGrid .hlKpiCard>small{color:#7b8fa1;font-size:10px}
      .ccKpiGrid .hlKpiDanger{border-color:#ead8d7;background:#fcf8f8}
      .ccKpiGrid .hlKpiDanger>strong{color:#a34b48}
      .ccKpiGrid .hlDataTrust{margin-top:1px}
      .ccKpiGrid .hlDataTrustState.complete{color:#426b87}
      .ccKpiGrid .hlDeadlines{display:grid;gap:8px;margin-top:4px}
      .ccKpiGrid .hlDeadline{display:grid;grid-template-columns:24px minmax(0,1fr) auto;align-items:center;gap:9px;padding:10px 11px;border:1px solid #eadfc9;border-radius:10px;background:#fffaf2}
      .ccKpiGrid .hlDeadline.danger{border-color:#ead6d5;background:#fff8f7}
      .ccKpiGrid .hlDeadline p{margin:0;color:#66564c;font-size:11px;line-height:1.45}
      .ccKpiGrid .hlDeadline button{padding:7px 10px;border:1px solid #d6e1e9;border-radius:8px;background:#fff;color:#315a79;font-size:10px;font-weight:750;cursor:pointer}
      .ccKpiGrid .hlDeadlineIcon{color:#8b7a68}
      .ccKpiGrid .hlRtlList{grid-column:2/-1;margin:0;padding-left:16px;color:#6e5b50;font-size:10px}
      .ccKpiGrid .hlRtlList li{margin:3px 0}
      .ccKpiGrid .hlRtlList span,.ccKpiGrid .hlRtlList em{margin-left:8px;color:#8b7c72;font-style:normal}
      .ccColumns{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(270px,.75fr);gap:14px;align-items:start}
      .ccWorkList{display:grid;gap:8px}
      .ccWorkItem{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:11px 12px;border:1px solid #e4ebf1;border-radius:10px;background:#fbfcfd;text-align:left;cursor:pointer;transition:border-color .15s,background .15s}
      .ccWorkItem:hover{border-color:#bdcfde;background:#f5f9fc}
      .ccWorkItem span{display:grid;gap:3px;min-width:0}
      .ccWorkItem b{color:#35536c;font-size:11px;font-weight:750}
      .ccWorkItem small{color:#8294a3;font-size:10px}
      .ccWorkCount{flex:none;display:grid;place-items:center;min-width:31px;height:29px;padding:0 7px;border:1px solid #e0e8ef;border-radius:9px;background:#f0f5f9;color:#315b7a;font-size:13px;font-weight:850}
      .ccEmpty{margin:0;padding:16px 12px;border:1px dashed #dce5ed;border-radius:10px;color:#778c9e;font-size:11px;line-height:1.5}
      .ccActivityMeta{display:grid;gap:9px}
      .ccActivityLine{display:flex;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid #edf1f4;font-size:11px}
      .ccActivityLine:last-child{border-bottom:0}
      .ccActivityLine span{color:#7a8fa1}
      .ccActivityLine b{color:#35536c;text-align:right;font-weight:750}
      .ccShortcutGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px}
      .ccShortcut{display:flex;align-items:center;gap:10px;min-width:0;padding:12px;border:1px solid #e1e9f0;border-radius:11px;background:#fbfcfd;color:#34556f;text-align:left;cursor:pointer}
      .ccShortcut:hover{border-color:#b8cada;background:#f5f9fc}
      .ccShortcutIcon{display:grid;place-items:center;flex:none;width:31px;height:31px;border-radius:9px;background:#eaf1f6;color:#527895;font-size:15px;font-weight:800}
      .ccShortcut span:last-child{display:grid;gap:3px;min-width:0}
      .ccShortcut b{font-size:11px;font-weight:800}
      .ccShortcut small{color:#8395a4;font-size:10px;line-height:1.3}
      .ccReminder{display:flex;align-items:flex-start;gap:12px;padding:13px;border:1px solid #e8d9bd;border-radius:12px;background:#fffaf2}
      .ccReminderText{display:grid;gap:5px;min-width:0;flex:1}
      .ccReminderText b{color:#725b37;font-size:11px}
      .ccReminderText span{color:#695f50;font-size:12px;line-height:1.5;white-space:pre-wrap}
      .ccReminderActions{display:flex;gap:7px;flex-wrap:wrap}
      .ccReminderActions button{padding:7px 10px;border:1px solid #d9e2e9;border-radius:8px;background:#fff;color:#355b79;font-size:10px;font-weight:750;cursor:pointer}
      .ccReminderActions button:first-child{background:#285a80;border-color:#285a80;color:#fff}
      .ccFootnote{margin:0;color:#8293a1;font-size:10px;line-height:1.5}
      @media(max-width:900px){.ccColumns{grid-template-columns:1fr}.ccKpiGrid .hlKpiRow{grid-template-columns:repeat(2,minmax(0,1fr))}}
      @media(max-width:640px){.ccTop{display:grid;padding:16px}.ccTopActions{justify-content:flex-start}.ccSection{padding:13px}.ccKpiGrid .hlKpiRow{grid-template-columns:repeat(2,minmax(0,1fr))}.ccShortcutGrid{grid-template-columns:1fr}.ccShortcut{padding:10px}.ccReminder{display:grid}.ccReminderActions{justify-content:flex-start}.ccKpiGrid .hlDeadline{grid-template-columns:22px minmax(0,1fr)}.ccKpiGrid .hlDeadline button{grid-column:2;justify-self:start}.ccKpiGrid .hlRtlList{grid-column:2}}
    `}</style>

    <header className="ccTop">
      <div>
        <span className="ccEyebrow">AUREKA · Hospital Quality Intelligence · {dateLabel}</span>
        <h1 className="ccTitle">{greeting}, {firstName}</h1>
        <p className="ccSub">Pusat kendali operasional mutu, keselamatan pasien, risiko, dan tindak lanjut rumah sakit.</p>
        <span className="ccScope"><i className="ccScopeDot"/>Cakupan: {roomName||'Cakupan akun'}{scopeToRoom?' · mengikuti unit aktif':''}</span>
      </div>
      <div className="ccTopActions">
        <button type="button" className="ccAction" onClick={()=>setRefreshKey(v=>v+1)} disabled={refreshing}>↻ {refreshing?'Memuat…':'Perbarui data'}</button>
        <button type="button" className="ccAction" onClick={()=>window.dispatchEvent(new Event('aureka-open-password'))}>Keamanan akun</button>
        <button type="button" className="ccAction primary" onClick={()=>onNavigate('quality')}>Buka logbook</button>
      </div>
    </header>

    {reminders.length>0 && !(reminders[0].sent && hiddenReminder===reminders[0].id) && (()=>{const r=reminders[0];const when=new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',timeZone:'Asia/Pontianak'}).format(new Date(r.at));return <section className="ccReminder" role="region" aria-label="Pengingat dari Komite PMKP">
      <span className="ccShortcutIcon" aria-hidden="true">!</span>
      <div className="ccReminderText"><b>Pengingat Komite PMKP · {r.sent?r.sent+' unit':reminders.length+' belum dibaca'} · {when}</b><span>{r.body||'Buka pesan untuk membaca pengingat.'}</span></div>
      <div className="ccReminderActions">
        <button type="button" onClick={()=>window.dispatchEvent(new CustomEvent('aureka-open-support',{detail:{id:r.id}}))}>{r.sent?'Buka pesan':'Balas'}</button>
        {!r.sent&&<button type="button" disabled={reminderSaving===r.id} onClick={()=>void markReminderRead(r.id)}>{reminderSaving===r.id?'Menyimpan…':'Tandai dibaca'}</button>}
        {r.sent&&<button type="button" onClick={()=>hideReminder(r.id)}>Sembunyikan</button>}
      </div>
    </section>})()}

    <section className="ccSection" aria-label="Ringkasan kendali rumah sakit">
      <header className="ccSectionHead"><div><h2>Situational overview</h2><p>Indikator ringkas berdasarkan data yang berhasil dibaca dari sumber AUREKA.</p></div><span className="ccMeta">Tahun {new Date().getFullYear()}</span></header>
      <div className="ccKpiGrid">
        <HomeKpis key={refreshKey} supabase={supabase} rooms={rooms} isAdmin={isAdmin||manager} roomId={roomId} showSafety={isAdmin||manager} onNavigate={onNavigate}/>
      </div>
    </section>

    <div className="ccColumns">
      <section className="ccSection" aria-label="Antrean pekerjaan">
        <header className="ccSectionHead"><div><h2>Action queue</h2><p>Item pekerjaan yang masih memerlukan penyelesaian pada sumber aktivitas terhubung.</p></div><span className="ccMeta">{activity.pending.reduce((sum,item)=>sum+item.count,0)} item</span></header>
        {activity.pending.length?<div className="ccWorkList">{activity.pending.map(item=><button type="button" className="ccWorkItem" key={item.module+item.label} onClick={()=>onNavigate(item.module==='Keselamatan Pasien'?'safety':item.module==='Manajemen Risiko'?'risk':item.module==='Peningkatan Kinerja Klinis'?'clinical':'quality')}>
          <span><b>{item.label}</b><small>{item.module}</small></span><strong className="ccWorkCount">{item.count}</strong>
        </button>)}</div>:<p className="ccEmpty">Tidak ada pekerjaan tertunda yang terdeteksi dari sumber yang berhasil dibaca. Periksa status koneksi data sebelum menyimpulkan seluruh pekerjaan telah selesai.</p>}
        {activity.partial&&<p className="ccFootnote">Sebagian sumber aktivitas belum dapat dibaca. Angka antrean dapat belum lengkap.</p>}
      </section>

      <section className="ccSection" aria-label="Status aktivitas">
        <header className="ccSectionHead"><div><h2>Operational pulse</h2><p>Aktivitas akun dan kualitas pembacaan data.</p></div></header>
        <div className="ccActivityMeta">
          <div className="ccActivityLine"><span>Pengguna</span><b>{firstName}</b></div>
          <div className="ccActivityLine"><span>Peran</span><b>{manager?'Manajemen':isAdmin?'Administrator':'Pengguna unit'}</b></div>
          <div className="ccActivityLine"><span>Unit / cakupan</span><b>{roomName||'Belum ditetapkan'}</b></div>
          <div className="ccActivityLine"><span>Aktivitas terakhir</span><b>{activity.lastAt?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Pontianak'}).format(new Date(activity.lastAt)):'Belum tercatat'}</b></div>
          <div className="ccActivityLine"><span>Status pembacaan</span><b>{activity.partial?'Sebagian sumber bermasalah':'Pemeriksaan sumber selesai'}</b></div>
        </div>
      </section>
    </div>

    <section className="ccSection" aria-label="Akses cepat">
      <header className="ccSectionHead"><div><h2>Quick actions</h2><p>Akses langsung ke aktivitas utama tanpa membuka submenu.</p></div></header>
      <div className="ccShortcutGrid">
        <button type="button" className="ccShortcut" onClick={()=>onNavigate('safety',{tab:'incidents',newReport:true})}><span className="ccShortcutIcon">＋</span><span><b>Laporkan insiden</b><small>Mulai pelaporan keselamatan pasien</small></span></button>
        <button type="button" className="ccShortcut" onClick={()=>onNavigate('quality')}><span className="ccShortcutIcon">▤</span><span><b>Isi logbook mutu</b><small>Masuk ke pencatatan indikator</small></span></button>
        {onAskNara&&<button type="button" className="ccShortcut" onClick={()=>onAskNara('Analisis data yang dapat saya akses dan tampilkan tiga prioritas tindak lanjut. Pisahkan fakta, keterbatasan data, dan rekomendasi.','Command Center · '+(roomName||'Cakupan akun'))}><span className="ccShortcutIcon">✧</span><span><b>Analisis dengan NARA</b><small>Identifikasi prioritas berbasis data</small></span></button>}
        {(isAdmin||manager)&&<button type="button" className="ccShortcut" onClick={()=>onNavigate('risk')}><span className="ccShortcutIcon">◇</span><span><b>Manajemen risiko</b><small>Tinjau register dan pengendalian risiko</small></span></button>}
        {(isAdmin||manager)&&<button type="button" className="ccShortcut" onClick={()=>onNavigate('insights')}><span className="ccShortcutIcon">▥</span><span><b>Analitik eksekutif</b><small>Buka analisis dan infografis</small></span></button>}
      </div>
    </section>

    <p className="ccFootnote">Command Center menampilkan ringkasan sesuai kewenangan akun. Data yang tidak berhasil dibaca tidak diperlakukan sebagai nol; gunakan modul sumber untuk verifikasi dan tindak lanjut.</p>
  </section>
}
