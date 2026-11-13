'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { NavigateFn } from '@/lib/aureka/focus'
import TanyaAureka from '@/components/TanyaAureka'
import InfographicsDashboard from '@/components/governance/InfographicsDashboard'
import QualityReportingMonitor from '@/components/QualityReportingMonitor'
import HomeKpis from '@/components/HomeKpis'
import { fetchRoomMonthCounts, type RoomMonthCount } from '@/lib/aureka/quality-counts'

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
  onRoomChange?: (roomId: number | null) => void
  onNavigate: NavigateFn
  onReminderRead?: () => void
  initialTab?: 'welcome' | 'infographics'
  onTabChange?: (tab: 'welcome' | 'infographics') => void
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
type InfographicPoint = { label: string; value: number }
type InfographicChartType = 'line' | 'area' | 'bar' | 'doughnut'
function InfographicChart({ data, type, category = false, unit = '' }: { data: InfographicPoint[]; type: InfographicChartType; category?: boolean; unit?: string }) {
  const colors = ['#16507A','#4f8cba','#d29a43','#8a75b8','#4f9b91','#c47777']
  const max = Math.max(1, ...data.map(point => point.value))
  const total = data.reduce((sum, point) => sum + point.value, 0)
  if (type === 'doughnut') {
    const radius = 78
    const circumference = 2 * Math.PI * radius
    let offset = 0
    return <div className="hlDonutLayout">
      <svg viewBox="0 0 250 250" role="img" aria-label="Komposisi data berdasarkan kategori">
        <circle cx="125" cy="125" r={radius} fill="none" stroke="#edf2ee" strokeWidth="24"/>
        {data.map((point, index) => {
          const length = total > 0 ? (point.value / total) * circumference : 0
          const circle = <circle key={point.label} cx="125" cy="125" r={radius} fill="none" stroke={colors[index % colors.length]} strokeWidth="24" strokeDasharray={`${length} ${circumference - length}`} strokeDashoffset={-offset} transform="rotate(-90 125 125)"><title>{point.label}: {point.value.toLocaleString('id-ID')}</title></circle>
          offset += length
          return circle
        })}
        <text x="125" y="119" textAnchor="middle" fill="#6f8176" fontSize="11">Total</text>
        <text x="125" y="143" textAnchor="middle" fill="#102A43" fontSize="23" fontWeight="700">{total.toLocaleString('id-ID')}</text>
      </svg>
      <div className="hlDonutLegend">{data.map((point,index)=><div className="hlLegendItem" key={point.label}><i style={{background:colors[index % colors.length]}}/><span title={point.label}>{point.label}</span><b>{point.value.toLocaleString('id-ID')}</b></div>)}</div>
    </div>
  }
  if (category) {
    const rowHeight = 42
    const height = Math.max(190, data.length * rowHeight + 28)
    return <div className="hlChart"><svg viewBox={`0 0 760 ${height}`} role="img" aria-label="Perbandingan kategori" preserveAspectRatio="xMidYMid meet">
      {data.map((point,index)=>{
        const y=14+index*rowHeight
        const width=(Math.max(0,point.value)/max)*480
        return <g key={point.label}>
          <text x="8" y={y+17} fill="#40576B" fontSize="12">{point.label.length>23?point.label.slice(0,22)+'…':point.label}</text>
          <rect x="190" y={y+3} width="480" height="16" rx="8" fill="#edf2ee"/>
          <rect x="190" y={y+3} width={width} height="16" rx="8" fill={colors[index % colors.length]}/>
          <text x="684" y={y+17} fill="#40576B" fontSize="12" fontWeight="650">{point.value.toLocaleString('id-ID')}</text>
          <title>{point.label}: {point.value.toLocaleString('id-ID')} {unit}</title>
        </g>
      })}
    </svg></div>
  }
  const width=760, left=54, right=738, top=22, bottom=242
  const xAt=(index:number)=>left+index*((right-left)/Math.max(1,data.length-1))
  const yAt=(value:number)=>bottom-(Math.max(0,value)/max)*(bottom-top)
  const points=data.map((point,index)=>`${xAt(index)},${yAt(point.value)}`).join(' ')
  const ticks=[max,max*0.75,max*0.5,max*0.25,0]
  const barWidth=Math.min(34,Math.max(12,(right-left)/Math.max(1,data.length)*0.58))
  const areaPath=data.length? `M ${xAt(0)} ${bottom} L ${data.map((point,index)=>`${xAt(index)} ${yAt(point.value)}`).join(' L ')} L ${xAt(data.length-1)} ${bottom} Z`:''
  return <div className="hlChart"><svg viewBox={`0 0 ${width} 292`} role="img" aria-label={type==='line'?'Tren data bulanan':type==='area'?'Area tren data bulanan':'Grafik batang data bulanan'} preserveAspectRatio="xMidYMid meet">
    {ticks.map((tick,index)=>{const y=top+index*((bottom-top)/4);return <g key={index}><line x1={left} y1={y} x2={right} y2={y} stroke={index===4?'#d9e4dd':'#edf2ee'}/><text x="43" y={y+4} textAnchor="end" fill="#7B8FA3" fontSize="10">{Math.round(tick).toLocaleString('id-ID')}</text></g>})}
    {type==='area'&&<path d={areaPath} fill="#16507A" fillOpacity=".12"/>}
    {type==='bar'&&data.map((point,index)=>{const y=yAt(point.value);return <g key={point.label}><rect x={xAt(index)-barWidth/2} y={y} width={barWidth} height={bottom-y} rx="5" fill="#2D6E9E"><title>{point.label}: {point.value.toLocaleString('id-ID')} {unit}</title></rect></g>})}
    {type!=='bar'&&data.length>1&&<polyline points={points} fill="none" stroke="#16507A" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>}
    {type!=='bar'&&type!=='area'&&data.map((point,index)=><circle key={point.label} cx={xAt(index)} cy={yAt(point.value)} r="4" fill="#fff" stroke="#16507A" strokeWidth="2.5"><title>{point.label}: {point.value.toLocaleString('id-ID')} {unit}</title></circle>)}
    {data.map((point,index)=><text key={point.label} x={xAt(index)} y="268" textAnchor="middle" fill="#62788B" fontSize="10">{point.label}</text>)}
  </svg></div>
}

// Simpan sementara data per unit 10 menit: membuka ulang Infografis tidak menarik ulang ribuan baris.
const unitRecordCache=new Map<string,{at:number;rows:RecordRow[]}>()
type UnitStats={allowed?:boolean;episodes:number;active:number;avg_los:number|null;los_count:number;months:{month:number;count:number}[];top:{code:string;diagnosis:string;count:number}[]}

export default function HomeLandingWorkspace({supabase,userName,userId,rooms,role,isAdmin,roomId,roomName,manager,scopeToRoom=false,selectedRoomId,onRoomChange,onNavigate,onReminderRead,initialTab='welcome',onTabChange}:Props) {
  const [tab,setTab] = useState<'welcome'|'infographics'>(initialTab)
  useEffect(()=>setTab(initialTab),[initialTab])
  const [records,setRecords] = useState<RecordRow[]>([])
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  const [refreshedAt,setRefreshedAt] = useState<Date|null>(null)
  const [countRows,setCountRows] = useState<RoomMonthCount[]|null>(null)
  const [unitStats,setUnitStats] = useState<UnitStats|null>(null)
  const [infoYear,setInfoYear] = useState(String(new Date().getFullYear()))
  const [infoMetric,setInfoMetric] = useState<'activity'|'episodes'|'diagnosis'|'avg_los'|'active'>('activity')
  const [infoChart,setInfoChart] = useState<InfographicChartType>('line')
  // Pengingat aktif hanya ditampilkan sampai pengguna menandainya sudah dibaca.
  // Status baca disimpan per akun di database; pesan asli pada Chat Komite PMKP tetap utuh.
  const [reminders,setReminders] = useState<{id:string;at:string;body:string}[]>([])
  const [reminderSaving,setReminderSaving] = useState<string|null>(null)
  useEffect(()=>{
    if(manager||roomId==null||!userId){setReminders([]);return}
    let cancelled=false
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
  // PMKP/manajemen tetap dapat memilih Semua Unit di Infografis; Super Admin mengikuti unit global.
  const [infoRoom,setInfoRoom] = useState<string>(manager?'':String(roomId??''))
  const infoRoomId = infoRoom?Number(infoRoom):null
  const infoRoomName = infoRoomId?(rooms.find(r=>Number(r.id)===infoRoomId)?.name??roomName):(manager?'Semua unit':roomName)
  const [activity,setActivity] = useState<{lastAt:string|null;pending:{label:string;count:number;module:string}[];partial:boolean}>({lastAt:null,pending:[],partial:false})
  const firstName = userName.trim().split(/\s+/)[0] || 'Pengguna'
  const greeting = (() => { const h=Number(new Intl.DateTimeFormat('en-US',{hour:'2-digit',hour12:false,timeZone:'Asia/Pontianak'}).format(new Date())); return h<4?'Selamat malam':h<11?'Selamat pagi':h<15?'Selamat siang':h<18?'Selamat sore':'Selamat malam' })()
  const dateLabel = new Intl.DateTimeFormat('id-ID',{weekday:'long',day:'2-digit',month:'long',year:'numeric',timeZone:'Asia/Pontianak'}).format(new Date())
  useEffect(() => {
    let cancelled=false
    if(tab!=='infographics'){setLoading(false);return}
    if(!infoRoomId&&!manager){setRecords([]);setError('Unit kerja belum terhubung ke akun ini.');return}
    setLoading(true);setError('')
    const year=Number(infoYear)
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
  },[supabase,infoRoomId,manager,infoYear,tab])
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
    const months=Array.from({length:12},(_,i)=>({key:`${infoYear}-${String(i+1).padStart(2,'0')}`,label:MONTHS[i],count:0,activity:0}))
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
  },[records,countRows,unitStats,infoYear])
  const infographic = useMemo(() => {
    if(infoMetric==='activity') return {title:'Aktivitas input data',description:'Jumlah catatan mutu yang masuk setiap bulan.',unit:'catatan',kind:'monthly' as const,data:metrics.months.map(m=>({label:m.label,value:m.activity})),available:true}
    if(infoMetric==='episodes') return {title:'Episode pasien',description:'Jumlah episode pasien berdasarkan Register Pasien.',unit:'episode',kind:'monthly' as const,data:metrics.months.map(m=>({label:m.label,value:m.count})),available:metrics.episodeRows>0}
    if(infoMetric==='diagnosis') return {title:'Distribusi diagnosis',description:'Enam diagnosis teratas pada unit terpilih; menggunakan kode ICD-10 bila tersedia.',unit:'kasus',kind:'category' as const,data:metrics.topDiagnoses.map(d=>({label:d.code==='Belum berkode'?d.diagnosis:d.code,value:d.count})),available:!metrics.aggregateOnly&&metrics.topDiagnoses.length>0}
    if(infoMetric==='avg_los') return {title:'Rata-rata Length of Stay',description:'Rata-rata lama rawat dari episode dengan data masuk dan keluar yang dapat dihitung.',unit:'hari',kind:'single' as const,data:metrics.averageLos==null?[]:[{label:'Rata-rata LOS',value:metrics.averageLos}],available:metrics.averageLos!=null}
    return {title:'Episode rawat inap terbuka',description:'Episode yang memiliki field tanggal keluar tetapi belum memiliki tanggal keluar. Bukan sensus bed terisi.',unit:'episode',kind:'single' as const,data:metrics.active==null?[]:[{label:'Episode terbuka',value:metrics.active}],available:metrics.active!=null}
  },[metrics,infoMetric])
  const chartOptions:InfographicChartType[] = infographic.kind==='category'?['bar','doughnut']:infographic.kind==='single'?['bar']:['line','area','bar']
  const effectiveChart:InfographicChartType = chartOptions.includes(infoChart)?infoChart:chartOptions[0]
  const infographicTotal=infographic.data.reduce((sum,p)=>sum+p.value,0)
  const infographicAverage=infographic.data.length?infographicTotal/infographic.data.length:0
  const infographicPeak=infographic.data.reduce((best,p)=>p.value>best.value?p:best,{label:'-',value:0})
  const tabButton=(id:typeof tab,label:string)=><button type="button" role="tab" aria-selected={tab===id} aria-controls={`home-panel-${id}`} className={tab===id?'hlTab active':'hlTab'} onClick={()=>{setTab(id);onTabChange?.(id)}}>{label}</button>
  return <section className="homeLanding">
    <style>{`
      .homeLanding{display:grid;gap:16px;color:var(--ink,#102A43)}.hlExplorer{display:grid;gap:18px}.hlExplorerHead,.hlVisualizationHead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.hlExplorerHead h3,.hlVisualizationHead h4{margin:0;color:#102A43;font-size:16px;font-weight:750}.hlExplorerHead p,.hlVisualizationHead p{margin:4px 0 0;color:#7b8981;font-size:12px;line-height:1.5}.hlDataScope{padding:6px 10px;border-radius:8px;background:#EFF5FA;color:#16507A;font-size:11px;font-weight:700;white-space:nowrap}.hlFilterGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.hlFilterGrid label{display:grid;gap:6px;min-width:0}.hlFilterGrid label>span{font-size:11px;font-weight:750;color:#536B80}.hlFilterGrid select{width:100%;min-width:0;min-height:42px;border:1px solid #D7E2EB;border-radius:9px;background:#fff;color:#102A43;padding:8px 32px 8px 11px;font-size:12px;font-weight:650}.hlSummaryGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.hlSummaryMetric{min-width:0;padding:13px 15px;border:1px solid #E6EDF3;border-radius:10px;background:#f8faf8}.hlSummaryMetric span,.hlSummaryMetric small{display:block;color:#62788B;font-size:11px;line-height:1.4}.hlSummaryMetric strong{display:block;margin:5px 0 2px;color:#102A43;font-size:22px;line-height:1.15;font-weight:800;overflow-wrap:anywhere}.hlVisualizationHead{padding-top:4px;border-top:1px solid #edf2ee}.hlVisualizationHead h4{font-size:15px}.hlVisualizationHead>span{color:#7B8FA3;font-size:11px;white-space:nowrap}.hlDonutLayout{display:grid;grid-template-columns:minmax(220px,300px) minmax(0,1fr);align-items:center;gap:22px;max-width:760px;margin:0 auto}.hlDonutLayout svg{width:100%;height:auto;max-height:260px}.hlDonutLegend{display:grid;gap:9px;min-width:0}.hlLegendItem{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:9px;align-items:center;font-size:11px;color:#536B80}.hlLegendItem i{width:9px;height:9px;border-radius:50%}.hlLegendItem span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.hlLegendItem b{color:#203447;font-size:11px;font-variant-numeric:tabular-nums}.hlTabs{display:flex;gap:7px;flex-wrap:wrap;border-bottom:1px solid var(--line,rgba(30,60,45,.14));padding-bottom:10px}.hlTab{border:1px solid transparent;border-radius:10px;padding:10px 14px;background:transparent;color:#66766d;font-size:12px;font-weight:750;cursor:pointer}.hlTab.active{background:#E3EFF8;color:#16507A;border-color:#C8DCEB}.hlWelcomeCard,.hlPanel{background:#fff;border:1px solid var(--line,rgba(30,60,45,.13));border-radius:16px;padding:18px;box-shadow:0 8px 24px rgba(28,60,43,.035)}.hlWelcomeCard{background:linear-gradient(125deg,#F3F7FA,#fff 70%);display:grid;gap:7px}.hlWelcomeCard .hlGreeting{font-size:clamp(20px,3vw,28px);font-weight:850;letter-spacing:-.04em;color:#102A43}.hlWelcomeCard p{margin:0;color:#62788B;font-size:12px}.hlUnitPicker{display:grid;gap:5px;max-width:420px;margin-top:4px}.hlUnitPicker span{font-size:11px;font-weight:800;color:#536B80}.hlUnitPicker select{width:100%;min-height:40px;border:1px solid #D7E2EB;border-radius:10px;background:#fff;color:#102A43;padding:8px 11px;font-size:12px;font-weight:700;outline:none}.hlUnitPicker select:focus-visible{border-color:#2D6E9E;box-shadow:0 0 0 3px rgba(57,124,88,.14)}.hlDate{font-size:12px;color:#62788B}.hlPanelHead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}.hlPanelHead h3{font-size:15px;margin:0;color:#102A43}.hlPanelHead span{font-size:11px;color:#819087}.hlGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.hlMetric{padding:13px;border-radius:12px;background:#F7FAFC;border:1px solid #E6EDF3}.hlMetric span{display:block;font-size:11px;color:#62788B}.hlMetric strong{display:block;font-size:23px;margin-top:5px;color:#102A43}.hlMetric small{font-size:11px;color:#7B8FA3}.hlChart{width:100%}.hlChart svg{width:100%;height:auto;overflow:visible}.hlAxis{display:flex;justify-content:space-between;color:#7B8FA3;font-size:11px}.hlBars{display:grid;gap:8px}.hlBarRow{display:grid;grid-template-columns:minmax(90px,1fr) 3fr 28px;gap:8px;align-items:center;font-size:11px}.hlBarTrack{height:8px;background:#edf2ee;border-radius:10px;overflow:hidden}.hlBarFill{height:100%;background:#2D6E9E;border-radius:10px}.hlPendingRow{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:11px;border:1px solid #E6EDF3;border-radius:10px;background:#fff;text-align:left;cursor:pointer}.hlPendingRow span{display:grid;gap:4px}.hlPendingRow b{font-size:11px;color:#315442}.hlPendingRow small{font-size:11px;color:#839087}.hlPendingRow strong{font-size:18px;color:#a45b28}.hlEmpty{padding:22px;text-align:center;color:#7B8FA3;font-size:12px}.hlAi{min-height:250px}.hlInfoFilter{display:flex;justify-content:flex-end}.hlInfoFilter label{display:grid;gap:5px;font-size:11px;font-weight:700;color:#62788B}.hlInfoFilter select{min-width:240px;min-height:40px;border-radius:12px;padding:8px 12px;font-size:13px}.hlReminder{border-color:#f5c26b!important}.hlReminderRow{display:flex;gap:14px;justify-content:space-between;align-items:flex-start;padding:12px 14px;border-radius:12px;border:1px solid #f3e1b8;background:#fffaf0}.hlReminderRow small{font-size:11px;color:#8a6a2a}.hlReminderRow p{margin:4px 0 0;font-size:13px;line-height:1.5;color:#3d3220;white-space:pre-wrap}.hlReminderActions{display:flex;flex:0 0 auto;gap:8px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.hlReminderBtn{flex:0 0 auto;border:0;border-radius:10px;padding:9px 14px;background:#0b467a;color:#fff;font-size:12px;font-weight:700;cursor:pointer}.hlReminderReadBtn{flex:0 0 auto;border:1px solid #d8e1e8;border-radius:10px;padding:8px 12px;background:#fff;color:#40556a;font-size:12px;font-weight:700;cursor:pointer}.hlReminderReadBtn:disabled{opacity:.6;cursor:wait}.hlNotice{padding:11px 13px;border-radius:10px;background:#fff7e9;color:#805e2b;font-size:11px}@media(max-width:1000px){.hlFilterGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.hlDonutLayout{grid-template-columns:minmax(180px,240px) minmax(0,1fr)}}@media(max-width:640px){.hlFilterGrid,.hlSummaryGrid{grid-template-columns:1fr}.hlExplorerHead,.hlVisualizationHead{display:grid}.hlDataScope,.hlVisualizationHead>span{justify-self:start}.hlDonutLayout{grid-template-columns:1fr}.hlDonutLayout svg{max-width:250px;margin:auto}.hlGrid{grid-template-columns:1fr}.hlWelcomeCard,.hlPanel{padding:14px}.hlTab{flex:1}}`}</style>
    <nav className="hlTabs hlTabsHidden" role="tablist" aria-label="Navigasi Beranda">{tabButton('welcome','Beranda')}{tabButton('infographics','Infografis')}</nav>
    {tab==='welcome'&&<div id="home-panel-welcome" role="tabpanel">
      <section className="hlWelcomeCard hlAuroraHero"><div className="hlHeroText"><span className="hlHeroEyebrow">0° Khatulistiwa · {dateLabel}</span><span className="hlGreeting">{greeting}, <span className="hlGreetName">{firstName}</span></span><span className="hlHeroSub">RSUD Sultan Syarif Mohamad Alkadrie · {roomName||'Unit kerja belum dipetakan'}</span>{scopeToRoom&&<small className="hlUnitHint">Ganti unit aktif lewat pilihan di kiri atas</small>}</div><div className="hlHeroActions"><button type="button" className="hlHeroBtn" onClick={()=>onNavigate('safety',{tab:'incidents'})}>Lapor insiden</button><button type="button" className="hlHeroBtn primary" onClick={()=>onNavigate('quality')}>Isi logbook</button><button type="button" className="hlPwBtn" onClick={()=>window.dispatchEvent(new Event('aureka-open-password'))} title="Ubah password akun Anda"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg><span>Ubah password</span></button></div></section>
      {reminders.length>0&&<section className="hlPanel hlReminder" role="region" aria-label="Pengingat dari Komite PMKP"><header className="hlReminderHead"><span className="hlReminderIcon" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z"/><path d="M10 20a2 2 0 0 0 4 0"/></svg></span><div><h3>Pengingat dari Komite PMKP</h3><span>{reminders.length} belum dibaca · 30 hari terakhir</span></div></header>
        <div className="hlBars">{reminders.map(r=><div className="hlReminderRow" key={r.id}>
          <div><small>{new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Pontianak'}).format(new Date(r.at))}</small><p>{r.body||'Buka Chat untuk membaca pesan.'}</p></div>
          <div className="hlReminderActions">
            <button type="button" className="hlReminderBtn" onClick={()=>window.dispatchEvent(new CustomEvent('aureka-open-support',{detail:{id:r.id}}))}>Buka &amp; balas</button>
            <button type="button" className="hlReminderReadBtn" disabled={reminderSaving===r.id} onClick={()=>void markReminderRead(r.id)}>{reminderSaving===r.id?'Menyimpan…':'Tandai sudah dibaca'}</button>
          </div>
        </div>)}</div>
      </section>}
      <HomeKpis supabase={supabase} rooms={rooms} isAdmin={isAdmin} roomId={roomId} showSafety={isAdmin||manager}/>
      <div className="hlDuo"><QualityReportingMonitor supabase={supabase} rooms={rooms} isAdmin={isAdmin} roomId={roomId} roomName={roomName}/><section className="hlPanel hlAi" aria-label="Tanya AUREKA"><TanyaAureka sb={supabase} page="Beranda" embedded/></section></div>
      <section className="hlPanel"><header className="hlPanelHead"><h3>Aktivitas terakhir Anda</h3><span>{activity.lastAt?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Pontianak'}).format(new Date(activity.lastAt)):'Belum ada aktivitas tercatat'}</span></header>{activity.pending.length?<div className="hlBars">{activity.pending.map(item=><button type="button" className="hlPendingRow" key={item.module+item.label} onClick={()=>onNavigate(item.module==='Keselamatan Pasien'?'safety':item.module==='Manajemen Risiko'?'risk':'quality')}><span><b>{item.label}</b><small>{item.module}</small></span><strong>{item.count}</strong></button>)}</div>:<p className="hlEmpty">Tidak ada pekerjaan tertunda yang ditemukan pada sumber aktivitas yang terhubung.</p>}{activity.partial&&<p className="hlDate">Sebagian sumber aktivitas belum dapat dibaca. Periksa kembali modul terkait untuk memastikan daftar pekerjaan lengkap.</p>}</section>
    </div>}
    {tab==='infographics'&&<div id="home-panel-infographics" role="tabpanel">
      <InfographicsDashboard
        mode="full"
        rooms={rooms}
        role={role}
        initialRoomId={isAdmin ? (selectedRoomId ?? roomId) : (manager || role==='DEWAN_PENGAWAS' ? null : roomId)}
        unitLocked={!['ADMIN','PMKP','MANAGEMENT','DIREKTUR','DEWAN_PENGAWAS'].includes(role || '')}
        onNavigate={onNavigate}
        onRoomChange={onRoomChange}
      />
    </div>}
  </section>
}
