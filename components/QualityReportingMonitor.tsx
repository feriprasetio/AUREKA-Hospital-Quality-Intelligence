'use client'
import {Fragment,useEffect,useMemo,useState} from 'react'
import AsyncStatePanel from '@/components/AsyncStatePanel'
import ContinuumSummary from '@/components/workspace/ContinuumSummary'
import WorkspaceTableViewport from '@/components/workspace/WorkspaceTableViewport'
import type {SupabaseClient} from '@supabase/supabase-js'
import { readAurekaQualityRoomReportingStatus, type QualityRoomReportingRow } from '@/lib/aureka/metric-contracts'

type Room={id:number;name:string}
type Row=QualityRoomReportingRow
const MONTHS=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
export default function QualityReportingMonitor({supabase,rooms,isAdmin,roomId,roomName,dataFirst=false}:{supabase:SupabaseClient;rooms:Room[];isAdmin:boolean;roomId:number|null;roomName:string|null;dataFirst?:boolean}){
 const [calendarPeriod]=useState(()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Pontianak',year:'numeric',month:'2-digit'}).format(new Date()))
 const [currentYear,currentMonth]=calendarPeriod.split('-').map(Number)
 const [year,setYear]=useState(currentYear)
 const [reload,setReload]=useState(0)
 const [loadedYear,setLoadedYear]=useState<number|null>(null)
 const [rows,setRows]=useState<Row[]>([])
 const [loading,setBusy]=useState(true)
 const busy=loading||loadedYear!==year
 const [error,setError]=useState('')
 const [expanded,setExpanded]=useState(false)
 useEffect(()=>{let cancelled=false;setBusy(true);setError('');setRows([])
  void (async()=>{
   const result=await readAurekaQualityRoomReportingStatus(supabase,year)
   if(cancelled)return
   if(result.status!=='complete'||!result.data)setError('Ringkasan belum tersedia. Pastikan sumber monitoring pelaporan indikator mutu dapat diakses.')
   else setRows(result.data)
   setLoadedYear(year);setBusy(false)
  })().catch(()=>{
   if(!cancelled){setError('Ringkasan belum tersedia. Periksa koneksi dan hak akses.');setLoadedYear(year);setBusy(false)}
  })
  return()=>{cancelled=true}
 },[supabase,year,reload])
 const visibleRooms=useMemo(()=>roomId!=null?rooms.filter(r=>Number(r.id)===Number(roomId)):isAdmin?rooms:[],[rooms,isAdmin,roomId])
 const sortedRooms=useMemo(()=>[...visibleRooms].sort((a,b)=>a.name.localeCompare(b.name,'id')),[visibleRooms])
 const [showAll,setShowAll]=useState(false)
 const LIMIT=5
 const shownRooms=showAll?sortedRooms:sortedRooms.slice(0,LIMIT)
 const reportsByRoom=useMemo(()=>{
  const reports=new Map<number,Row[]>()
  for(const row of rows){
   if(row.total<=0)continue
   const group=reports.get(row.room_id)
   if(group)group.push(row)
   else reports.set(row.room_id,[row])
  }
  return reports
 },[rows])
 const byRoom=(id:number)=>reportsByRoom.get(Number(id))??[]
 const latest=(id:number)=>byRoom(id).reduce<Row|null>((best,r)=>!best||String(r.latest_report_at||'')>String(best.latest_report_at||'')?r:best,null)
 const date=(v:string|null|undefined)=>{
  const value=v?new Date(v):null
  return value&&!Number.isNaN(value.getTime())?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Pontianak'}).format(value):'Belum ada laporan'
 }
 const period=(v:string|null|undefined)=>{
  const value=v?new Date(v.slice(0,10)+'T12:00:00+07:00'):null
  return value&&!Number.isNaN(value.getTime())?new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric',timeZone:'Asia/Pontianak'}).format(value):'Belum ada periode'
 }
 const nowMonth=year===currentYear?currentMonth:0
 const reportedThisMonth=sortedRooms.filter(room=>byRoom(room.id).some(r=>r.month===nowMonth)).length
 const ready=!busy&&!error&&sortedRooms.length>0
 return <section className="hlPanel hlReportingPanel" aria-label="Monitoring pelaporan indikator mutu">
  <style>{`.hlReportingPanel{display:grid;gap:14px}
.hlReportingPanel .hlPanelHead{margin:0;align-items:baseline}
.hlRepLink{border:0;background:none;padding:6px 2px;color:#0e7490;font-family:inherit;font-size:13px;font-weight:700;cursor:pointer;text-decoration:underline;text-underline-offset:3px}
html[data-mode="gelap"] .hlRepLink{color:#67e8f9}
.hlRepSummary{display:flex;align-items:center;gap:14px;flex-wrap:wrap}
.hlRepSummary strong{font-size:22px;line-height:1;color:#0f2a44;font-variant-numeric:tabular-nums}
.hlRepSummary p{margin:0;color:#4a6378;font-size:13px}
.hlRepBar{flex:1 1 180px;max-width:320px;height:8px;border-radius:99px;background:#e4ecf3;overflow:hidden}
.hlRepBar i{display:block;height:100%;border-radius:inherit;background:#2877b4;transition:width .4s cubic-bezier(.23,1,.32,1)}
.hlReportingChartWrap{overflow-x:auto}
.hlReportingMatrix{min-width:560px;display:grid;grid-template-columns:minmax(150px,220px) repeat(12,minmax(26px,1fr));align-items:center;gap:3px 4px}
.hlReportingCorner{font-size:12px;font-weight:600;color:#647b8f;padding:0 6px 4px}
.hlReportingMonth{font-size:12px;font-weight:600;color:#647b8f;text-align:center;padding-bottom:4px}
.hlReportingMonth.now{color:#0f2a44;font-weight:800}
.hlReportingRoom{min-width:0}
.hlReportingRoom button{display:block;border:0;background:transparent;text-align:left;padding:3px 6px;color:#29465e;font-size:12px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;cursor:pointer;border-radius:6px;font-family:inherit}
.hlReportingRoom button:hover{background:#edf5fb}
.hlReportingCell{height:20px;border-radius:5px;background:#e9eff5;display:flex;align-items:center;justify-content:center}
.hlReportingCell.future{background:transparent;border:1px dashed #dbe5ee}
.hlReportingCell.hasData{background:#2877b4}
.hlReportingCell span{font-size:12px;color:#fff;font-weight:800;line-height:1}
.hlReportingLegend{display:flex;align-items:center;gap:14px;flex-wrap:wrap;color:#61788c;font-size:12px}
.hlReportingLegend span{display:flex;align-items:center;gap:6px}
.hlReportingLegend i{width:12px;height:12px;border-radius:3px;background:#e9eff5}
.hlReportingLegend i.hasData{background:#2877b4}
.hlRepActions{margin-left:auto;display:flex;align-items:center;gap:8px;flex-wrap:wrap}.hlRepActions label{display:flex;align-items:center;gap:6px;font-size:12px}.hlRepActions select{min-height:36px;padding:0 8px;color:inherit;background:var(--field-bg,transparent);border:1px solid var(--line);border-radius:9px}
.hlReportingDetailBtn{border:1px solid #cbddea;border-radius:10px;background:#fff;color:#16507a;min-height:36px;padding:0 12px;font-family:inherit;font-size:12px;font-weight:600;line-height:1;cursor:pointer}
.hlReportingDetailBtn:hover{background:#f2f7fb}
.hlReportingTableWrap{overflow:auto;border:1px solid #e1eaf1;border-radius:10px}
.hlReportingTableTitle{padding:10px 12px;background:#f4f8fb;color:#24445f;font-size:12px;font-weight:700}
.hlReportingTable{width:100%;min-width:720px;border-collapse:collapse;font-size:12px}
.hlReportingTable th,.hlReportingTable td{padding:9px 11px;border-top:1px solid #e7edf2;text-align:left;vertical-align:top}
.hlReportingTable th{background:#f9fbfd;color:#667d90;font-size:12px}
.hlReportingStatus{display:inline-block;padding:4px 8px;border-radius:20px;background:#f0f2f4;color:#6f7c86;font-size:12px;font-weight:700}
.hlReportingStatus.reported{background:#e4f2ea;color:#26734c}
html[data-mode="gelap"] .hlRepSummary strong{color:#f1f5f9}
html[data-mode="gelap"] .hlRepSummary p,html[data-mode="gelap"] .hlReportingLegend{color:#b9c3d6}
html[data-mode="gelap"] .hlRepBar{background:rgba(148,163,184,.18)}
html[data-mode="gelap"] :is(.hlRepBar i,.hlReportingCell.hasData,.hlReportingLegend i.hasData){background:#3b82c4}
html[data-mode="gelap"] :is(.hlReportingCorner,.hlReportingMonth){color:#94a3b8}
html[data-mode="gelap"] .hlReportingMonth.now{color:#f1f5f9}
html[data-mode="gelap"] .hlReportingRoom button{color:#cbd5e1}
html[data-mode="gelap"] .hlReportingRoom button:hover{background:rgba(148,163,184,.12)}
html[data-mode="gelap"] :is(.hlReportingCell,.hlReportingLegend i){background:rgba(148,163,184,.14)}
html[data-mode="gelap"] .hlReportingCell.future{background:transparent;border-color:rgba(148,163,184,.18)}
html[data-mode="gelap"] .hlReportingDetailBtn{background:rgba(30,41,59,.8);border-color:rgba(148,163,184,.25);color:#cbd5e1}
html[data-mode="gelap"] .hlReportingTableWrap{border-color:rgba(148,163,184,.18)}
html[data-mode="gelap"] :is(.hlReportingTableTitle,.hlReportingTable th){background:rgba(30,41,59,.8);color:#cbd5e1}
html[data-mode="gelap"] .hlReportingTable td{color:#e2e8f0;border-color:rgba(148,163,184,.14)}
@media(max-width:640px){.hlRepActions{margin-left:0}}
@media(prefers-reduced-motion:reduce){.hlRepBar i{transition:none}}
`}</style>
  <header className="hlPanelHead">
   <div><h3>Pelaporan indikator {year}</h3><span>{ready&&nowMonth?`${reportedThisMonth} dari ${sortedRooms.length} ruangan lapor ${MONTHS[nowMonth-1]}`:roomId!=null?(roomName||'Ruangan terpilih'):isAdmin?'Seluruh rumah sakit':'Ruangan saya'}</span></div>
   <div className="hlRepActions">
    <label>Tahun <select aria-label="Tahun monitoring pelaporan" value={year} onChange={event=>setYear(Number(event.target.value))}>{Array.from({length:Math.max(1,currentYear-2023)},(_,index)=>currentYear-index).map(value=><option key={value}>{value}</option>)}</select></label>
    {!dataFirst&&ready&&sortedRooms.length>LIMIT&&<button type="button" className="hlRepLink" onClick={()=>setShowAll(v=>!v)}>{showAll?'Ringkas':`Lihat ${sortedRooms.length} ruangan`}</button>}
   </div>
  </header>
  {busy&&<AsyncStatePanel state="loading" title="Memuat pelaporan ruangan" compact/>}
  {!busy&&error&&<AsyncStatePanel state="error" title="Pelaporan ruangan belum dapat dimuat" description={error} onRetry={()=>setReload(value=>value+1)} compact/>}
  {!busy&&!error&&!sortedRooms.length&&<p className="hlEmpty">Ruangan belum terhubung ke akun ini.</p>}
  {ready&&<ContinuumSummary enabled={dataFirst} label="Lihat matriks pelaporan"><div className="hlReportingChartWrap" role="group" aria-label="Matriks pelaporan indikator mutu per ruangan dan bulan">
   <div className="hlReportingMatrix">
    <div className="hlReportingCorner">Ruangan</div>
    {MONTHS.map((m,i)=><div className={i+1===nowMonth?'hlReportingMonth now':'hlReportingMonth'} key={m}>{m}</div>)}
    {shownRooms.map(room=>{const reported=new Set(byRoom(room.id).map(r=>r.month));return <Fragment key={room.id}><div className="hlReportingRoom"><button type="button" onClick={()=>setExpanded(true)} title={room.name}>{room.name}</button></div>{MONTHS.map((m,i)=>{const has=reported.has(i+1);const future=year===currentYear&&i+1>nowMonth;return <div key={m} className={'hlReportingCell'+(has?' hasData':future?' future':'')} title={room.name+' · '+m+': '+(has?'Ada laporan':future?'Belum periode':'Belum ada laporan')}><span>{has?'✓':''}</span></div>})}</Fragment>})}
   </div>
  </div>{dataFirst&&sortedRooms.length>LIMIT&&<button type="button" className="hlRepLink" onClick={()=>setShowAll(v=>!v)}>{showAll?'Ringkas':`Lihat ${sortedRooms.length} ruangan`}</button>}</ContinuumSummary>}
  {!dataFirst&&ready&&<div className="hlReportingLegend"><span><i className="hasData"/> Ada laporan</span><span><i/> Belum ada laporan</span><div className="hlRepActions"><button type="button" className="hlReportingDetailBtn" onClick={()=>setExpanded(v=>!v)}>{expanded?'Tutup tabel detail':'Lihat tabel detail'}</button></div></div>}
  {(expanded||dataFirst)&&ready&&<WorkspaceTableViewport dataFirst={dataFirst} className="hlReportingTableWrap" label="Detail pelaporan ruangan"><div className="hlReportingTableTitle">Detail pelaporan · 1 Januari – 31 Desember {year}</div><table className="hlReportingTable"><thead><tr><th>Nama ruangan</th><th>Bulan terlapor</th><th>Periode terakhir</th><th>Tanggal input terakhir</th><th>Status</th></tr></thead><tbody>{sortedRooms.map(room=>{const rr=byRoom(room.id);const last=latest(room.id);return <tr key={room.id}><td>{room.name}</td><td>{[...new Set(rr.map(r=>r.month))].sort((a,b)=>a-b).map(m=>MONTHS[m-1]).join(', ')||'Belum ada'}</td><td>{period(last?.latest_period)}</td><td>{date(last?.latest_report_at)}</td><td><span className={last?'hlReportingStatus reported':'hlReportingStatus'}>{last?'Sudah melapor':'Belum melapor'}</span></td></tr>})}</tbody></table></WorkspaceTableViewport>}
 </section>
}
