'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import AurekaModal from '@/components/ui/AurekaModal'
import AsyncStatePanel from '@/components/AsyncStatePanel'

type Room = { id: number; name: string }
type PriorityArea = {
  id: string; program_year: number; code: string | null; title: string; problem_statement: string
  rationale: string; target_outcome: string; priority: 'tinggi'|'sedang'|'rendah'
  owner_room_id: number | null; room_name: string | null; responsible_person: string
  due_date: string | null; status: 'aktif'|'berjalan'|'tercapai'|'ditunda'|'dibatalkan'
}
type Draft = Partial<PriorityArea>
type ProgramPayload = { can_manage: boolean; priority_areas: PriorityArea[] }
type Screen = 'home'|'timeline'|'priorities'
type ProgramActivity = {
  id:string;program_year:number;title:string;description:string;expected_output:string
  owner_room_id:number|null;room_name:string|null;responsible_person:string
  start_date:string;end_date:string;status:'planned'|'in_progress'|'completed'|'on_hold'|'cancelled'
  progress_percent:number
}
type ActivityDraft = Partial<ProgramActivity>

const STATUS:Record<PriorityArea['status'],string>={aktif:'Aktif',berjalan:'Berjalan',tercapai:'Tercapai',ditunda:'Ditunda',dibatalkan:'Dibatalkan'}
const PRIORITY:Record<PriorityArea['priority'],string>={tinggi:'Tinggi',sedang:'Sedang',rendah:'Rendah'}
const fmtDate=(v?:string|null)=>v?new Date(v+'T12:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):'Belum ditetapkan'

export default function AnnualProgramWorkspace({rooms,role,currentRoomId,screen,onScreenChange}:{
  rooms:Room[];role:string|null;currentRoomId:number|null;screen:Screen;onScreenChange:(screen:Screen)=>void
}) {
  const [year,setYear]=useState(new Date().getFullYear())
  const [rows,setRows]=useState<PriorityArea[]>([])
  const [draft,setDraft]=useState<Draft|null>(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [activityRows,setActivityRows]=useState<ProgramActivity[]>([])
  const [activityDraft,setActivityDraft]=useState<ActivityDraft|null>(null)
  const [activityLoading,setActivityLoading]=useState(false)
  const [activityBusy,setActivityBusy]=useState(false)
  const [activityError,setActivityError]=useState('')
  const canManage=role==='ADMIN'||role==='PMKP'

  const loadActivities=useCallback(async()=>{
    setActivityLoading(true);setActivityError('')
    const {data,error:rpcError}=await aurekaSupabase.rpc('aureka_gov_program_activity_list',{p_year:year})
    if(rpcError){setActivityRows([]);setActivityError(toUserFacingError(rpcError,{fallback:'Timeline program belum dapat dimuat.'}))}
    else setActivityRows((data?.activities||[]) as ProgramActivity[])
    setActivityLoading(false)
  },[year])
  useEffect(()=>{void loadActivities()},[loadActivities])

  const startActivity=()=>{
    setActivityDraft({program_year:year,title:'',description:'',expected_output:'',owner_room_id:currentRoomId,responsible_person:'',start_date:year+'-01-01',end_date:year+'-01-07',status:'planned',progress_percent:0})
  }
  const saveActivity=async()=>{
    if(!activityDraft||activityBusy)return
    if(String(activityDraft.title||'').trim().length<5){setActivityError('Nama kegiatan minimal lima karakter.');return}
    if(!activityDraft.start_date||!activityDraft.end_date||activityDraft.end_date<activityDraft.start_date){setActivityError('Tanggal kegiatan wajib benar dan tanggal selesai tidak boleh mendahului tanggal mulai.');return}
    setActivityBusy(true);setActivityError('')
    const payload={...activityDraft,program_year:year,progress_percent:Number(activityDraft.progress_percent||0)}
    const {error:rpcError}=await aurekaSupabase.rpc('aureka_gov_program_activity_save',{p:payload})
    setActivityBusy(false)
    if(rpcError){setActivityError(toUserFacingError(rpcError,{fallback:'Kegiatan timeline belum dapat disimpan.'}));return}
    setActivityDraft(null);setNotice('Kegiatan timeline berhasil disimpan.');await loadActivities()
  }
  const editActivity=(activity:ProgramActivity)=>setActivityDraft({...activity})

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    const {data,error:rpcError}=await aurekaSupabase.rpc('aureka_gov_program_list',{p_year:year})
    if(rpcError){setError(toUserFacingError(rpcError,{fallback:'Data program tahunan belum dapat dimuat.'}));setLoading(false);return}
    setRows((data?.priority_areas||[]) as PriorityArea[])
    setLoading(false)
  },[year])
  useEffect(()=>{void load()},[load])

  const save=async()=>{
    if(!draft)return
    setBusy(true);setError('');setNotice('')
    const {error:rpcError}=await aurekaSupabase.rpc('aureka_gov_save_priority_area',{p:draft})
    setBusy(false)
    if(rpcError){setError(toUserFacingError(rpcError,{fallback:'Area prioritas belum dapat disimpan.'}));return}
    setDraft(null);setNotice('Area prioritas berhasil disimpan.');await load()
  }
  const startNew=()=>setDraft({program_year:year,priority:'tinggi',status:'aktif',owner_room_id:null,responsible_person:''})
  const activeCount=useMemo(()=>rows.filter(x=>!['tercapai','dibatalkan'].includes(x.status)).length,[rows])
  const statusSummary=useMemo(()=>[
    {key:'aktif',label:'Belum mulai / aktif',count:rows.filter(x=>x.status==='aktif').length},
    {key:'berjalan',label:'Berjalan',count:rows.filter(x=>x.status==='berjalan').length},
    {key:'tercapai',label:'Tercapai',count:rows.filter(x=>x.status==='tercapai').length},
    {key:'ditunda',label:'Ditunda',count:rows.filter(x=>x.status==='ditunda').length},
    {key:'dibatalkan',label:'Dibatalkan',count:rows.filter(x=>x.status==='dibatalkan').length},
  ],[rows])
  const overdueCount=useMemo(()=>{const today=new Date();today.setHours(0,0,0,0);return rows.filter(x=>x.due_date&&!['tercapai','dibatalkan'].includes(x.status)&&new Date(x.due_date+'T00:00:00')<today).length},[rows])
  const quarterDeadlines=useMemo(()=>[1,2,3,4].map(q=>({quarter:'TW '+q,count:rows.filter(x=>{if(!x.due_date)return false;const month=Number(x.due_date.slice(5,7));return Math.ceil(month/3)===q}).length})),[rows])
  const roomLabel=(id:number|null)=>id==null?'Rumah Sakit':rooms.find(x=>Number(x.id)===Number(id))?.name||'Unit tidak ditemukan'

  return <section className="rmPanel govWorkspace annualProgramWorkspace" aria-label="Program kerja tahunan">
    <div className="rmSectionHead">
      <div><span className="rmEyebrow">Program · Perencanaan Mutu</span><h3>{screen==='priorities'?'Area Prioritas':'Program Kerja Tahunan'}</h3>
        <p>{screen==='priorities'?'Tetapkan masalah prioritas, sasaran hasil, pemilik, dan tenggat.':'Jadwal dan progres kegiatan untuk tahun yang dipilih.'}</p>
      </div>
      <div className="govHeadTools">
        {screen!=='home'&&<button type="button" className="rmButton" onClick={()=>onScreenChange('home')}>← Kembali ke Program</button>}
        <label className="govYear">Tahun <select value={year} onChange={e=>setYear(Number(e.target.value))}>{[0,1,2].map(d=>new Date().getFullYear()+1-d).map(y=><option key={y} value={y}>{y}</option>)}</select></label>
      </div>
    </div>

    {error&&<div className="rmNotice error" role="alert"><span>Perlu perhatian</span><p>{error}</p></div>}
    {notice&&<div className="rmNotice" role="status"><span>Informasi</span><p>{notice}</p></div>}

    {screen==='home'&&<div className="annualProgramHome">
    <section className="annualProgramVisual" aria-label="Ringkasan status program tahunan">
      <div className="annualProgramVisualHead"><div><span className="rmEyebrow">Ikhtisar program</span><h4>Pelaksanaan area prioritas · {year}</h4><p>Status berdasarkan data area prioritas yang tersimpan, bukan estimasi progres.</p></div><strong>{loading?'…':rows.length.toLocaleString('id-ID')} area</strong></div>
      <div className="annualProgramVisualKpis"><div><span>Masih aktif / berjalan</span><b>{loading?'…':activeCount.toLocaleString('id-ID')}</b></div><div><span>Tercapai</span><b>{loading?'…':(statusSummary.find(x=>x.key==='tercapai')?.count||0).toLocaleString('id-ID')}</b></div><div><span>Lewat tenggat</span><b>{loading?'…':overdueCount.toLocaleString('id-ID')}</b></div></div>
      <div className="annualProgramVisualGrid">
        <div><h5>Distribusi status</h5>{statusSummary.map(item=><div className="annualProgramStatusRow" key={item.key}><span>{item.label}</span><b>{loading?'…':item.count.toLocaleString('id-ID')}</b><i><em style={{width:(rows.length?item.count/rows.length*100:0)+'%'}}/></i></div>)}</div>
        <div><h5>Tenggat berdasarkan triwulan</h5><div className="annualProgramQuarterGrid">{quarterDeadlines.map(item=><div key={item.quarter}><span>{item.quarter}</span><b>{loading?'…':item.count.toLocaleString('id-ID')}</b><small>area dengan tenggat</small></div>)}</div><p className="annualProgramVisualNote">Area tanpa tanggal tenggat tidak dimasukkan ke distribusi triwulan.</p></div>
      </div>
    </section>
    </div>}
    {screen!=='priorities'&&<div className="annualProgramHome">
      <section className="annualTimelinePanel" aria-label="Timeline kegiatan tahunan">
        <div className="annualTimelineHead">
          <div><h4>Timeline kegiatan tahunan · {year}</h4></div>
          {screen==='home'?<button type="button" className="rmButton primary" onClick={()=>onScreenChange('timeline')}>Lihat Program Kerja</button>:canManage&&<button type="button" className="rmButton primary" onClick={startActivity}>+ Tambah Kegiatan Timeline</button>}
        </div>
        {activityError&&<div className="rmNotice error" role="alert"><span>Perlu perhatian</span><p>{activityError}</p></div>}
        {activityLoading?<div className="rmLoading">Memuat timeline kegiatan…</div>:activityRows.length===0?<AsyncStatePanel state="empty" title="Belum ada kegiatan pada timeline" description={canManage?'Tambahkan aktivitas dengan tanggal mulai, selesai, unit pemilik, dan penanggung jawab untuk membentuk Gantt tahunan.':'Belum ada aktivitas tahunan yang dicatat untuk periode ini.'} compact/>:
        <div className="annualTimelineScroll">
          <div className="annualTimelineMonthHead">{['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'].map((m,i)=><span key={i}>{m}</span>)}</div>
          <div className="annualTimelineRows">{activityRows.map(activity=>{
            const startMonth=Math.max(1,Math.min(12,Number(activity.start_date.slice(5,7))))
            const endMonth=Math.max(startMonth,Math.min(12,Number(activity.end_date.slice(5,7))))
            return <article className="annualTimelineRow" key={activity.id}>
              <div className="annualTimelineRowMeta"><div><strong>{activity.title}</strong><small>{roomLabel(activity.owner_room_id)} · {activity.responsible_person||'Penanggung jawab belum diisi'} · {fmtDate(activity.start_date)} – {fmtDate(activity.end_date)}</small></div><div className="annualTimelineRowActions"><span className={'govStatus '+(activity.status==='completed'?'tercapai':activity.status==='on_hold'?'ditunda':activity.status==='cancelled'?'dibatalkan':activity.status==='in_progress'?'berjalan':'aktif')}>{activity.status==='completed'?'Selesai':activity.status==='in_progress'?'Berjalan':activity.status==='on_hold'?'Ditunda':activity.status==='cancelled'?'Dibatalkan':'Direncanakan'} · {activity.progress_percent}%</span>{canManage&&screen==='timeline'&&<button type="button" className="rmIconButton" onClick={()=>editActivity(activity)}>Edit</button>}</div></div>
              <div className="annualTimelineTrack">
                {Array.from({length:12},(_,i)=><i className="annualTimelineMonthCell" key={i}/>)}
                <div className={'annualTimelineBar '+activity.status} style={{gridColumnStart:startMonth,gridColumnEnd:endMonth+1}}><span style={{width:activity.progress_percent+'%'}}/></div>
              </div>
              {activity.expected_output&&<p className="annualTimelineOutput">Output: {activity.expected_output}</p>}
            </article>
          })}</div>
        </div>}
      </section>
    </div>}

    {screen==='priorities'&&<div className="annualPriorityContent">
      <div className="govHeadTools annualPriorityToolbar">
        <span className="rmCellSmall">Area prioritas tahun {year} · {rows.length} entri</span>
        {canManage&&<button type="button" className="rmButton primary" onClick={startNew}>+ Tambah Area Prioritas</button>}
      </div>
      <section className="annualProgramVisual annualProgramVisualCompact" aria-label="Ringkasan area prioritas">
        <div className="annualProgramVisualKpis"><div><span>Aktif / berjalan</span><b>{activeCount}</b></div><div><span>Tercapai</span><b>{statusSummary.find(x=>x.key==='tercapai')?.count||0}</b></div><div><span>Lewat tenggat</span><b>{overdueCount}</b></div></div>
        <div className="annualProgramStatusStrip">{statusSummary.map(item=><span key={item.key}>{item.label}<b>{item.count}</b></span>)}</div>
      </section>
      {loading?<div className="rmLoading"><span className="rmSpinner"/>Memuat area prioritas…</div>:rows.length===0?<AsyncStatePanel state="empty" title="Belum ada area prioritas" description={canManage?'Tambahkan masalah prioritas rumah sakit untuk mulai menyusun program kerja tahunan.':'Belum ada area prioritas yang ditetapkan untuk tahun ini.'} compact/>:
      <div className="annualPriorityGrid">{rows.map(row=><article key={row.id} className="annualPriorityCard">
        <header><div><span className="govCode">{row.code||'AREA PRIORITAS'}</span><h4>{row.title}</h4></div>{canManage&&<button type="button" className="rmIconButton" onClick={()=>setDraft({...row})}>Edit</button>}</header>
        <p className="annualPriorityProblem">{row.problem_statement}</p>
        {row.rationale&&<p>{row.rationale}</p>}
        {row.target_outcome&&<div className="annualPriorityOutcome"><b>Hasil yang ditargetkan</b><span>{row.target_outcome}</span></div>}
        <div className="annualPriorityMeta"><span className={'govStatus '+row.status}>{STATUS[row.status]}</span><span>Prioritas {PRIORITY[row.priority]}</span><span>{roomLabel(row.owner_room_id)}</span></div>
        <footer><span>{row.responsible_person||'PIC belum ditetapkan'}</span><span>Tenggat: {fmtDate(row.due_date)}</span></footer>
      </article>)}</div>}
    </div>}

    <AurekaModal open={screen==='priorities'&&Boolean(draft)} title={draft?.id?'Edit Area Prioritas':'Tambah Area Prioritas'} subtitle="Rumusan masalah dan sasaran hasil menjadi dasar penetapan intervensi." closeDisabled={busy} onClose={()=>setDraft(null)}
      footer={<><button type="button" className="akBtn akBtnGhost" onClick={()=>setDraft(null)}>Batal</button><button type="button" className="akBtn akBtnPrimary" disabled={busy||String(draft?.title||'').trim().length<5||String(draft?.problem_statement||'').trim().length<10} onClick={()=>void save()}>{busy?'Menyimpan…':'Simpan Area Prioritas'}</button></>}>
      {draft&&<div className="govForm">
        <div className="govFormRow">
          <label>Tahun program<input type="number" min="2024" max="2200" value={draft.program_year||year} onChange={e=>setDraft({...draft,program_year:Number(e.target.value)})}/></label>
          <label>Kode area (opsional)<input value={draft.code||''} onChange={e=>setDraft({...draft,code:e.target.value})} placeholder="AP-2026-01"/></label>
        </div>
        <label>Nama area prioritas<input value={draft.title||''} onChange={e=>setDraft({...draft,title:e.target.value})} placeholder="Contoh: Penguatan keselamatan pasien di IGD"/></label>
        <label>Masalah yang diangkat<textarea rows={3} value={draft.problem_statement||''} onChange={e=>setDraft({...draft,problem_statement:e.target.value})} placeholder="Jelaskan kesenjangan kinerja, besaran masalah, dan dampaknya."/></label>
        <label>Dasar pemilihan / justifikasi<textarea rows={3} value={draft.rationale||''} onChange={e=>setDraft({...draft,rationale:e.target.value})}/></label>
        <label>Hasil yang ditargetkan<textarea rows={2} value={draft.target_outcome||''} onChange={e=>setDraft({...draft,target_outcome:e.target.value})}/></label>
        <div className="govFormRow">
          <label>Prioritas<select value={draft.priority||'tinggi'} onChange={e=>setDraft({...draft,priority:e.target.value as PriorityArea['priority']})}><option value="tinggi">Tinggi</option><option value="sedang">Sedang</option><option value="rendah">Rendah</option></select></label>
          <label>Unit pemilik<select value={draft.owner_room_id??''} onChange={e=>setDraft({...draft,owner_room_id:e.target.value?Number(e.target.value):null})}><option value="">Rumah Sakit (lintas unit)</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        </div>
        <div className="govFormRow">
          <label>Penanggung jawab<input value={draft.responsible_person||''} onChange={e=>setDraft({...draft,responsible_person:e.target.value})}/></label>
          <label>Tenggat<input type="date" value={draft.due_date||''} onChange={e=>setDraft({...draft,due_date:e.target.value})}/></label>
        </div>
        {draft.id&&<label>Status<select value={draft.status||'aktif'} onChange={e=>setDraft({...draft,status:e.target.value as PriorityArea['status']})}><option value="aktif">Aktif</option><option value="berjalan">Berjalan</option><option value="tercapai">Tercapai</option><option value="ditunda">Ditunda</option><option value="dibatalkan">Dibatalkan</option></select></label>}
      </div>}
    </AurekaModal>

    <AurekaModal open={screen==='timeline'&&Boolean(activityDraft)} title={activityDraft?.id?'Edit Kegiatan Timeline':'Tambah Kegiatan Timeline'} subtitle="Catat rentang waktu dan progres kegiatan yang dapat ditelusuri pada Gantt tahunan." closeDisabled={activityBusy} onClose={()=>setActivityDraft(null)}
      footer={<><button type="button" className="akBtn akBtnGhost" disabled={activityBusy} onClick={()=>setActivityDraft(null)}>Batal</button><button type="button" className="akBtn akBtnPrimary" disabled={activityBusy||String(activityDraft?.title||'').trim().length<5||!activityDraft?.start_date||!activityDraft?.end_date} onClick={()=>void saveActivity()}>{activityBusy?'Menyimpan…':'Simpan Kegiatan'}</button></>}>
      {activityDraft&&<div className="govForm">
        <label>Nama kegiatan<input value={activityDraft.title||''} onChange={e=>setActivityDraft({...activityDraft,title:e.target.value})} placeholder="Contoh: Audit kepatuhan identifikasi pasien"/></label>
        <label>Deskripsi / ruang lingkup<textarea rows={2} value={activityDraft.description||''} onChange={e=>setActivityDraft({...activityDraft,description:e.target.value})}/></label>
        <label>Output yang diharapkan<textarea rows={2} value={activityDraft.expected_output||''} onChange={e=>setActivityDraft({...activityDraft,expected_output:e.target.value})}/></label>
        <div className="govFormRow">
          <label>Tanggal mulai<input type="date" value={activityDraft.start_date||''} onChange={e=>setActivityDraft({...activityDraft,start_date:e.target.value})}/></label>
          <label>Tanggal selesai<input type="date" value={activityDraft.end_date||''} onChange={e=>setActivityDraft({...activityDraft,end_date:e.target.value})}/></label>
        </div>
        <div className="govFormRow">
          <label>Unit pemilik<select value={activityDraft.owner_room_id??''} onChange={e=>setActivityDraft({...activityDraft,owner_room_id:e.target.value?Number(e.target.value):null})}><option value="">Lintas Rumah Sakit</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
          <label>Penanggung jawab<input value={activityDraft.responsible_person||''} onChange={e=>setActivityDraft({...activityDraft,responsible_person:e.target.value})}/></label>
        </div>
        <div className="govFormRow">
          <label>Status<select value={activityDraft.status||'planned'} onChange={e=>setActivityDraft({...activityDraft,status:e.target.value as ProgramActivity['status']})}><option value="planned">Direncanakan</option><option value="in_progress">Berjalan</option><option value="completed">Selesai</option><option value="on_hold">Ditunda</option><option value="cancelled">Dibatalkan</option></select></label>
          <label>Progres (%)<input type="number" min="0" max="100" value={activityDraft.progress_percent??0} onChange={e=>setActivityDraft({...activityDraft,progress_percent:Math.max(0,Math.min(100,Number(e.target.value)||0))})}/></label>
        </div>
      </div>}
      {activityError&&<div className="rmNotice error" role="alert"><span>Perlu perhatian</span><p>{activityError}</p></div>}
    </AurekaModal>

    <style jsx>{`
      .annualProgramHome{display:grid;gap:16px}
      .annualTimelinePanel{border:1px solid var(--line,rgba(20,34,27,.12));border-radius:18px;padding:16px;background:var(--surface,#fff);display:grid;gap:12px;min-width:0}
      .annualTimelineHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
      .annualTimelineHead h4{margin:4px 0;font-size:15px}.annualTimelineHead p{margin:0;color:var(--muted,#718078);font-size:12px;line-height:1.55;max-width:760px}
      .annualTimelineScroll{overflow-x:auto;min-width:0;padding-bottom:4px}
      .annualTimelineMonthHead,.annualTimelineTrack{display:grid;grid-template-columns:repeat(12,minmax(38px,1fr));min-width:610px}
      .annualTimelineMonthHead span{text-align:center;padding:7px 2px;font-size:11px;font-weight:800;color:var(--muted,#65756c);border-bottom:1px solid var(--line,rgba(20,34,27,.12))}
      .annualTimelineRows{display:grid}
      .annualTimelineRow{padding:10px 0;border-bottom:1px solid var(--line,rgba(20,34,27,.09));min-width:0}
      .annualTimelineRowMeta{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap;margin-bottom:8px}
      .annualTimelineRowMeta strong{display:block;font-size:12px}.annualTimelineRowMeta small{display:block;margin-top:3px;color:var(--muted,#718078);font-size:11px;line-height:1.45}
      .annualTimelineRowActions{display:flex;align-items:center;gap:7px;flex-wrap:wrap}
      .annualTimelineTrack{position:relative;min-width:610px;min-height:24px;align-items:stretch}
      .annualTimelineMonthCell{grid-row:1;height:24px;border-left:1px solid var(--line,rgba(20,34,27,.09));background:rgba(80,110,90,.025)}
      .annualTimelineBar{grid-row:1;z-index:1;align-self:center;height:13px;border-radius:20px;overflow:hidden;background:rgba(80,110,90,.18);position:relative;margin:0 2px}
      .annualTimelineBar>span{display:block;height:100%;border-radius:20px;background:var(--accent,#26866a)}
      .annualTimelineBar.completed>span{background:#26866a}.annualTimelineBar.on_hold>span{background:#bb8a32}.annualTimelineBar.cancelled>span{background:#a94c45}
      .annualTimelineOutput{font-size:12px;color:var(--aureka-color-foreground-secondary);margin:5px 0 0}
      @media(max-width:720px){
        .annualTimelineMonthHead,.annualTimelineTrack{display:none}
        .annualTimelineRows{gap:9px}
        .annualTimelineRow{padding:11px 10px;border:1px solid var(--aureka-color-border);border-inline-start:3px solid var(--aureka-color-information);border-radius:10px}
        .annualTimelineRowMeta{margin:0}
      }
      .annualProgramLegacy{margin-top:4px;padding-top:16px;border-top:1px solid var(--line,rgba(20,34,27,.1));display:grid;gap:10px}.annualProgramLegacyHead h4{margin:4px 0;font-size:14px}.annualProgramLegacyHead p{margin:0;color:var(--muted,#718078);font-size:12px;line-height:1.55}.annualProgramCards{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;margin-top:18px}
      .annualProgramCard{display:flex;align-items:flex-start;gap:14px;text-align:left;padding:20px;border:1px solid var(--line,rgba(20,34,27,.12));border-radius:18px;background:var(--surface,#fff);color:var(--text,#20372d);cursor:pointer;min-width:0;transition:border-color .18s,transform .18s}
      .annualProgramCard:hover{border-color:var(--accent,#26866a);transform:translateY(-1px)}
      .annualProgramCardIcon{display:grid;place-items:center;width:42px;height:42px;flex:0 0 42px;border-radius:13px;background:var(--surface-soft,#eef5f1);font-size:22px}
      .annualProgramCardBody{display:grid;gap:7px;min-width:0}
      .annualProgramCardBody strong{font-size:14px;font-weight:800}
      .annualProgramCardBody small{font-size:12px;line-height:1.55;color:var(--muted,#718078)}
      .annualProgramCardMeta{font-size:12px;color:var(--accent,#26866a);font-weight:700}
      .annualProgramCardArrow{margin-left:auto;font-size:20px;color:var(--muted,#718078)}
      .annualPriorityToolbar{justify-content:space-between;margin:14px 0}
      .annualPriorityGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
      .annualPriorityCard{border:1px solid var(--line,rgba(20,34,27,.12));border-radius:16px;padding:15px;background:var(--surface,#fff);min-width:0}
      .annualPriorityCard header{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .annualPriorityCard h4{margin:5px 0 0;font-size:14px;line-height:1.4}
      .annualPriorityCard p{font-size:12px;line-height:1.6;color:var(--muted,#65756c);white-space:pre-wrap}
      .annualPriorityProblem{font-weight:650;color:var(--text,#20372d)!important}
      .annualPriorityOutcome{display:grid;gap:4px;border-left:3px solid var(--accent,#26866a);padding-left:10px;font-size:12px;line-height:1.5}
      .annualPriorityMeta{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:13px;font-size:12px;color:var(--muted,#718078)}
      .annualPriorityCard footer{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;border-top:1px solid var(--line,rgba(20,34,27,.1));padding-top:10px;margin-top:12px;font-size:12px;color:var(--muted,#718078)}
      @media(max-width:700px){.annualProgramCard{padding:15px}}
    `}</style>
  </section>
}
