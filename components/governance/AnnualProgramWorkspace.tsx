'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import AurekaModal from '@/components/ui/AurekaModal'
import AsyncStatePanel from '@/components/AsyncStatePanel'
import IndicatorProposalWorkspace from '@/components/IndicatorProposalWorkspace'

type Room = { id: number; name: string }
type PriorityArea = {
  id: string; program_year: number; code: string | null; title: string; problem_statement: string
  rationale: string; target_outcome: string; priority: 'tinggi'|'sedang'|'rendah'
  owner_room_id: number | null; room_name: string | null; responsible_person: string
  due_date: string | null; status: 'aktif'|'berjalan'|'tercapai'|'ditunda'|'dibatalkan'
}
type Draft = Partial<PriorityArea>
type ProgramPayload = { can_manage: boolean; priority_areas: PriorityArea[] }
type Screen = 'home'|'priorities'|'proposals'

const AnnualQualitySettings = dynamic(() => import('@/components/QualitySettings'), { ssr: false, loading: () => <AsyncStatePanel state="loading" title="Memuat Program Kerja" compact /> })

const STATUS:Record<PriorityArea['status'],string>={aktif:'Aktif',berjalan:'Berjalan',tercapai:'Tercapai',ditunda:'Ditunda',dibatalkan:'Dibatalkan'}
const PRIORITY:Record<PriorityArea['priority'],string>={tinggi:'Tinggi',sedang:'Sedang',rendah:'Rendah'}
const fmtDate=(v?:string|null)=>v?new Date(v+'T12:00:00').toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):'Belum ditetapkan'

export default function AnnualProgramWorkspace({rooms,role,currentRoomId}:{rooms:Room[];role:string|null;currentRoomId:number|null}) {
  const [screen,setScreen]=useState<Screen>('home')
  const [year,setYear]=useState(new Date().getFullYear())
  const [rows,setRows]=useState<PriorityArea[]>([])
  const [draft,setDraft]=useState<Draft|null>(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const canManage=role==='ADMIN'||role==='PMKP'

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
      <div><span className="rmEyebrow">Program · Perencanaan Mutu</span><h3>{screen==='home'?'Program Kerja Tahunan':screen==='priorities'?'Area Prioritas':'Usulan Indikator Baru'}</h3>
        <p>{screen==='home'?'Pusat pengelolaan prioritas peningkatan mutu dan pengembangan indikator rumah sakit.':screen==='priorities'?'Tetapkan masalah prioritas, sasaran hasil, pemilik, dan tenggat untuk tahun berjalan.':'Pengajuan dan telaah indikator mutu baru sebelum diaktifkan ke katalog indikator.'}</p>
      </div>
      <div className="govHeadTools">
        {screen!=='home'&&<button type="button" className="rmButton" onClick={()=>setScreen('home')}>← Kembali ke Program</button>}
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
    <div className="annualProgramCards">
      <button type="button" className="annualProgramCard" onClick={()=>setScreen('priorities')}>
        <span className="annualProgramCardIcon" aria-hidden="true">◎</span>
        <span className="annualProgramCardBody"><strong>Area Prioritas</strong><small>Daftar masalah strategis, sasaran mutu, unit pemilik, dan rencana penyelesaian.</small><span className="annualProgramCardMeta">{loading?'Memuat…':`${rows.length} area · ${activeCount} masih berjalan`}</span></span>
        
      </button>
      <button type="button" className="annualProgramCard" onClick={()=>setScreen('proposals')}>
        <span className="annualProgramCardIcon" aria-hidden="true">▤</span>
        <span className="annualProgramCardBody"><strong>Usulan Indikator Baru</strong><small>Ajukan, telaah, revisi, setujui, dan aktivasi indikator baru ke katalog mutu.</small><span className="annualProgramCardMeta">Workflow pengembangan indikator · jejak telaah tersimpan</span></span>
        
      </button>
    </div>
    {role==='ADMIN'&&<section className="annualProgramLegacy">
      <div className="annualProgramLegacyHead"><span className="rmEyebrow">Klasifikasi Program</span><h4>Program Kerja Rumah Sakit</h4><p>Pengelolaan klasifikasi program kerja yang menjadi dasar pengelompokan indikator mutu tetap tersedia di sini.</p></div>
      <AnnualQualitySettings rooms={rooms} initialTab="programs" showTabs={false} initialRoomId={currentRoomId} lockRoomScope={false}/>
    </section>}
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

    {screen==='proposals'&&<IndicatorProposalWorkspace rooms={rooms} role={role} currentRoomId={currentRoomId}/>}

    <AurekaModal open={Boolean(draft)} title={draft?.id?'Edit Area Prioritas':'Tambah Area Prioritas'} subtitle="Rumusan masalah dan sasaran hasil menjadi dasar penetapan intervensi." closeDisabled={busy} onClose={()=>setDraft(null)}
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

    <style jsx>{`
      .annualProgramHome{display:grid;gap:16px}.annualProgramLegacy{margin-top:4px;padding-top:16px;border-top:1px solid var(--line,rgba(20,34,27,.1));display:grid;gap:10px}.annualProgramLegacyHead h4{margin:4px 0;font-size:14px}.annualProgramLegacyHead p{margin:0;color:var(--muted,#718078);font-size:11px;line-height:1.55}.annualProgramCards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:18px}
      .annualProgramCard{display:flex;align-items:flex-start;gap:14px;text-align:left;padding:20px;border:1px solid var(--line,rgba(20,34,27,.12));border-radius:18px;background:var(--surface,#fff);color:var(--text,#20372d);cursor:pointer;min-width:0;transition:border-color .18s,transform .18s}
      .annualProgramCard:hover{border-color:var(--accent,#26866a);transform:translateY(-1px)}
      .annualProgramCardIcon{display:grid;place-items:center;width:42px;height:42px;flex:0 0 42px;border-radius:13px;background:var(--surface-soft,#eef5f1);font-size:22px}
      .annualProgramCardBody{display:grid;gap:7px;min-width:0}
      .annualProgramCardBody strong{font-size:14px;font-weight:800}
      .annualProgramCardBody small{font-size:11px;line-height:1.55;color:var(--muted,#718078)}
      .annualProgramCardMeta{font-size:11px;color:var(--accent,#26866a);font-weight:700}
      .annualProgramCardArrow{margin-left:auto;font-size:20px;color:var(--muted,#718078)}
      .annualPriorityToolbar{justify-content:space-between;margin:14px 0}
      .annualPriorityGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px}
      .annualPriorityCard{border:1px solid var(--line,rgba(20,34,27,.12));border-radius:16px;padding:15px;background:var(--surface,#fff);min-width:0}
      .annualPriorityCard header{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}
      .annualPriorityCard h4{margin:5px 0 0;font-size:14px;line-height:1.4}
      .annualPriorityCard p{font-size:11px;line-height:1.6;color:var(--muted,#65756c);white-space:pre-wrap}
      .annualPriorityProblem{font-weight:650;color:var(--text,#20372d)!important}
      .annualPriorityOutcome{display:grid;gap:4px;border-left:3px solid var(--accent,#26866a);padding-left:10px;font-size:11px;line-height:1.5}
      .annualPriorityMeta{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:13px;font-size:11px;color:var(--muted,#718078)}
      .annualPriorityCard footer{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;border-top:1px solid var(--line,rgba(20,34,27,.1));padding-top:10px;margin-top:12px;font-size:11px;color:var(--muted,#718078)}
      @media(max-width:700px){.annualProgramCards{grid-template-columns:1fr}.annualProgramCard{padding:15px}}
    `}</style>
  </section>
}
