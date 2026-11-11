'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NavigateFn } from '@/lib/aureka/focus'
import dynamic from 'next/dynamic'
import OverviewDashboard from '@/components/OverviewDashboard'
import TanyaAureka from '@/components/TanyaAureka'
import { fetchRoomMonthCounts, type RoomMonthCount } from '@/lib/aureka/quality-counts'
const QualityResultsWorkspace=dynamic(()=>import('@/components/QualityResultsWorkspace'),{ssr:false})
const PatientSafetyWorkspace=dynamic(()=>import('@/components/PatientSafetyWorkspace'),{ssr:false})
const RiskManagementWorkspace=dynamic(()=>import('@/components/RiskManagementWorkspace'),{ssr:false})

type Room = { id:number; name:string }
type RecordRow = {
  id: string
  room_id: number | null
  record_date: string | null
  measurement_grain: string | null
  status: string | null
  core_data: Record<string, any> | null
  created_at: string
  updated_at: string
}
type Props = {
  supabase: SupabaseClient
  userName: string
  userId: string
  rooms: Room[]
  role: string | null
  isAdmin: boolean
  roomId: number | null
  roomName: string | null
  manager: boolean
  scopeToRoom?: boolean
  selectedRoomId?: number | null
  onRoomChange?: (roomId: number) => void
  onNavigate: NavigateFn
}
const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
const valueText = (value: unknown) => value == null ? '' : String(value).trim()
const fieldData = (core: Record<string, any>) => (core.form_fields ?? core.form_data ?? {}) as Record<string, unknown>
const diagnosisOf = (core: Record<string, any>) => {
  const fields = fieldData(core)
  return valueText(core.diagnosis) || valueText(fields['Diagnosa Tegak']) || valueText(fields['Diagnosa IGD']) || valueText(fields['Diagnosa']) || valueText(fields['Diagnosa Operasi'])
}
const icdOf = (core: Record<string, any>) => {
  const fields = fieldData(core)
  const raw = valueText(core.icd10_code) || valueText(core.icd10) || valueText(fields['Kode ICD-10']) || valueText(fields['ICD-10']) || valueText(fields['Kode Diagnosa']) || diagnosisOf(core)
  const match = raw.toUpperCase().match(/[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?/)
  return match?.[0] || ''
}
const losOf = (core: Record<string, any>) => {
  const fields = fieldData(core)
  const calc = (core.calculated_fields ?? {}) as Record<string, unknown>
  const raw = core.los_days ?? calc['Length of Stay'] ?? calc['Lenght of Stay'] ?? fields['Length of Stay'] ?? fields['Lenght of Stay']
  const n = Number(raw)
  if (Number.isFinite(n) && n >= 0) return n
  const start = valueText(core.admission_at) || valueText(fields['Tanggal Masuk'])
  const end = valueText(core.discharge_at) || valueText(fields['Tanggal Keluar'])
  // Pasien yang masih dirawat (belum ada tanggal keluar) tidak ikut rata-rata LOS.
  if (!start || !end) return null
  const from = new Date(start).getTime()
  const to = new Date(end).getTime()
  return Number.isFinite(from) && Number.isFinite(to) && to >= from ? Math.max(1, Math.ceil((to-from)/86400000)) : null
}
function LineChart({ values, labels }: { values: number[]; labels: string[] }) {
  const max = Math.max(1, ...values)
  const points = values.map((v,i) => `${18 + i* (264/Math.max(1,values.length-1))},${104 - (v/max)*82}`).join(' ')
  return <div className="hlChart"><svg viewBox="0 0 300 126" role="img" aria-label="Tren data bulanan"><line x1="16" y1="105" x2="284" y2="105" stroke="#dfe8e2"/><line x1="16" y1="63" x2="284" y2="63" stroke="#edf2ee"/><polyline points={points} fill="none" stroke="#24744f" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{values.map((v,i)=><circle key={labels[i]} cx={18+i*(264/Math.max(1,values.length-1))} cy={104-(v/max)*82} r="3.5" fill="#24744f"><title>{labels[i]}: {v}</title></circle>)}</svg><div className="hlAxis">{labels.map(label=><span key={label}>{label}</span>)}</div></div>
}
// Simpan sementara data per unit 10 menit: membuka ulang Infografis tidak menarik ulang ribuan baris.
const unitRecordCache=new Map<string,{at:number;rows:RecordRow[]}>()
type UnitStats={allowed?:boolean;episodes:number;active:number;avg_los:number|null;los_count:number;months:{month:number;count:number}[];top:{code:string;diagnosis:string;count:number}[]}

export default function HomeLandingWorkspace({supabase,userName,userId,rooms,role,isAdmin,roomId,roomName,manager,scopeToRoom=false,selectedRoomId,onRoomChange,onNavigate}:Props) {
  const [tab,setTab] = useState<'welcome'|'infographics'|'achievements'>('welcome')
  const [achievementTab,setAchievementTab] = useState<'overview'|'indicators'|'safety'|'risk'>('overview')
  const [records,setRecords] = useState<RecordRow[]>([])
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [refreshedAt,setRefreshedAt] = useState<Date|null>(null)
  const [countRows,setCountRows] = useState<RoomMonthCount[]|null>(null)
  const [unitStats,setUnitStats] = useState<UnitStats|null>(null)
  // Pengingat dari Komite PMKP untuk unit pengguna (30 hari terakhir) — dibaca dari Chat unit.
  const [reminders,setReminders] = useState<{id:string;at:string;body:string}[]>([])
  useEffect(()=>{
    if(manager||roomId==null){setReminders([]);return}
    let cancelled=false
    ;(async()=>{
      const sys=supabase.schema('aureka_system')
      const {data:convs,error}=await sys.from('support_conversations').select('id,created_at').eq('subject','Pengingat Komite PMKP').eq('room_id',roomId)
        .gt('created_at',new Date(Date.now()-30*86400000).toISOString()).order('created_at',{ascending:false}).limit(3)
      if(cancelled||error||!convs?.length){if(!cancelled)setReminders([]);return}
      const {data:msgs}=await sys.from('support_messages').select('conversation_id,body,created_at').in('conversation_id',convs.map((c:any)=>c.id)).order('created_at',{ascending:true})
      if(cancelled)return
      setReminders((convs as any[]).map(c=>({id:String(c.id),at:String(c.created_at),body:String((msgs??[]).find((m:any)=>m.conversation_id===c.id)?.body||'')})))
    })()
    return()=>{cancelled=true}
  },[supabase,roomId,manager])
  // PMKP/manajemen tetap dapat memilih Semua Unit di Infografis; Super Admin mengikuti unit global.
  const [infoRoom,setInfoRoom] = useState<string>(manager?'':String(roomId??''))
  const infoRoomId = infoRoom?Number(infoRoom):null
  const infoRoomName = infoRoomId?(rooms.find(r=>Number(r.id)===infoRoomId)?.name??roomName):(manager?'Semua unit':roomName)
  const [activity,setActivity] = useState<{lastAt:string|null;pending:{label:string;count:number;module:string}[];partial:boolean}>({lastAt:null,pending:[],partial:false})
  const firstName = userName.trim().split(/\s+/)[0] || 'Pengguna'
  const greeting = (() => { const h=Number(new Intl.DateTimeFormat('en-US',{hour:'2-digit',hour12:false,timeZone:'Asia/Pontianak'}).format(new Date())); return h<11?'Selamat pagi':h<15?'Selamat siang':h<18?'Selamat sore':'Selamat malam' })()
  const dateLabel = new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric',timeZone:'Asia/Pontianak'}).format(new Date())
  useEffect(() => {
    let cancelled=false
    if(!infoRoomId&&!manager){setRecords([]);setError('Unit kerja belum terhubung ke akun ini.');return}
    setLoading(true);setError('')
    const year=new Date().getFullYear()
    ;(async()=>{
      // Semua unit: cukup jumlah per unit/bulan yang dihitung database (tanpa menarik puluhan ribu baris).
      if(!infoRoomId){
        const rows=await fetchRoomMonthCounts(year)
        if(cancelled)return
        setUnitStats(null);setCountRows(rows);setRecords([]);setRefreshedAt(new Date());setLoading(false)
        return
      }
      // Satu unit: dibaca paralel per bulan (keyset id > terakhir di tiap bulan) agar cepat dan tidak terpotong.
      // Ringkasan episode dihitung database (cepat). Bila fungsi belum dipasang, baca data per bulan (lebih lambat).
      const stats=await supabase.rpc('aureka_patient_episode_stats',{p_room:infoRoomId,p_year:year})
      if(!stats.error&&stats.data&&(stats.data as any).allowed!==false){
        const counts=await fetchRoomMonthCounts(year)
        if(cancelled)return
        setUnitStats(stats.data as UnitStats);setCountRows(counts.filter(r=>r.room_id===infoRoomId));setRecords([]);setRefreshedAt(new Date());setLoading(false)
        return
      }
      setUnitStats(null)
      const cacheKey=infoRoomId+'|'+year
      const cachedRows=unitRecordCache.get(cacheKey)
      let all:RecordRow[]
      if(cachedRows&&Date.now()-cachedRows.at<10*60*1000){all=cachedRows.rows}
      else{
        const windows:[string|null,string|null][]=Array.from({length:12},(_,m)=>[`${year}-${String(m+1).padStart(2,'0')}-01`,m===11?`${year+1}-01-01`:`${year}-${String(m+2).padStart(2,'0')}-01`])
        windows.push([null,null]) // catatan tanpa tanggal / di luar tahun
        const parts=await Promise.all(windows.map(async([from,to])=>{
          const rows:RecordRow[]=[]
          let last:string|null=null
          for(let page=0;page<40;page++){
            let q:any=supabase.schema('aureka_quality').from('quality_records')
              .select('id,room_id,record_date,measurement_grain,status,core_data,created_at,updated_at')
              .eq('profile_year',year).is('archived_at',null).eq('room_id',infoRoomId)
              .order('id',{ascending:true}).limit(1000)
            q=from?q.gte('record_date',from).lt('record_date',to):q.or(`record_date.is.null,record_date.lt.${year}-01-01,record_date.gte.${year+1}-01-01`)
            if(last)q=q.gt('id',last)
            const {data,error:pageError}=await q
            if(pageError)throw pageError
            rows.push(...((data??[]) as RecordRow[]))
            if(!data||data.length<1000)break
            last=(data[data.length-1] as RecordRow).id
          }
          return rows
        }))
        if(cancelled)return
        all=parts.flat()
        unitRecordCache.set(cacheKey,{at:Date.now(),rows:all})
      }
      setCountRows(null);setRecords(all)
      setRefreshedAt(new Date())
      setLoading(false)
    })().catch(()=>{if(!cancelled){setError('Infografis belum dapat dimuat. Coba kembali.');setLoading(false)}})
    return()=>{cancelled=true}
  },[supabase,infoRoomId,manager])
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
        {label:'Catatan indikator mutu yang belum selesai',count:quality.count??0,module:'Mutu Klinis'},
        {label:'Audit Clinical Pathway yang masih draf/perbaikan',count:cp.count??0,module:'Mutu Klinis'},
        {label:'Telaah klinis/kematian yang masih draf/perbaikan',count:death.count??0,module:'Mutu Klinis'},
        {label:'Laporan insiden yang masih dalam proses',count:incidents.count??0,module:'Keselamatan Pasien'},
        {label:'Risiko yang masih memerlukan pengendalian',count:risks.count??0,module:'Manajemen Risiko'},
        {label:'Rencana mitigasi yang masih berjalan/menunggu persetujuan',count:plans.count??0,module:'Manajemen Risiko'},
      ].filter(item=>item.count>0)
      setActivity({lastAt,pending,partial:jobs.some(result=>Boolean(result.error))})
    })().catch(()=>{if(!cancelled)setActivity({lastAt:null,pending:[],partial:true})})
    return()=>{cancelled=true}
  },[supabase,userId,scopeToRoom,roomId,roomName])
  const metrics=useMemo(()=>{
    const now=new Date()
    const months=Array.from({length:12},(_,i)=>({key:`${now.getFullYear()}-${String(i+1).padStart(2,'0')}`,label:MONTHS[i],count:0,activity:0}))
    const episodeRows=records.filter(row=>row.measurement_grain==='patient_episode')
    const byCode=new Map<string,{code:string;diagnosis:string;count:number}>()
    const los:number[]=[]
    let active=0
    if(unitStats&&countRows){
      for(const r of countRows){if(r.month==null)continue;const m=months[r.month-1];if(m)m.activity+=r.total}
      for(const r of unitStats.months||[]){const m=months[r.month-1];if(m)m.count=Number(r.count)||0}
      return {months,episodeRows:Number(unitStats.episodes)||0,active:Number(unitStats.active)||0,averageLos:unitStats.avg_los==null?null:Number(unitStats.avg_los),
        topDiagnoses:(unitStats.top||[]).map(t=>({code:t.code,diagnosis:t.diagnosis,count:Number(t.count)})),activity:countRows.reduce((a,b)=>a+b.total,0),losCount:Number(unitStats.los_count)||0,aggregateOnly:false}
    }
    if(countRows){
      for(const r of countRows){if(r.month==null)continue;const m=months[r.month-1];if(!m)continue;m.activity+=r.total;if(r.measurement_grain==='patient_episode')m.count+=r.total}
      const episodes=countRows.filter(r=>r.measurement_grain==='patient_episode').reduce((a,b)=>a+b.total,0)
      return {months,episodeRows:episodes,active:null as number|null,averageLos:null as number|null,topDiagnoses:[] as {code:string;diagnosis:string;count:number}[],activity:countRows.reduce((a,b)=>a+b.total,0),losCount:0,aggregateOnly:true}
    }
    for(const row of records){const key=(row.record_date||row.created_at||'').slice(0,7);const m=months.find(item=>item.key===key);if(m)m.activity++}
    for(const row of episodeRows){
      const key=(row.record_date||row.created_at||'').slice(0,7);const m=months.find(item=>item.key===key);if(m)m.count++
      const core=row.core_data??{}
      const code=icdOf(core), diagnosis=diagnosisOf(core)
      const diagnosisKey=code||diagnosis.toLocaleLowerCase('id-ID').trim()
      if(diagnosisKey){const old=byCode.get(diagnosisKey);byCode.set(diagnosisKey,{code:code||'Belum berkode',diagnosis:diagnosis||old?.diagnosis||'Diagnosis belum dinormalisasi',count:(old?.count||0)+1})}
      const stay=losOf(core);if(stay!==null)los.push(stay)
      const fields=fieldData(core)
      const hasDischargeField=Object.prototype.hasOwnProperty.call(core,'discharge_at')||Object.prototype.hasOwnProperty.call(fields,'Tanggal Keluar')
      const discharged=valueText(core.discharge_at)||valueText(fields['Tanggal Keluar'])
      if(hasDischargeField&&!discharged&&row.status!=='archived')active++
    }
    return {months,episodeRows:episodeRows.length,active,averageLos:los.length?los.reduce((a,b)=>a+b,0)/los.length:null,topDiagnoses:Array.from(byCode.values()).sort((a,b)=>b.count-a.count).slice(0,6),activity:records.length,losCount:los.length,aggregateOnly:false}
  },[records,countRows,unitStats])
  const tabButton=(id:typeof tab,label:string)=><button type="button" role="tab" aria-selected={tab===id} className={tab===id?'hlTab active':'hlTab'} onClick={()=>setTab(id)}>{label}</button>
  return <section className="homeLanding">
    <style>{`
      .homeLanding{display:grid;gap:16px;color:var(--ink,#18372b)}.hlTabs{display:flex;gap:7px;flex-wrap:wrap;border-bottom:1px solid var(--line,rgba(30,60,45,.14));padding-bottom:10px}.hlTab{border:1px solid transparent;border-radius:10px;padding:10px 14px;background:transparent;color:#66766d;font-size:12px;font-weight:750;cursor:pointer}.hlTab.active{background:#eaf4ee;color:#245e40;border-color:#d7e8dc}.hlWelcomeCard,.hlPanel{background:#fff;border:1px solid var(--line,rgba(30,60,45,.13));border-radius:16px;padding:18px;box-shadow:0 8px 24px rgba(28,60,43,.035)}.hlWelcomeCard{background:linear-gradient(125deg,#f3f8f4,#fff 70%);display:grid;gap:7px}.hlWelcomeCard .hlGreeting{font-size:clamp(20px,3vw,28px);font-weight:850;letter-spacing:-.04em;color:#204b35}.hlWelcomeCard p{margin:0;color:#718078;font-size:12px}.hlUnitPicker{display:grid;gap:5px;max-width:420px;margin-top:4px}.hlUnitPicker span{font-size:10px;font-weight:800;color:#68796f}.hlUnitPicker select{width:100%;min-height:40px;border:1px solid #dce8df;border-radius:10px;background:#fff;color:#244638;padding:8px 11px;font-size:12px;font-weight:700;outline:none}.hlUnitPicker select:focus-visible{border-color:#397c58;box-shadow:0 0 0 3px rgba(57,124,88,.14)}.hlDate{font-size:12px;color:#718078}.hlPanelHead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}.hlPanelHead h3{font-size:15px;margin:0;color:#244638}.hlPanelHead span{font-size:10px;color:#819087}.hlGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.hlMetric{padding:13px;border-radius:12px;background:#f7faf8;border:1px solid #e8efea}.hlMetric span{display:block;font-size:10px;color:#78877e}.hlMetric strong{display:block;font-size:23px;margin-top:5px;color:#244638}.hlMetric small{font-size:10px;color:#829087}.hlChart{width:100%}.hlChart svg{width:100%;height:auto;overflow:visible}.hlAxis{display:flex;justify-content:space-between;color:#87948c;font-size:9px}.hlBars{display:grid;gap:8px}.hlBarRow{display:grid;grid-template-columns:minmax(90px,1fr) 3fr 28px;gap:8px;align-items:center;font-size:10px}.hlBarTrack{height:8px;background:#edf2ee;border-radius:10px;overflow:hidden}.hlBarFill{height:100%;background:#4d9670;border-radius:10px}.hlPendingRow{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px;border:1px solid #e8efea;border-radius:10px;background:#fff;text-align:left;cursor:pointer}.hlPendingRow span{display:grid;gap:4px}.hlPendingRow b{font-size:11px;color:#315442}.hlPendingRow small{font-size:10px;color:#839087}.hlPendingRow strong{font-size:18px;color:#a45b28}.hlEmpty{padding:22px;text-align:center;color:#829087;font-size:12px}.hlAi{min-height:250px}.hlInfoFilter{display:flex;justify-content:flex-end}.hlInfoFilter label{display:grid;gap:5px;font-size:11px;font-weight:700;color:#718078}.hlInfoFilter select{min-width:240px;min-height:40px;border-radius:12px;padding:8px 12px;font-size:13px}.hlReminder{border-color:#f5c26b!important}.hlReminderRow{display:flex;gap:14px;justify-content:space-between;align-items:flex-start;padding:12px 14px;border-radius:12px;border:1px solid #f3e1b8;background:#fffaf0}.hlReminderRow small{font-size:11px;color:#8a6a2a}.hlReminderRow p{margin:4px 0 0;font-size:13px;line-height:1.5;color:#3d3220;white-space:pre-wrap}.hlReminderBtn{flex:0 0 auto;border:0;border-radius:10px;padding:9px 14px;background:#0b467a;color:#fff;font-size:12px;font-weight:700;cursor:pointer}.hlNotice{padding:11px 13px;border-radius:10px;background:#fff7e9;color:#805e2b;font-size:11px}@media(max-width:640px){.hlGrid{grid-template-columns:1fr}.hlWelcomeCard,.hlPanel{padding:14px}.hlTab{flex:1}}`}</style>
    <nav className="hlTabs" role="tablist" aria-label="Halaman Utama">{tabButton('welcome','Welcome Page')}{tabButton('infographics','Infografis')}{tabButton('achievements','Capaian Unit')}</nav>
    {tab==='welcome'&&<>
      <section className="hlWelcomeCard"><button type="button" className="hlPwBtn" onClick={()=>window.dispatchEvent(new Event('aureka-open-password'))} title="Ubah password akun Anda"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg><span>Ubah password</span></button><span className="hlGreeting">{greeting}, {firstName}</span><p>{dateLabel}</p>{scopeToRoom ? <p>{roomName||'Unit kerja belum dipetakan'} <small className="hlUnitHint">· ganti unit aktif lewat pilihan di header (kiri atas)</small></p> : <p>{roomName||'Unit kerja belum dipetakan'}</p>}</section>
      {reminders.length>0&&<section className="hlPanel hlReminder"><header className="hlPanelHead"><h3>🔔 Pengingat dari Komite PMKP</h3><span>{reminders.length} pengingat · 30 hari terakhir</span></header>
        <div className="hlBars">{reminders.map(r=><div className="hlReminderRow" key={r.id}>
          <div><small>{new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Pontianak'}).format(new Date(r.at))}</small><p>{r.body||'Buka Chat untuk membaca pesan.'}</p></div>
          <button type="button" className="hlReminderBtn" onClick={()=>window.dispatchEvent(new CustomEvent('aureka-open-support',{detail:{id:r.id}}))}>Buka &amp; balas</button>
        </div>)}</div>
      </section>}
      <section className="hlPanel"><header className="hlPanelHead"><h3>Aktivitas terakhir Anda</h3><span>{activity.lastAt?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Pontianak'}).format(new Date(activity.lastAt)):'Belum ada aktivitas tercatat'}</span></header>{activity.pending.length?<div className="hlBars">{activity.pending.map(item=><button type="button" className="hlPendingRow" key={item.module+item.label} onClick={()=>onNavigate(item.module==='Keselamatan Pasien'?'safety':item.module==='Manajemen Risiko'?'risk':'quality')}><span><b>{item.label}</b><small>{item.module}</small></span><strong>{item.count}</strong></button>)}</div>:<p className="hlEmpty">Tidak ada pekerjaan tertunda yang ditemukan pada sumber aktivitas yang terhubung.</p>}{activity.partial&&<p className="hlDate">Sebagian sumber aktivitas belum dapat dibaca. Periksa kembali modul terkait untuk memastikan daftar pekerjaan lengkap.</p>}</section>
      <section className="hlPanel hlAi"><header className="hlPanelHead"><h3>Tanya AI</h3><span>Asisten mutu dan keselamatan pasien</span></header><TanyaAureka sb={supabase} page="Halaman Utama · Welcome Page" embedded/></section>
    </>}
    {tab==='infographics'&&<>
      {error&&<div className="hlNotice">{error}</div>}
      <section className="hlPanel"><header className="hlPanelHead"><h3>Aktivitas input data bulanan</h3><span>{infoRoomName||'Unit'} · {new Date().getFullYear()}</span></header>{loading?<div className="hlEmpty">Memuat data…</div>:<LineChart values={metrics.months.map(m=>m.activity)} labels={metrics.months.map(m=>m.label)}/>}</section>
      <section className="hlPanel"><header className="hlPanelHead"><h3>Episode pasien per bulan</h3><span>Berbasis Register Pasien</span></header>{loading?<div className="hlEmpty">Memuat data…</div>:metrics.episodeRows?<LineChart values={metrics.months.map(m=>m.count)} labels={metrics.months.map(m=>m.label)}/>:<div className="hlEmpty">Belum ada episode pasien pada pilihan unit ini. Aktivitas input unit tetap ditampilkan pada grafik di atas.</div>}</section>
      <div className="hlGrid"><section className="hlPanel"><header className="hlPanelHead"><h3>Indikator episode pasien</h3></header><div className="hlMetric"><span>Rawat inap tanpa tanggal keluar*</span><strong>{metrics.active===null?'—':metrics.active.toLocaleString('id-ID')}</strong><small>*Hanya episode dengan field tanggal keluar; bukan sensus bed aktif.</small></div><div className="hlMetric" style={{marginTop:8}}><span>Rata-rata Length of Stay</span><strong>{metrics.averageLos===null?'—':metrics.averageLos.toLocaleString('id-ID',{maximumFractionDigits:1})+' hari'}</strong><small>{metrics.losCount} episode dengan data LOS</small></div></section>
      <section className="hlPanel"><header className="hlPanelHead"><h3>Diagnosis terbanyak (kode ICD-10 bila tersedia)</h3></header>{metrics.aggregateOnly?<div className="hlEmpty">Pilih satu unit di atas untuk melihat diagnosis terbanyak, lama rawat, dan pasien yang masih dirawat.</div>:metrics.topDiagnoses.length?<div className="hlBars">{metrics.topDiagnoses.map(item=><div className="hlBarRow" key={item.code+item.diagnosis}><span title={item.diagnosis}>{item.code==='Belum berkode'?item.diagnosis:item.code}</span><div className="hlBarTrack"><div className="hlBarFill" style={{width:(item.count/metrics.topDiagnoses[0].count*100)+'%'}}/></div><b>{item.count}</b></div>)}</div>:<div className="hlEmpty">Belum tersedia kode ICD-10 terstruktur pada episode pasien.</div>}</section></div>
      <p className="hlDate">Data mengikuti pilihan unit dan tahun berjalan. Episode terbuka tidak boleh ditafsirkan sebagai jumlah bed terisi tanpa integrasi sensus tempat tidur.</p>
    </>}
    {tab==='achievements'&&<>
      <nav className="hlTabs hlAchievementTabs" role="tablist" aria-label="Capaian Unit">
        {([['overview','Ikhtisar'],['indicators','Indikator Mutu'],['safety','Keselamatan Pasien'],['risk','Manajemen Risiko']] as const).map(([id,label])=><button key={id} type="button" role="tab" aria-selected={achievementTab===id} className={achievementTab===id?'hlTab active':'hlTab'} onClick={()=>setAchievementTab(id)}>{label}</button>)}
      </nav>
      {achievementTab==='overview'&&<OverviewDashboard supabase={supabase} role={role??(manager?'MANAGEMENT':'PIC')} roomId={scopeToRoom?roomId:(manager?null:roomId)} roomName={roomName} manager={manager&&!scopeToRoom} userName={userName} onNavigate={onNavigate}/>}
      {achievementTab==='indicators'&&<QualityResultsWorkspace key={'home-unit-indicators-'+String(scopeToRoom?roomId:'all')} mode="indicators" initialRoomId={scopeToRoom?roomId:(manager?null:roomId)} rooms={rooms} canViewAllRooms={manager&&!scopeToRoom} lockRoomScope={scopeToRoom}/>}
      {achievementTab==='safety'&&<PatientSafetyWorkspace key={'home-unit-safety-'+String(scopeToRoom?roomId:'all')} supabase={supabase} rooms={rooms} initialRoomId={scopeToRoom?roomId:(manager?null:roomId)} scopeRoomId={scopeToRoom?roomId:null} isSuperAdmin={isAdmin} canManageWorkflow={manager} initialTab="overview" showTabs={false}/>}
      {achievementTab==='risk'&&<RiskManagementWorkspace key={'home-unit-risk-'+String(scopeToRoom?roomId:'all')} supabase={supabase} rooms={rooms} initialRoomId={scopeToRoom?roomId:(manager?null:roomId)} lockRoomScope={scopeToRoom} role={role} userId={userId} userName={userName} initialTab="overview" showTabs={false}/>}
    </>}
  </section>
}
