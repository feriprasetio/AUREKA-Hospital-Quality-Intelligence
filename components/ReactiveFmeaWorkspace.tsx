'use client'
import {useCallback,useEffect,useMemo,useState} from 'react'
import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'
import {aurekaSupabase} from '@/lib/aureka/supabase'
import {toUserFacingError} from '@/lib/ui/error-feedback'

type Room={id:number;name:string}
type Incident={id:string;incident_code:string;incident_date:string|null;unit_name:string;incident_type:string;summary:string;status:string;room_id:number|null}
type FmeaRow={id:string;fmea_code:string;unit_name:string;process_name:string;failure_mode:string;failure_effect:string;causes:string;existing_controls:string;severity:number;occurrence:number;detection:number;rpn:number;priority:string;action_plan:string;owner_name:string;target_date:string|null;status:string;source_incident_id:string|null;incident_code_snapshot:string;created_at:string}
const risk=()=>aurekaSupabase.schema('aureka_risk')
const safety=()=>aurekaSupabase.schema('aureka_patient_safety')
const managers=['ADMIN','PMKP','MANAGEMENT']
const priorityClass=(p:string)=>p==='Tinggi'?'high':p==='Sedang'?'medium':'low'

export default function ReactiveFmeaWorkspace({role,rooms=[],initialRoomId=null,lockRoomScope=false}:{
 role:string|null;rooms?:Room[];initialRoomId?:number|null;lockRoomScope?:boolean
}){
 const canManage=managers.includes(role||'')
 const [screen,setScreen]=useState<'overview'|'register'>('overview')
 const [incidents,setIncidents]=useState<Incident[]>([])
 const [rows,setRows]=useState<FmeaRow[]>([])
 const [loading,setLoading]=useState(true)
 const [busy,setBusy]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const [search,setSearch]=useState('')
 const [showForm,setShowForm]=useState(false)
 const [selectedId,setSelectedId]=useState('')
 const [mode,setMode]=useState('')
 const [effect,setEffect]=useState('')
 const [causes,setCauses]=useState('')
 const [controls,setControls]=useState('')
 const [actions,setActions]=useState('')
 const [owner,setOwner]=useState('')
 const [due,setDue]=useState('')
 const [severity,setSeverity]=useState(3)
 const [occurrence,setOccurrence]=useState(3)
 const [detection,setDetection]=useState(3)

 const load=useCallback(async()=>{
  if(!canManage){setLoading(false);setError('FMEA Reaktif hanya dapat diakses oleh ADMIN, PMKP, dan Manajemen.');return}
  setLoading(true);setError('')
  const [incidentResult,fmeaResult]=await Promise.all([
   safety().from('incidents').select('id,incident_code,incident_date,unit_name,incident_type,summary,status,room_id').order('incident_date',{ascending:false}).limit(500),
   risk().from('fmea_analyses').select('id,fmea_code,unit_name,process_name,failure_mode,failure_effect,causes,existing_controls,severity,occurrence,detection,rpn,priority,action_plan,owner_name,target_date,status,source_incident_id,incident_code_snapshot,created_at').eq('analysis_type','reactive').order('created_at',{ascending:false}).limit(500)
  ])
  if(incidentResult.error){setIncidents([]);setError('Register insiden tidak dapat dimuat: '+toUserFacingError(incidentResult.error,{fallback:'Periksa kewenangan keselamatan pasien.'}))}
  else setIncidents((incidentResult.data||[]) as Incident[])
  if(fmeaResult.error){setRows([]);setError('Register FMEA Reaktif tidak dapat dimuat: '+toUserFacingError(fmeaResult.error,{fallback:'Pastikan migrasi FMEA Reaktif telah diterapkan.'}))}
  else setRows((fmeaResult.data||[]) as FmeaRow[])
  setLoading(false)
 },[canManage])
 useEffect(()=>{void load()},[load])
 const linkedIds=useMemo(()=>new Set(rows.map(x=>x.source_incident_id).filter(Boolean)),[rows])
 const available=useMemo(()=>incidents.filter(x=>!linkedIds.has(x.id)&&(!lockRoomScope||initialRoomId==null||x.room_id===initialRoomId)),[incidents,linkedIds,lockRoomScope,initialRoomId])
 const visible=useMemo(()=>rows.filter(x=>(x.fmea_code+' '+x.incident_code_snapshot+' '+x.failure_mode+' '+x.unit_name).toLowerCase().includes(search.toLowerCase().trim())),[rows,search])
 const selected=incidents.find(x=>x.id===selectedId)||null
 const high=rows.filter(x=>x.priority==='Tinggi').length
 const open=rows.filter(x=>x.status!=='Closed').length
 const create=(incident?:Incident)=>{
  setSelectedId(incident?.id||'');setMode(incident?.summary||'');setEffect('');setCauses('');setControls('');setActions('');setOwner('');setDue('')
  setSeverity(3);setOccurrence(3);setDetection(3);setError('');setNotice('');setShowForm(true)
 }
 const save=async()=>{
  if(!canManage||busy)return
  if(!selected){setError('Pilih insiden sumber yang terdaftar.');return}
  if(!mode.trim()||!effect.trim()||!causes.trim()||!actions.trim()||!owner.trim()){setError('Mode kegagalan, dampak, penyebab, rencana tindakan, dan penanggung jawab wajib diisi.');return}
  if(linkedIds.has(selected.id)){setError('Insiden tersebut sudah memiliki FMEA Reaktif.');return}
  setBusy(true);setError('');setNotice('')
  const {data:auth,error:authError}=await aurekaSupabase.auth.getUser()
  if(authError||!auth.user){setBusy(false);setError('Sesi autentikasi tidak tersedia.');return}
  const payload={
   fmea_code:'FMEA-R-'+new Date().getFullYear()+'-'+crypto.randomUUID().slice(0,8).toUpperCase(),
   risk_register_id:null,
   unit_name:selected.unit_name||'Unit tidak tercatat',
   process_name:selected.incident_type||'Proses pelayanan',
   failure_mode:mode.trim(),failure_effect:effect.trim(),causes:causes.trim(),
   existing_controls:controls.trim(),severity,occurrence,detection,
   action_plan:actions.trim(),owner_name:owner.trim(),target_date:due||null,
   status:'Open',analysis_type:'reactive',source_incident_id:selected.id,
   incident_code_snapshot:selected.incident_code,created_by:auth.user.id,updated_by:auth.user.id
  }
  const {error:saveError}=await aurekaSupabase.rpc('aureka_reactive_fmea_save',{p:payload})
  setBusy(false)
  if(saveError){setError('FMEA Reaktif gagal disimpan: '+toUserFacingError(saveError,{fallback:'Periksa data insiden dan kewenangan.'}));return}
  setShowForm(false);setNotice('Analisis FMEA Reaktif tersimpan dan tertaut ke insiden '+selected.incident_code+'.')
  await load();setScreen('register')
 }
 const updateStatus=async(row:FmeaRow,status:string)=>{
  if(!canManage||busy)return
  setBusy(true);setError('');setNotice('')
  const {error:e}=await aurekaSupabase.rpc('aureka_reactive_fmea_update_status',{p_fmea_id:row.id,p_status:status})
  setBusy(false)
  if(e){setError('Status FMEA tidak dapat diperbarui: '+toUserFacingError(e,{fallback:'Periksa kewenangan status FMEA Reaktif.'}));return}
  setNotice('Status '+row.fmea_code+' berhasil diperbarui.');await load()
 }
 if(!canManage)return <section className="rfmea"><WorkspaceModuleHeader title="FMEA Reaktif"/><div className="rfmeaNotice error">Role akun ini belum memiliki kewenangan.</div></section>
 return <section className="rfmea">
  <style>{'.rfmea{display:grid;gap:14px;color:var(--text,inherit)}.rfmeaPanel{padding:16px;border:1px solid var(--line,rgba(60,80,100,.18));border-radius:16px;background:var(--aureka-color-surface)}.rfmeaGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px}.rfmeaKpi{padding:14px;border:1px solid var(--line);border-radius:12px}.rfmeaKpi span{display:block;font-size:12px;color:var(--muted)}.rfmeaKpi b{display:block;font-size:25px;margin-top:5px}.rfmeaActions{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.rfmea button{padding:9px 12px;border-radius:9px;border:1px solid var(--line,rgba(70,90,100,.2));background:var(--surface,white);color:var(--text,inherit);font:inherit;font-size:12px;font-weight:800;cursor:pointer}.rfmea button.primary{background:var(--aureka-color-primary);color:var(--aureka-color-on-primary);border-color:transparent}.rfmea button:disabled{opacity:.5;cursor:not-allowed}.rfmeaNotice{padding:11px 13px;border-radius:10px;background:rgba(25,120,85,.08);font-size:12px;line-height:1.5}.rfmeaNotice.error{background:rgba(190,45,45,.09)}.rfmeaTableWrap{overflow:auto}.rfmeaTable{width:100%;min-width:920px;border-collapse:collapse;font-size:12px}.rfmeaTable td,.rfmeaTable th{padding:9px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}.rfmeaTable th{font-size:10px;color:var(--muted);text-transform:uppercase}.rfmeaTag{display:inline-flex;padding:4px 8px;border-radius:20px;font-weight:800}.rfmeaTag.high{color:#a52d27;background:rgba(195,55,45,.1)}.rfmeaTag.medium{color:#8a6110;background:rgba(185,130,30,.13)}.rfmeaTag.low{color:#176744;background:rgba(35,125,85,.1)}.rfmeaForm{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.rfmeaField{display:grid;gap:5px;font-size:12px;font-weight:750}.rfmeaFull{grid-column:1/-1}.rfmeaField input,.rfmeaField select,.rfmeaField textarea{width:100%;box-sizing:border-box;padding:9px;border-radius:9px;border:1px solid var(--line);background:var(--surface);color:var(--text);font:inherit}.rfmeaField textarea{min-height:70px;resize:vertical}.rfmeaBackdrop{position:fixed;inset:0;z-index:1100;display:grid;place-items:center;background:rgba(12,24,18,.5);padding:16px}.rfmeaDialog{width:min(820px,100%);max-height:92vh;overflow:auto}@media(max-width:650px){.rfmeaForm{grid-template-columns:1fr}.rfmeaFull{grid-column:auto}}'} </style>
  <WorkspaceModuleHeader title="FMEA Reaktif"/>
  {error&&<div className="rfmeaNotice error" role="alert">{error}</div>}{notice&&<div className="rfmeaNotice" role="status">{notice}</div>}
  {screen==='overview'&&<>
   <div className="rfmeaGrid"><div className="rfmeaKpi"><span>Total FMEA Reaktif</span><b>{rows.length}</b></div><div className="rfmeaKpi"><span>Prioritas tinggi</span><b>{high}</b></div><div className="rfmeaKpi"><span>Belum ditutup</span><b>{open}</b></div><div className="rfmeaKpi"><span>Insiden belum dianalisis</span><b>{available.length}</b></div></div>
   <div className="rfmeaPanel"><h3>Visual Intelligence · FMEA Reaktif</h3><div className="rfmeaActions"><button type="button" className="primary" onClick={()=>setScreen('register')} disabled={loading}>Lihat Register FMEA Reaktif</button><button type="button" className="primary" onClick={()=>create()} disabled={!available.length}>＋ Analisis dari Insiden</button><button type="button" onClick={()=>void load()} disabled={loading}>Muat Ulang</button></div></div>
  </>}
  {screen==='register'&&<>
   <div className="rfmeaActions"><button type="button" onClick={()=>setScreen('overview')}>← Visual Intelligence</button><input aria-label="Cari FMEA Reaktif" placeholder="Cari kode, unit, mode kegagalan…" value={search} onChange={e=>setSearch(e.target.value)} style={{minHeight:38,padding:9,borderRadius:9,border:'1px solid var(--line)',background:'var(--surface)',color:'var(--text)',flex:'1 1 230px'}}/><button type="button" className="primary" onClick={()=>create()} disabled={!available.length}>＋ Analisis dari Insiden</button></div>
   {loading?<div className="rfmeaPanel">Memuat register…</div>:visible.length===0?<div className="rfmeaPanel">Belum ada analisis FMEA Reaktif.</div>:<div className="rfmeaPanel"><div className="rfmeaTableWrap"><table className="rfmeaTable"><thead><tr><th>Kode FMEA</th><th>Insiden sumber</th><th>Mode kegagalan</th><th>Unit</th><th>S/O/D</th><th>RPN</th><th>Prioritas</th><th>Status</th></tr></thead><tbody>{visible.map(row=><tr key={row.id}><td><b>{row.fmea_code}</b><small>{new Date(row.created_at).toLocaleDateString('id-ID')}</small></td><td>{row.incident_code_snapshot||'Tautan sumber tidak tersedia'}</td><td>{row.failure_mode}<small>Dampak: {row.failure_effect}</small><small>Penyebab: {row.causes}</small></td><td>{row.unit_name}</td><td>{row.severity}/{row.occurrence}/{row.detection}</td><td><b>{row.rpn}</b></td><td><span className={'rfmeaTag '+priorityClass(row.priority)}>{row.priority}</span></td><td><select aria-label={'Status '+row.fmea_code} value={row.status} disabled={busy} onChange={e=>void updateStatus(row,e.target.value)} style={{padding:7,borderRadius:8,border:'1px solid var(--line)',background:'var(--surface)',color:'var(--text)'}}><option value="Open">Open</option><option value="In Progress">In Progress</option><option value="Evaluated">Evaluated</option><option value="Closed">Closed</option></select></td></tr>)}</tbody></table></div></div>}
  </>}
  {showForm&&<div className="rfmeaBackdrop" role="presentation" onMouseDown={e=>{if(e.target===e.currentTarget&&!busy)setShowForm(false)}}><section className="rfmeaPanel rfmeaDialog" role="dialog" aria-modal="true" aria-labelledby="rfmea-create-title"><h3 id="rfmea-create-title">Analisis FMEA Reaktif dari Insiden</h3><p style={{fontSize:12,color:'var(--muted)'}}>Pilih insiden sumber. Setelah tersimpan, hubungan dengan insiden tidak dapat diganti secara diam-diam.</p>
   <div className="rfmeaForm">
    <label className="rfmeaField rfmeaFull">Insiden sumber<select value={selectedId} onChange={e=>{setSelectedId(e.target.value);const item=incidents.find(x=>x.id===e.target.value);if(item)setMode(item.summary||'')}}><option value="">Pilih insiden…</option>{available.map(x=><option key={x.id} value={x.id}>{x.incident_code} · {x.unit_name} · {x.incident_date||'-'}</option>)}</select></label>
    {selected&&<div className="rfmeaNotice rfmeaFull">Sumber: {selected.incident_code} · {selected.incident_type} · {selected.summary}</div>}
    <label className="rfmeaField rfmeaFull">Mode kegagalan *<textarea value={mode} onChange={e=>setMode(e.target.value)}/></label>
    <label className="rfmeaField rfmeaFull">Dampak kegagalan *<textarea value={effect} onChange={e=>setEffect(e.target.value)}/></label>
    <label className="rfmeaField rfmeaFull">Penyebab / faktor kontribusi *<textarea value={causes} onChange={e=>setCauses(e.target.value)}/></label>
    <label className="rfmeaField rfmeaFull">Pengendalian yang sudah ada<textarea value={controls} onChange={e=>setControls(e.target.value)}/></label>
    <label className="rfmeaField">Severity (1–5)<select value={severity} onChange={e=>setSeverity(Number(e.target.value))}>{[1,2,3,4,5].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <label className="rfmeaField">Occurrence (1–5)<select value={occurrence} onChange={e=>setOccurrence(Number(e.target.value))}>{[1,2,3,4,5].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <label className="rfmeaField">Detection (1–5)<select value={detection} onChange={e=>setDetection(Number(e.target.value))}>{[1,2,3,4,5].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
    <div className="rfmeaKpi"><span>RPN pratinjau</span><b>{severity*occurrence*detection}</b></div>
    <label className="rfmeaField rfmeaFull">Rencana pengendalian / tindakan korektif *<textarea value={actions} onChange={e=>setActions(e.target.value)}/></label>
    <label className="rfmeaField">Penanggung jawab *<input value={owner} onChange={e=>setOwner(e.target.value)}/></label>
    <label className="rfmeaField">Target waktu<input type="date" value={due} onChange={e=>setDue(e.target.value)}/></label>
   </div>
   <div className="rfmeaActions" style={{justifyContent:'flex-end',marginTop:14}}><button type="button" disabled={busy} onClick={()=>setShowForm(false)}>Batal</button><button type="button" className="primary" disabled={busy||!selectedId} onClick={()=>void save()}>{busy?'Menyimpan…':'Simpan FMEA Reaktif'}</button></div>
  </section></div>}
 </section>
}
