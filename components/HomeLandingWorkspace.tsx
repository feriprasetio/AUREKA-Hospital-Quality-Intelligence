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

  const [activity,setActivity] = useState<{lastAt:string|null;pending:{label:string;count:number;module:string}[];partial:boolean}>({lastAt:null,pending:[],partial:false})
  const firstName = userName.trim().split(/\s+/)[0] || 'Pengguna'
  const greeting = (() => { const h=Number(new Intl.DateTimeFormat('en-US',{hour:'2-digit',hour12:false,timeZone:'Asia/Pontianak'}).format(new Date())); return h<4?'Selamat malam':h<11?'Selamat pagi':h<15?'Selamat siang':h<18?'Selamat sore':'Selamat malam' })()
  const dateLabel = new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric',timeZone:'Asia/Pontianak'}).format(new Date())
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
  },[supabase,userId,scopeToRoom,roomId,roomName])

  const firstName = userName.trim().split(/\s+/)[0] || 'Pengguna'
  const greeting = (() => {
    const h = Number(new Intl.DateTimeFormat('en-US',{hour:'2-digit',hour12:false,timeZone:'Asia/Pontianak'}).format(new Date()))
    return h<4?'Selamat malam':h<11?'Selamat pagi':h<15?'Selamat siang':h<18?'Selamat sore':'Selamat malam'
  })()
  const dateLabel = new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric',timeZone:'Asia/Pontianak'}).format(new Date())

  return <section className="homeLanding">
    <style>{`
      .homeLanding{display:grid;gap:16px;color:var(--ink,#102A43)}.hlExplorer{display:grid;gap:18px}.hlExplorerHead,.hlVisualizationHead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.hlExplorerHead h3,.hlVisualizationHead h4{margin:0;color:#102A43;font-size:16px;font-weight:750}.hlExplorerHead p,.hlVisualizationHead p{margin:4px 0 0;color:#7b8981;font-size:12px;line-height:1.5}.hlDataScope{padding:6px 10px;border-radius:8px;background:#EFF5FA;color:#16507A;font-size:12px;font-weight:700;white-space:nowrap}.hlFilterGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.hlFilterGrid label{display:grid;gap:6px;min-width:0}.hlFilterGrid label>span{font-size:12px;font-weight:750;color:#536B80}.hlFilterGrid select{width:100%;min-width:0;min-height:42px;border:1px solid #D7E2EB;border-radius:9px;background:#fff;color:#102A43;padding:8px 32px 8px 11px;font-size:12px;font-weight:650}.hlSummaryGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.hlSummaryMetric{min-width:0;padding:13px 15px;border:1px solid #E6EDF3;border-radius:10px;background:#f8faf8}.hlSummaryMetric span,.hlSummaryMetric small{display:block;color:#62788B;font-size:12px;line-height:1.4}.hlSummaryMetric strong{display:block;margin:5px 0 2px;color:#102A43;font-size:22px;line-height:1.15;font-weight:800;overflow-wrap:anywhere}.hlVisualizationHead{padding-top:4px;border-top:1px solid #edf2ee}.hlVisualizationHead h4{font-size:15px}.hlVisualizationHead>span{color:#7B8FA3;font-size:12px;white-space:nowrap}.hlDonutLayout{display:grid;grid-template-columns:minmax(220px,300px) minmax(0,1fr);align-items:center;gap:22px;max-width:760px;margin:0 auto}.hlDonutLayout svg{width:100%;height:auto;max-height:260px}.hlDonutLegend{display:grid;gap:9px;min-width:0}.hlLegendItem{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:9px;align-items:center;font-size:12px;color:#536B80}.hlLegendItem i{width:9px;height:9px;border-radius:50%}.hlLegendItem span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hlLegendItem b{color:#203447;font-size:12px;font-variant-numeric:tabular-nums}.hlTabs{display:flex;gap:7px;flex-wrap:wrap;border-bottom:1px solid var(--line,rgba(30,60,45,.14));padding-bottom:10px}.hlTab{border:1px solid transparent;border-radius:10px;padding:10px 14px;background:transparent;color:#66766d;font-size:12px;font-weight:750;cursor:pointer}.hlTab.active{background:#E3EFF8;color:#16507A;border-color:#C8DCEB}.hlWelcomeCard,.hlPanel{background:#fff;border:1px solid var(--line,rgba(30,60,45,.13));border-radius:16px;padding:18px;box-shadow:0 8px 24px rgba(28,60,43,.035)}.hlWelcomeCard{background:linear-gradient(125deg,#F3F7FA,#fff 70%);display:grid;gap:7px}.hlWelcomeCard .hlGreeting{font-size:clamp(20px,3vw,28px);font-weight:850;letter-spacing:-.04em;color:#102A43}.hlWelcomeCard p{margin:0;color:#62788B;font-size:12px}.hlUnitPicker{display:grid;gap:5px;max-width:420px;margin-top:4px}.hlUnitPicker span{font-size:12px;font-weight:800;color:#536B80}.hlUnitPicker select{width:100%;min-height:40px;border:1px solid #D7E2EB;border-radius:10px;background:#fff;color:#102A43;padding:8px 11px;font-size:12px;font-weight:700;outline:none}.hlUnitPicker select:focus-visible{border-color:#2D6E9E;box-shadow:0 0 0 3px rgba(57,124,88,.14)}.hlDate{font-size:12px;color:#62788B}.hlPanelHead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}.hlPanelHead h3{font-size:15px;margin:0;color:#102A43}.hlPanelHead span{font-size:12px;color:#819087}.hlGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.hlMetric{padding:13px;border-radius:12px;background:#F7FAFC;border:1px solid #E6EDF3}.hlMetric span{display:block;font-size:12px;color:#62788B}.hlMetric strong{display:block;font-size:23px;margin-top:5px;color:#102A43}.hlMetric small{font-size:12px;color:#7B8FA3}.hlChart{width:100%}.hlChart svg{width:100%;height:auto;overflow:visible}.hlAxis{display:flex;justify-content:space-between;color:#7B8FA3;font-size:12px}.hlBars{display:grid;gap:8px}.hlBarRow{display:grid;grid-template-columns:minmax(90px,1fr) 3fr 28px;gap:8px;align-items:center;font-size:12px}.hlBarTrack{height:8px;background:#edf2ee;border-radius:10px;overflow:hidden}.hlBarFill{height:100%;background:#2D6E9E;border-radius:10px}.hlPendingRow{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px;border:1px solid #E6EDF3;border-radius:10px;background:#fff;text-align:left;cursor:pointer}.hlPendingRow span{display:grid;gap:4px}.hlPendingRow b{font-size:12px;color:#315442}.hlPendingRow small{font-size:12px;color:#839087}.hlPendingRow strong{font-size:18px;color:#a45b28}.hlEmpty{padding:22px;text-align:center;color:#7B8FA3;font-size:12px}.hlInfoFilter{display:flex;justify-content:flex-end}.hlInfoFilter label{display:grid;gap:5px;font-size:12px;font-weight:700;color:#62788B}.hlInfoFilter select{min-width:240px;min-height:40px;border-radius:12px;padding:8px 12px;font-size:13px}.hlReminder{border-color:#f5c26b!important}.hlReminderRow{display:flex;gap:14px;justify-content:space-between;align-items:flex-start;padding:12px 14px;border-radius:12px;border:1px solid #f3e1b8;background:#fffaf0}.hlReminderRow small{font-size:12px;color:#8a6a2a}.hlReminderRow p{margin:4px 0 0;font-size:13px;line-height:1.5;color:#3d3220;white-space:pre-wrap}.hlReminderActions{display:flex;flex:0 0 auto;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.hlReminderBtn{flex:0 0 auto;border:0;border-radius:10px;padding:9px 14px;background:#0b467a;color:#fff;font-size:12px;font-weight:700;cursor:pointer}.hlReminderReadBtn{flex:0 0 auto;border:1px solid #d8e1e8;border-radius:10px;padding:8px 12px;background:#fff;color:#40556a;font-size:12px;font-weight:700;cursor:pointer}.hlReminderReadBtn:disabled{opacity:.6;cursor:wait}.hlNotice{padding:11px 13px;border-radius:10px;background:#fff7e9;color:#805e2b;font-size:12px}@media(max-width:1000px){.hlFilterGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.hlDonutLayout{grid-template-columns:minmax(180px,240px) minmax(0,1fr)}}@media(max-width:640px){.hlFilterGrid,.hlSummaryGrid{grid-template-columns:1fr}.hlExplorerHead,.hlVisualizationHead{display:grid}.hlDataScope,.hlVisualizationHead>span{justify-self:start}.hlDonutLayout{grid-template-columns:1fr}.hlDonutLayout svg{max-width:250px;margin:auto}.hlGrid{grid-template-columns:1fr}.hlWelcomeCard,.hlPanel{padding:14px}.hlTab{flex:1}}`}</style>
    <section className="hlWelcomeCard hlAuroraHero">
      <div className="hlHeroText">
        <span className="hlHeroEyebrow">0° Khatulistiwa · {dateLabel}</span>
        <span className="hlGreeting">{greeting}, <span className="hlGreetName">{firstName}</span></span>
        <span className="hlHeroSub">RSUD Sultan Syarif Mohamad Alkadrie · {roomName && roomName!=='Seluruh rumah sakit' ? roomName : 'Kota Pontianak'}</span>
        {scopeToRoom && <small className="hlUnitHint">Cakupan mengikuti unit aktif pada header AUREKA</small>}
      </div>
      <div className="hlHeroActions">
        <button type="button" className="hlHeroBtn" onClick={()=>onNavigate('safety',{tab:'incidents',newReport:true})}>Lapor insiden</button>
        <button type="button" className="hlHeroBtn primary" onClick={()=>onNavigate('quality')}>Isi logbook</button>
        {onAskNara && <button type="button" className="hlHeroBtn" onClick={()=>onAskNara('Bantu saya menentukan tiga prioritas perbaikan berdasarkan data yang dapat saya akses. Bedakan data, keterbatasan dan rekomendasi.','Beranda · '+(roomName||'Cakupan akun'))}>Analisis dengan NARA</button>}
        <button type="button" className="hlPwBtn hlPwIcon" onClick={()=>window.dispatchEvent(new Event('aureka-open-password'))} title="Ubah password" aria-label="Ubah password">
          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>
        </button>
      </div>
    </section>
    {reminders.length>0 && !(reminders[0].sent && hiddenReminder===reminders[0].id) && (()=>{const r=reminders[0];const when=new Intl.DateTimeFormat('id-ID',{day:'numeric',month:'short',timeZone:'Asia/Pontianak'}).format(new Date(r.at));return <section className="hlReminderBar" role="region" aria-label="Pengingat dari Komite PMKP">
      <span className="hlReminderIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg></span>
      <div className="hlReminderText"><b>Komite PMKP · {r.sent ? r.sent+' unit' : reminders.length+' belum dibaca'} · {when}</b><span title={r.body}>{r.body||'Buka pesan untuk membaca pengingat.'}</span></div>
      <div className="hlReminderActions">
        <button type="button" className="hlReminderBtn" onClick={()=>window.dispatchEvent(new CustomEvent('aureka-open-support',{detail:{id:r.id}}))}>{r.sent?'Buka pesan':'Balas'}</button>
        {!r.sent&&<button type="button" className="hlReminderReadBtn" disabled={reminderSaving===r.id} onClick={()=>void markReminderRead(r.id)}>{reminderSaving===r.id?'Menyimpan…':'Tandai sudah dibaca'}</button>}
        {r.sent&&<button type="button" className="hlReminderReadBtn" onClick={()=>hideReminder(r.id)}>Sembunyikan</button>}
      </div>
    </section>})()}
    <section className="hlPanel" aria-label="Prioritas perhatian">
      <header className="hlPanelHead"><h3>Priority attention</h3><span>Sinyal ringkas sesuai cakupan akses</span></header>
      <HomeKpis supabase={supabase} rooms={rooms} isAdmin={isAdmin||manager} roomId={roomId} showSafety={isAdmin||manager} onNavigate={onNavigate}/>
    </section>
    <section className="hlPanel" aria-label="Pekerjaan dan aktivitas pengguna">
      <header className="hlPanelHead">
        <h3>My work / Unit tasks</h3>
        <span>{activity.lastAt?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Pontianak'}).format(new Date(activity.lastAt)):'Belum ada aktivitas tercatat'}</span>
      </header>
      {activity.pending.length ? <div className="hlBars">{activity.pending.map(item=><button type="button" className="hlPendingRow" key={item.module+item.label} onClick={()=>onNavigate(item.module==='Keselamatan Pasien'?'safety':item.module==='Manajemen Risiko'?'risk':item.module==='Peningkatan Kinerja Klinis'?'clinical':'quality')}>
        <span><b>{item.label}</b><small>{item.module}</small></span><strong>{item.count}</strong>
      </button>)}</div> : <p className="hlEmpty">Tidak ada pekerjaan tertunda yang ditemukan pada sumber aktivitas yang terhubung.</p>}
      {activity.partial&&<p className="hlDate">Sebagian sumber aktivitas belum dapat dibaca. Periksa modul terkait sebelum menyimpulkan bahwa tidak ada pekerjaan tertunda.</p>}
    </section>
  </section>
}
