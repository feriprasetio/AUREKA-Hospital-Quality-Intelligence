'use client'
import {useEffect,useMemo,useState} from 'react'
import type {SupabaseClient} from '@supabase/supabase-js'

type Room={id:number;name:string}
type Row={room_id:number;month:number;total:number;latest_report_at:string|null;latest_period:string|null}
const MONTHS=['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
export default function QualityReportingMonitor({supabase,rooms,isAdmin,roomId,roomName}:{supabase:SupabaseClient;rooms:Room[];isAdmin:boolean;roomId:number|null;roomName:string|null}){
 const year=new Date().getFullYear()
 const [rows,setRows]=useState<Row[]>([])
 const [busy,setBusy]=useState(true)
 const [error,setError]=useState('')
 const [expanded,setExpanded]=useState(false)
 useEffect(()=>{let cancelled=false;setBusy(true);setError('')
  void (async()=>{
   try{
    const {data,error}=await supabase.rpc('aureka_quality_room_reporting_status',{p_year:year})
    if(error)throw error
    if(!cancelled)setRows((Array.isArray(data)?data:[]).map((r:any)=>({room_id:Number(r.room_id),month:Number(r.month),total:Number(r.total)||0,latest_report_at:r.latest_report_at?String(r.latest_report_at):null,latest_period:r.latest_period?String(r.latest_period):null})))
   }catch{
    if(!cancelled)setError('Ringkasan belum tersedia. Pastikan migrasi monitoring pelaporan indikator mutu sudah diterapkan.')
   }finally{if(!cancelled)setBusy(false)}
  })()
  return()=>{cancelled=true}
 },[supabase,year])
 const visibleRooms=useMemo(()=>isAdmin?rooms:rooms.filter(r=>Number(r.id)===Number(roomId)),[rooms,isAdmin,roomId])
 const byRoom=(id:number)=>rows.filter(r=>r.room_id===Number(id))
 const latest=(id:number)=>byRoom(id).reduce<Row|null>((best,r)=>!best||String(r.latest_report_at||'')>String(best.latest_report_at||'')?r:best,null)
 const date=(v:string|null|undefined)=>v?new Intl.DateTimeFormat('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Pontianak'}).format(new Date(v)):'Belum ada laporan'
 const period=(v:string|null|undefined)=>v?new Intl.DateTimeFormat('id-ID',{month:'long',year:'numeric',timeZone:'Asia/Pontianak'}).format(new Date(v+'T12:00:00')):'Belum ada periode'
 return <section className="hlPanel hlReportingPanel" aria-label="Monitoring pelaporan indikator mutu">
  <style>{`.hlReportingPanel{display:grid;gap:10px;border-color:#cfe0ee;box-shadow:0 7px 22px rgba(22,80,122,.07)}.hlReportingPanel .hlPanelHead{margin:0}.hlReportingAxis{margin:0;color:#647b8f;font-size:11px}.hlReportingChart{display:grid;grid-template-columns:34px minmax(760px,1fr);gap:8px;overflow-x:auto;padding:8px 4px 0}.hlReportingYAxis{height:226px;display:flex;flex-direction:column;justify-content:space-between;color:#73879a;font-size:10px;text-align:right;padding:0 0 25px}.hlReportingPlot{height:226px;display:grid;grid-template-columns:repeat(var(--room-count),minmax(20px,1fr));gap:5px;align-items:end;border-bottom:1px solid #cfdae4;background:repeating-linear-gradient(to top,transparent 0,transparent calc(25% - 1px),#eaf0f5 calc(25% - 1px),#eaf0f5 25%)}.hlReportingBar{height:100%;min-width:0;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;gap:5px;border:0;background:transparent;padding:0;cursor:pointer;color:#24445f}.hlReportingBar:focus-visible{outline:2px solid #2877b4;outline-offset:2px}.hlReportingBarFill{width:min(70%,26px);min-height:3px;background:#2877b4;border-radius:5px 5px 0 0;transition:height .18s ease}.hlReportingBar.noReport .hlReportingBarFill{background:#dce4eb}.hlReportingBarLabel{height:25px;max-width:100%;font-size:9px;color:#536b80;writing-mode:vertical-rl;transform:rotate(180deg);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hlReportingLegend{display:flex;align-items:center;gap:15px;flex-wrap:wrap;color:#61788c;font-size:10px}.hlReportingLegend span{display:flex;align-items:center;gap:6px}.hlReportingLegend i{width:11px;height:11px;border-radius:3px;background:#dce4eb}.hlReportingLegend i.hasData{background:#2877b4}.hlReportingDetailBtn{margin-left:auto;border:1px solid #cbddea;border-radius:8px;background:#f2f7fb;color:#16507a;padding:7px 11px;font-size:11px;font-weight:750;cursor:pointer}.hlReportingTableWrap{overflow:auto;border:1px solid #e1eaf1;border-radius:10px}.hlReportingTableTitle{padding:10px 12px;background:#f4f8fb;color:#24445f;font-size:11px;font-weight:800}.hlReportingTable{width:100%;min-width:760px;border-collapse:collapse;font-size:11px}.hlReportingTable th,.hlReportingTable td{padding:9px 11px;border-top:1px solid #e7edf2;text-align:left;vertical-align:top}.hlReportingTable th{background:#f9fbfd;color:#667d90;font-size:10px}.hlReportingStatus{display:inline-block;padding:4px 7px;border-radius:20px;background:#f0f2f4;color:#6f7c86;font-size:10px;font-weight:750}.hlReportingStatus.reported{background:#e4f2ea;color:#26734c}@media(max-width:640px){.hlReportingPanel{padding:12px}.hlReportingDetailBtn{margin-left:0}}`}</style>
  <header className="hlPanelHead"><div><h3>Monitoring Pelaporan Indikator Mutu</h3><span>Periode 1 Januari – 31 Desember {year}</span></div><span>{isAdmin?'Seluruh rumah sakit':roomName||'Ruangan saya'}</span></header>
  <p className="hlReportingAxis">Sumbu horizontal: ruangan · Sumbu vertikal: bulan terakhir yang sudah memiliki data (Januari–Desember)</p>
  {busy&&<p className="hlEmpty" role="status">Memuat progres pelaporan ruangan…</p>}
  {error&&<p className="hlNotice" role="alert">{error}</p>}
  {!busy&&!error&&!visibleRooms.length&&<p className="hlEmpty">Ruangan belum terhubung ke akun ini.</p>}
  {!busy&&!error&&visibleRooms.length>0&&<div className="hlReportingChart" role="group" aria-label="Grafik batang vertikal progres pelaporan ruangan">
   <div className="hlReportingYAxis">{['Des','Sep','Jun','Mar','Jan'].map(m=><span key={m}>{m}</span>)}</div>
   <div className="hlReportingPlot" style={{'--room-count':visibleRooms.length} as React.CSSProperties}>
    {visibleRooms.map(room=>{const last=latest(room.id);const month=last?.latest_period?Number(String(last.latest_period).slice(5,7)):0;const progress=Math.max(0,Math.min(12,month));return <button type="button" className={'hlReportingBar'+(progress?'':' noReport')} key={room.id} onClick={()=>setExpanded(true)} title={room.name+': '+(progress?period(last?.latest_period):'Belum melapor')} aria-label={room.name+', '+(progress?period(last?.latest_period):'belum melapor')+', buka tabel detail'}><span className="hlReportingBarFill" style={{height:(progress/12*100)+'%'}}/><span className="hlReportingBarLabel">{room.name}</span></button>})}
   </div>
  </div>}
  {!busy&&!error&&visibleRooms.length>0&&<div className="hlReportingLegend"><span><i className="hasData"/> Ada laporan</span><span><i/> Belum ada laporan</span><button type="button" className="hlReportingDetailBtn" onClick={()=>setExpanded(v=>!v)}>{expanded?'Tutup tabel detail':'Lihat tabel detail'}</button></div>}
  {expanded&&!error&&<div className="hlReportingTableWrap"><div className="hlReportingTableTitle">Detail pelaporan · 1 Januari – 31 Desember {year}</div><table className="hlReportingTable"><thead><tr><th>Nama ruangan</th><th>Bulan terlapor</th><th>Periode terakhir</th><th>Tanggal input terakhir</th><th>Status</th></tr></thead><tbody>{visibleRooms.map(room=>{const rr=byRoom(room.id);const last=latest(room.id);return <tr key={room.id}><td>{room.name}</td><td>{[...new Set(rr.map(r=>r.month))].sort((a,b)=>a-b).map(m=>MONTHS[m-1]).join(', ')||'—'}</td><td>{period(last?.latest_period)}</td><td>{date(last?.latest_report_at)}</td><td><span className={last?'hlReportingStatus reported':'hlReportingStatus'}>{last?'Sudah melapor':'Belum melapor'}</span></td></tr>})}</tbody></table></div>}
 </section>
}
