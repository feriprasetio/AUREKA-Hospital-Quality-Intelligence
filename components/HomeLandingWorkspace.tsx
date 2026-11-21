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
  availableModules: string[]
  onReminderRead?: () => void
  onAskNara?: (prompt: string, pageContext: string) => void
}

export default function HomeLandingWorkspace({
  supabase,userName,userId,rooms,isAdmin,roomId,roomName,manager,scopeToRoom=false,onNavigate,availableModules,onReminderRead,onAskNara
}:Props) {
  // Pengingat aktif hanya ditampilkan sampai pengguna menandainya sudah dibaca.
  // Status baca disimpan per akun di database; pesan asli pada Chat Komite PMKP tetap utuh.
  const [refreshKey,setRefreshKey]=useState(0)
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
  },[supabase,roomId,manager,userId,refreshKey])

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

  const [activity,setActivity] = useState<{lastAt:string|null;pending:{label:string;count:number;module:string}[];partial:boolean}>({lastAt:null,pending:[],partial:false})
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

  const lastActivityLabel = activity.lastAt
    ? new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Pontianak'}).format(new Date(activity.lastAt))
    : 'Belum ada aktivitas tercatat'

  return <section className="commandCentre">
    <style>{`
      .commandCentre{display:grid;gap:var(--workspace-gap,18px);color:var(--aureka-color-foreground);min-width:0}
      .ccHero{position:relative;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;padding:24px 26px;border:1px solid var(--aureka-color-border);border-radius:16px;background:var(--aureka-color-surface)}
      .ccHero h1{margin:8px 0 5px;color:var(--aureka-color-foreground);font-size:clamp(23px,3vw,32px);font-weight:850;letter-spacing:-.045em;line-height:1.12}
      .ccHero p{margin:0;color:#637c91;font-size:13px;line-height:1.6}
      .ccHeroMeta{display:grid;gap:7px;justify-items:end;text-align:right}
      .ccDate{color:var(--aureka-color-foreground-secondary);font-size:12px;font-weight:750}
      .ccScope{padding:7px 11px;border:1px solid rgba(151,177,198,.35);border-radius:999px;background:var(--aureka-color-surface-muted);color:var(--aureka-color-foreground-secondary);font-size:11px;font-weight:750}
      .ccHeroActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:15px}
      .ccActionBtn{min-height:38px;padding:9px 13px;border:1px solid var(--aureka-color-border-strong);border-radius:9px;background:var(--aureka-color-surface-muted);color:var(--aureka-color-foreground);font-size:12px;font-weight:750;cursor:pointer}
      .ccActionBtn.primary{border-color:transparent;background:var(--aureka-color-primary);color:var(--aureka-color-on-primary)}
      .ccActionBtn:hover{background:var(--aureka-color-surface-raised)}
      .ccActionBtn.primary:hover{background:var(--aureka-color-primary-hover);color:var(--aureka-color-on-primary)}
      .ccSection{display:grid;gap:12px;min-width:0}
      .ccSectionHead{display:flex;justify-content:space-between;align-items:flex-end;gap:12px}
      .ccSectionHead h2{margin:0;color:var(--aureka-color-foreground);font-size:15px;font-weight:850;letter-spacing:-.015em}
      .ccSectionHead p{margin:4px 0 0;color:#7b90a2;font-size:11px;line-height:1.5}
      .ccSectionMeta{color:var(--aureka-color-foreground-secondary);font-size:12px;text-align:right}
      .ccPanel{min-width:0;padding:17px;border:1px solid var(--aureka-color-border);border-radius:15px;background:var(--aureka-color-surface)}
      .ccWorkList{display:grid;gap:8px}
      .ccWorkItem{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;padding:12px;border:1px solid #e0e8ef;border-radius:10px;background:rgba(255,255,255,.76);text-align:left;cursor:pointer}
      .ccWorkItem:hover{border-color:#aec3d5;background:#fff}
      .ccWorkText{display:grid;gap:4px;min-width:0}
      .ccWorkText strong{color:#34556f;font-size:12px;font-weight:750;line-height:1.4}
      .ccWorkText small{color:#8194a4;font-size:10px}
      .ccWorkCount{display:grid;place-items:center;flex:0 0 34px;width:34px;height:34px;border:1px solid #d7e3ed;border-radius:10px;background:#f1f6fa;color:#244d6d;font-size:14px;font-weight:850;font-variant-numeric:tabular-nums}
      .ccEmpty{padding:20px 12px;border:1px dashed #d5e1ea;border-radius:10px;color:var(--aureka-color-foreground-secondary);font-size:13px;line-height:1.6;text-align:center}
      .ccFoot{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:11px 14px;border:1px solid #dfe8ef;border-radius:11px;background:var(--aureka-color-surface-muted);color:var(--aureka-color-foreground-secondary);font-size:11px}
      .ccFoot strong{color:var(--aureka-color-foreground);font-weight:750}
      .ccReminder{display:flex;align-items:flex-start;gap:12px;padding:13px 15px;border:1px solid #d9e4ed;border-radius:12px;background:rgba(247,250,253,.9)}
      .ccReminderMark{flex:0 0 8px;width:8px;height:8px;margin-top:5px;border-radius:50%;background:#7c9db8}
      .ccReminderBody{display:grid;gap:4px;min-width:0;flex:1}
      .ccReminderBody strong{color:#34546e;font-size:11px}
      .ccReminderBody span{color:#647d91;font-size:12px;line-height:1.5;white-space:pre-wrap}
      .ccReminderActions{display:flex;gap:7px;flex-wrap:wrap}
      .ccMiniBtn{padding:7px 10px;border:1px solid #d1dee8;border-radius:8px;background:#fff;color:#365a77;font-size:10px;font-weight:750;cursor:pointer}
      .ccNotice{padding:10px 12px;border:1px solid #e5d9c5;border-radius:9px;background:#fbf8f2;color:#806b4d;font-size:11px;line-height:1.5}
      @media(max-width:720px){.ccHero{grid-template-columns:1fr;padding:16px}.ccHeroMeta{justify-items:start;text-align:left}.ccActionBtn{min-height:44px}.ccPanel{padding:12px}.ccFoot{flex-wrap:wrap}}
    `}</style>

    <header className="ccHero">
      <div>
        <h1>{greeting}, {firstName}.</h1>
        <div className="ccHeroActions">
          <button type="button" className="ccActionBtn" onClick={()=>setRefreshKey(value=>value+1)}>↻ Perbarui data</button>
          {availableModules.includes('quality')&&<button type="button" className="ccActionBtn primary" onClick={()=>onNavigate('logbook')}>Buka logbook</button>}
          {availableModules.includes('safety')&&<button type="button" className="ccActionBtn" onClick={()=>onNavigate('safety',{tab:'incidents',newReport:true})}>Laporkan insiden</button>}
          {onAskNara&&<button type="button" className="ccActionBtn" onClick={()=>onAskNara('Tinjau kondisi operasional berdasarkan data AUREKA yang dapat saya akses. Sajikan temuan, prioritas, keterbatasan data, dan rekomendasi tindak lanjut.','Command Centre · '+(roomName||'Cakupan akun'))}>Analisis dengan NARA</button>}
        </div>
      </div>
      <div className="ccHeroMeta">
        <span className="ccDate">{dateLabel}</span>
        <span className="ccScope">{roomName||'Cakupan akun'}</span>
      </div>
    </header>

    {reminders.length>0 && !(reminders[0].sent && hiddenReminder===reminders[0].id) && (()=>{const r=reminders[0];const when=new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',timeZone:'Asia/Pontianak'}).format(new Date(r.at));return <section className="ccReminder" role="region" aria-label="Pengingat Komite PMKP">
      <span className="ccReminderMark" aria-hidden="true"/>
      <div className="ccReminderBody"><strong>Pengingat Komite PMKP · {r.sent?r.sent+' unit':reminders.length+' belum dibaca'} · {when}</strong><span>{r.body||'Buka percakapan untuk membaca pengingat.'}</span></div>
      <div className="ccReminderActions">
        <button type="button" className="ccMiniBtn" onClick={()=>window.dispatchEvent(new CustomEvent('aureka-open-support',{detail:{id:r.id}}))}>{r.sent?'Buka pesan':'Balas'}</button>
        {!r.sent&&<button type="button" className="ccMiniBtn" disabled={reminderSaving===r.id} onClick={()=>void markReminderRead(r.id)}>{reminderSaving===r.id?'Menyimpan…':'Tandai sudah dibaca'}</button>}
        {r.sent&&<button type="button" className="ccMiniBtn" onClick={()=>hideReminder(r.id)}>Sembunyikan</button>}
      </div>
    </section>})()}

    <section className="ccSection" aria-label="Ringkasan operasional">
      <div className="ccSectionHead"><h2>Ringkasan kinerja</h2></div>
      <div className="ccPanel"><HomeKpis key={refreshKey} supabase={supabase} rooms={rooms} isAdmin={isAdmin||manager} roomId={roomId} showSafety={isAdmin||manager} onNavigate={onNavigate}/></div>
    </section>

      <section className="ccSection" aria-label="Antrean pekerjaan">
        <div className="ccSectionHead"><h2>Perlu tindak lanjut</h2><span className="ccSectionMeta">{activity.pending.reduce((sum,item)=>sum+item.count,0)} item</span></div>
        <div className="ccPanel">
          {activity.pending.length ? <div className="ccWorkList">{activity.pending.map(item=><button type="button" className="ccWorkItem" key={item.module+item.label} onClick={()=>onNavigate(item.module==='Keselamatan Pasien'?'safety':item.module==='Manajemen Risiko'?'risk':item.module==='Peningkatan Kinerja Klinis'?'clinical':'quality')}>
            <span className="ccWorkText"><strong>{item.label}</strong><small>{item.module}</small></span><span className="ccWorkCount">{item.count}</span>
          </button>)}</div> : <div className="ccEmpty">{activity.partial?'Antrean belum dapat dimuat sepenuhnya.':'Tidak ada pekerjaan tertunda.'}</div>}
          {activity.partial&&activity.pending.length>0&&<p className="ccNotice">Sebagian pekerjaan belum dapat dimuat.</p>}
        </div>
      </section>

    <footer className="ccFoot">
      <span><strong>Aktivitas terakhir:</strong> {lastActivityLabel}</span>
      <span>Ruang lingkup: {roomName||'Mengikuti kewenangan akun'}</span>
    </footer>
  </section>
}
