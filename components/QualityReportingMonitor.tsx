'use client'
import {Fragment,useEffect,useMemo,useState} from 'react'
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
  <style>{`.hlReportingPanel{display:grid;gap:10px;border-color:#cfe0ee;box-shadow:0 7px 22px rgba(22,80,122,.07)}.hlReportingPanel .hlPanelHead{margin:0}.hlReportingAxis{margin:0;color:#647b8f;font-size:11px}.hlReportingChartWrap{overflow-x:auto;padding:5px 2px 2px}.hlReportingMatrix{min-width:680px;display:grid;grid-template-columns:minmax(145px,1.35fr) repeat(12,minmax(34px,1fr));align-items:stretch;gap:4px 5px}.hlReportingCorner{font-size:10px;font-weight:800;color:#647b8f;display:flex;align-items:end;padding:0 6px 7px}.hlReportingMonth{font-size:10px;font-weight:750;color:#536b80;text-align:center;padding:0 1px 7px;border-bottom:1px solid #dce6ee}.hlReportingRoom{min-height:30px;display:flex;align-items:center;min-width:0}.hlReportingRoom button{border:0;background:transparent;text-align:left;padding:5px 6px;color:#29465e;font-size:11px;font-weight:650;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;cursor:pointer;border-radius:6px}.hlReportingRoom button:hover{background:#edf5fb}.hlReportingCell{min-height:30px;border-radius:5px;background:#e8eef3;border:1px solid #dfe7ed;display:flex;align-items:center;justify-content:center}.hlReportingCell.hasData{background:#2877b4;border-color:#2877b4}.hlReportingCell span{font-size:9px;color:#fff;font-weight:800}.hlReportingLegend{display:flex;align-items:center;gap:15px;flex-wrap:wrap;color:#61788c;font-size:10px}.hlReportingLegend span{display:flex;align-items:center;gap:6px}.hlReportingLegend i{width:11px;height:11px;border-radius:3px;background:#e8eef3;border:1px solid #dfe7ed}.hlReportingLegend i.hasData{background:#2877b4;border-color:#2877b4}.hlReportingDetailBtn{margin-left:auto;border:1px solid #cbddea;border-radius:8px;background:#f2f7fb;color:#16507a;padding:7px 11px;font-size:11px;font-weight:750;cursor:pointer}.hlReportingTableWrap{overflow:auto;border:1px solid #e1eaf1;border-radius:10px}.hlReportingTableTitle{padding:10px 12px;background:#f4f8fb;color:#24445f;font-size:11px;font-weight:800}.hlReportingTable{width:100%;min-width:760px;border-collapse:collapse;font-size:11px}.hlReportingTable th,.hlReportingTable td{padding:9px 11px;border-top:1px solid #e7edf2;text-align:left;vertical-align:top}.hlReportingTable th{background:#f9fbfd;color:#667d90;font-size:10px}.hlReportingStatus{display:inline-block;padding:4px 7px;border-radius:20px;background:#f0f2f4;color:#6f7c86;font-size:10px;font-weight:750}.hlReportingStatus.reported{background:#e4f2ea;color:#26734c}@media(max-width:640px){.hlReportingPanel{padding:12px}.hlReportingDetailBtn{margin-left:0}}`}</style>
  <header className="hlPanelHead"><div><h3>Monitoring Pelaporan Indikator Mutu</h3><span>Periode 1 Januari – 31 Desember {year}</span></div><span>{isAdmin?'Seluruh rumah sakit':roomName||'Ruangan saya'}</span></header>
  <p className="hlReportingAxis">Baris vertikal: nama ruangan (urut alfabetis) · Kolom horizontal: bulan Januari–Desember</p>
  {busy&&<p className="hlEmpty" role="status">Memuat progres pelaporan ruangan…</p>}
  {error&&<p className="hlNotice" role="alert">{error}</p>}
  {!busy&&!error&&!visibleRooms.length&&<p className="hlEmpty">Ruangan belum terhubung ke akun ini.</p>}
  {!busy&&!error&&visibleRooms.length>0&&<div className="hlReportingChartWrap" role="group" aria-label="Matriks pelaporan indikator mutu per ruangan dan bulan">
   <div className="hlReportingMatrix">
    <div className="hlReportingCorner">Nama ruangan</div>
    {MONTHS.map(m=><div className="hlReportingMonth" key={m}>{m}</div>)}
    {[...visibleRooms].sort((a,b)=>a.name.localeCompare(b.name,'id')).map(room=>{const rr=byRoom(room.id);const reported=new Set(rr.map(r=>r.month));return <Fragment key={room.id}><div className="hlReportingRoom"><button type="button" onClick={()=>setExpanded(true)} title={'Lihat detail '+room.name}>{room.name}</button></div>{MONTHS.map((m,i)=><div key={m} className={'hlReportingCell'+(reported.has(i+1)?' hasData':'')} title={room.name+' · '+m+': '+(reported.has(i+1)?'Ada laporan':'Belum ada laporan')}><span>{reported.has(i+1)?'✓':''}</span></div>)}</Fragment>})}
   </div>
  </div>}
  {!busy&&!error&&visibleRooms.length>0&&<div className="hlReportingLegend"><span><i className="hasData"/> Ada laporan</span><span><i/> Belum ada laporan</span><button type="button" className="hlReportingDetailBtn" onClick={()=>setExpanded(v=>!v)}>{expanded?'Tutup tabel detail':'Lihat tabel detail'}</button></div>}
  {expanded&&!error&&<div className="hlReportingTableWrap"><div className="hlReportingTableTitle">Detail pelaporan · 1 Januari – 31 Desember {year}</div><table className="hlReportingTable"><thead><tr><th>Nama ruangan</th><th>Bulan terlapor</th><th>Periode terakhir</th><th>Tanggal input terakhir</th><th>Status</th></tr></thead><tbody>{[...visibleRooms].sort((a,b)=>a.name.localeCompare(b.name,'id')).map(room=>{const rr=byRoom(room.id);const last=latest(room.id);return <tr key={room.id}><td>{room.name}</td><td>{[...new Set(rr.map(r=>r.month))].sort((a,b)=>a-b).map(m=>MONTHS[m-1]).join(', ')||'—'}</td><td>{period(last?.latest_period)}</td><td>{date(last?.latest_report_at)}</td><td><span className={last?'hlReportingStatus reported':'hlReportingStatus'}>{last?'Sudah melapor':'Belum melapor'}</span></td></tr>})}</tbody></table></div>}
 </section>
}
