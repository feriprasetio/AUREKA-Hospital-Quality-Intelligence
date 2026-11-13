'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import AsyncStatePanel from '@/components/AsyncStatePanel'
import WorkspaceModuleHeader from '@/components/workspace/WorkspaceModuleHeader'
import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'
import { toUserFacingError } from '@/lib/ui/error-feedback'

type Room = { id: number; name: string }
type Proposal = {
  id: string; room_id: number; room_name: string; profile_year: number; proposed_code: string | null
  title: string; indicator_type: string; category: string; rationale: string; unit_of_measure: string
  target_text: string; target_operator: string; target_value: number | null; numerator_definition: string
  denominator_definition: string; measurement_grain: string; indicator_direction: string; measurement_type: string
  status: 'diajukan'|'perlu_revisi'|'disetujui'|'ditolak'|'aktif'; submitter_name: string
  submitted_at: string; reviewer_name: string | null; review_note: string; activated_profile_id: string | null
}
type Payload = Omit<Proposal,'id'|'room_name'|'status'|'submitter_name'|'submitted_at'|'reviewer_name'|'review_note'|'activated_profile_id'>
const EMPTY = (roomId:number,year:number):Payload => ({
  room_id:roomId,profile_year:year,proposed_code:'',title:'',indicator_type:'IMP-Unit',category:'',
  rationale:'',unit_of_measure:'Persentase (%)',target_text:'',target_operator:'>=',target_value:null,
  numerator_definition:'',denominator_definition:'',measurement_grain:'activity',
  indicator_direction:'positive',measurement_type:'ratio'
})
const statusText:Record<Proposal['status'],string>={diajukan:'Menunggu telaah PMKP',perlu_revisi:'Perlu revisi pengusul',disetujui:'Disetujui · menunggu aktivasi',ditolak:'Ditolak',aktif:'Aktif di katalog indikator'}
const fmt=(v:string)=>new Date(v).toLocaleString('id-ID',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Pontianak'})

export default function IndicatorProposalWorkspace({rooms,role,currentRoomId}:{rooms:Room[];role:string|null;currentRoomId:number|null}) {
  const canReview=role==='ADMIN'||role==='PMKP'
  const canSubmit=['ADMIN','PMKP','PIC'].includes(role||'')
  const [rows,setRows]=useState<Proposal[]>([])
  const [form,setForm]=useState<Payload|null>(null)
  const [editingId,setEditingId]=useState<string|null>(null)
  const [loading,setLoading]=useState(true)
  const [busy,setBusy]=useState(false)
  const [error,setError]=useState('')
  const [message,setMessage]=useState('')
  const [reviewNotes,setReviewNotes]=useState<Record<string,string>>({})
  const [activationCodes,setActivationCodes]=useState<Record<string,string>>({})
  const [filter,setFilter]=useState('all')
  const roomChoices=useMemo(()=>role==='PIC'?rooms.filter(r=>Number(r.id)===Number(currentRoomId)):rooms,[role,rooms,currentRoomId])
  const load=useCallback(async()=>{
    setLoading(true);setError('')
    const {data,error:rpcError}=await aurekaSupabase.rpc('aureka_gov_indicator_proposal_list')
    if(rpcError){setError('Daftar usulan indikator belum dapat dimuat: '+toUserFacingError(rpcError, { fallback: 'Periksa koneksi lalu coba lagi. Jika berulang, hubungi admin AUREKA.' }));setLoading(false);return}
    const list=(data?.rows||[]) as Proposal[]
    setRows(list)
    setActivationCodes(prev=>{const next={...prev};for(const item of list)if(!next[item.id])next[item.id]=item.proposed_code||'';return next})
    setLoading(false)
  },[])
  useEffect(()=>{void load()},[load])
  useEffect(()=>{const text=error||message;if(text)window.dispatchEvent(new CustomEvent('aureka:notification',{detail:{message:text,type:error?'error':'success',module:'Usulan Indikator'}}))},[error,message])
  const visible=useMemo(()=>rows.filter(r=>filter==='all'||r.status===filter),[rows,filter])
  const startNew=()=>{const selectedRoom=Number(roomChoices[0]?.id||currentRoomId||0);if(!selectedRoom){setError('Unit kerja akun belum terpetakan. Hubungi Super Admin/Komite PMKP sebelum mengajukan indikator.');return}setEditingId(null);setForm(EMPTY(selectedRoom,new Date().getFullYear()));setError('');setMessage('')}
  const editAgain=(row:Proposal)=>{setEditingId(row.id);setForm({...row});setError('');setMessage('')}
  const closeForm=()=>{if(!busy){setForm(null);setEditingId(null)}}
  const proposalDialogRef=useAccessibleDialog<HTMLDivElement>({open:Boolean(form),onClose:closeForm,lockScroll:true})
  const save=async()=>{
    if(!form||busy)return
    if(!form.room_id||form.title.trim().length<5||form.rationale.trim().length<20||form.numerator_definition.trim().length<5||form.denominator_definition.trim().length<5||!form.unit_of_measure.trim()){
      setError('Lengkapi unit, nama indikator, justifikasi (minimal 20 karakter), satuan, serta definisi numerator dan denominator.');return
    }
    setBusy(true);setError('');setMessage('')
    const {error:saveError}=await aurekaSupabase.rpc('aureka_gov_indicator_proposal_save',{p:{...form,id:editingId}})
    if(saveError)setError(saveError.message)
    else{setMessage(editingId?'Usulan revisi berhasil diajukan ulang.':'Usulan indikator berhasil dikirim untuk telaah Komite PMKP.');setForm(null);setEditingId(null);await load()}
    setBusy(false)
  }
  const review=async(id:string,decision:'setujui'|'revisi'|'tolak')=>{
    if(busy)return
    const note=reviewNotes[id]||''
    if(decision!=='setujui'&&note.trim().length<10){setError('Alasan revisi atau penolakan minimal 10 karakter.');return}
    setBusy(true);setError('');setMessage('')
    const {error:rpcError}=await aurekaSupabase.rpc('aureka_gov_indicator_proposal_review',{p_id:id,p_decision:decision,p_note:note})
    if(rpcError)setError(rpcError.message)
    else{setMessage('Keputusan telaah berhasil disimpan.');await load()}
    setBusy(false)
  }
  const activate=async(row:Proposal)=>{
    if(busy)return
    const code=(activationCodes[row.id]||'').trim()
    if(!code){setError('Tetapkan kode indikator final sebelum aktivasi.');return}
    if(!window.confirm('Aktifkan indikator '+code+' ke katalog Profil Indikator Mutu untuk '+row.room_name+' tahun '+row.profile_year+'?'))return
    setBusy(true);setError('');setMessage('')
    const {data:profileId,error:rpcError}=await aurekaSupabase.rpc('aureka_gov_indicator_proposal_activate',{p_id:row.id,p_code:code})
    if(rpcError)setError(rpcError.message)
    else{setMessage('Indikator berhasil diaktifkan ke katalog. ID profil: '+profileId);await load()}
    setBusy(false)
  }
  const field=(key:keyof Payload,label:string,kind:'text'|'number'|'textarea'|'select'='text',options?:string[])=><label className="ipField"><span>{label}</span>{kind==='textarea'?<textarea rows={3} value={String(form?.[key]??'')} onChange={e=>setForm(v=>v?{...v,[key]:e.target.value}:v)}/>:kind==='select'?<select value={String(form?.[key]??'')} onChange={e=>setForm(v=>v?{...v,[key]:e.target.value}:v)}>{(options||[]).map(o=><option key={o} value={o}>{o}</option>)}</select>:<input type={kind} value={form?.[key]===null?'':String(form?.[key]??'')} onChange={e=>setForm(v=>v?{...v,[key]:kind==='number'?(e.target.value===''?null:Number(e.target.value)):e.target.value}:v)}/>}</label>

  return <section className="indicatorProposals">
    <style>{`
      .indicatorProposals{display:grid;gap:14px;min-width:0;color:var(--text,#20372d)}
      .ipPanel{background:#fff;border:1px solid var(--line,#e4ebe6);border-radius:15px;padding:16px;min-width:0}
      .ipIntro{font-size:11px;line-height:1.6;color:var(--muted,#66776d);margin:5px 0 0;max-width:900px}
      .ipToolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
      .ipBtn{border:1px solid #dce6df;background:#fff;border-radius:9px;padding:9px 12px;font-size:11px;font-weight:800;color:#294436;min-height:37px;cursor:pointer}
      .ipBtn.primary{background:#145b42;color:#fff;border-color:#145b42}
      .ipBtn.warn{background:#fff8e8;border-color:#ead9b4;color:#795b20}
      .ipBtn.danger{background:#fff4f2;border-color:#ebd0cc;color:#8c3931}
      .ipBtn:disabled{opacity:.55;cursor:wait}
      .ipFilters{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}
      .ipFilters select,.ipField input,.ipField select,.ipField textarea{width:100%;min-width:0;border:1px solid #dce6df;border-radius:9px;background:#fff;padding:10px 11px;color:#263a2f;font-size:12px;min-height:39px}
      .ipField{display:grid;gap:5px;font-size:11px;font-weight:800;color:#63736a}
      .ipField textarea{resize:vertical;min-height:80px}
      .ipFormGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin-top:13px}
      .ipField.full{grid-column:1/-1}
      .ipFormTitle{font-size:15px;font-weight:850;margin:0}
      .ipRows{display:grid;gap:10px}
      .ipCard{border:1px solid #e4ebe6;border-radius:13px;padding:14px;background:#fff;min-width:0}
      .ipCardHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}
      .ipCard h4{font-size:14px;margin:0;color:#24382d}
      .ipMeta{font-size:11px;color:#718078;line-height:1.6;margin-top:5px}
      .ipStatus{display:inline-flex;border-radius:999px;padding:5px 8px;background:#eef3ef;color:#43634e;font-size:11px;font-weight:850}
      .ipDetail{font-size:11px;line-height:1.55;color:#4e6156;margin-top:10px}
      .ipReview{display:grid;gap:8px;margin-top:12px;padding-top:12px;border-top:1px solid #edf1ee}
      .ipReview textarea{width:100%;border:1px solid #dce6df;border-radius:9px;padding:10px;font-size:11px;min-height:62px}
      .ipActivation{display:grid;grid-template-columns:minmax(130px,1fr) auto;gap:8px;margin-top:12px}
      .ipActivation input{min-width:0;border:1px solid #dce6df;border-radius:9px;padding:9px;font-size:11px}
      .ipError{border:1px solid #efcfca;background:#fff5f3;color:#903c32;border-radius:10px;padding:10px;font-size:11px}
      .ipSuccess{border:1px solid #d6e9dc;background:#f4faf5;color:#276341;border-radius:10px;padding:10px;font-size:11px}
      .ipOverlay{position:fixed;inset:0;z-index:1200;background:rgba(15,29,22,.48);backdrop-filter:blur(4px);display:grid;place-items:center;padding:18px;overflow:auto}
      .ipModal{width:min(900px,100%);max-height:min(92vh,900px);overflow:auto;box-shadow:0 24px 80px rgba(10,30,20,.25)}
      @media(max-width:640px){.ipPanel{padding:13px}.ipFormGrid{grid-template-columns:1fr}.ipField.full{grid-column:auto}.ipActivation{grid-template-columns:1fr}}
    `}</style>
    <div className="ipPanel">
      <WorkspaceModuleHeader title="Usulan Indikator Mutu Baru" description="Sarana resmi bagi PIC untuk mengusulkan indikator baru. Usulan ditelaah Komite PMKP, dikembalikan untuk revisi bila diperlukan, lalu disetujui dan diaktifkan ke katalog Profil Indikator Mutu." actions={<div className="ipToolbar">{canSubmit&&<button className="ipBtn primary" type="button" onClick={startNew}>+ Ajukan indikator</button>}<button className="ipBtn" type="button" onClick={()=>void load()} disabled={loading}>Muat ulang</button></div>}/>
      <p className="ipIntro">Pengajuan tidak langsung menjadi indikator aktif. Aktivasi hanya dilakukan setelah telaah dan persetujuan Komite PMKP. Data logbook historis tidak diubah oleh proses ini.</p>
      {error&&<div className="ipError" role="alert">{error}</div>}{message&&<div className="ipSuccess" role="status">{message}</div>}
      <div className="ipFilters"><select aria-label="Filter status usulan" value={filter} onChange={e=>setFilter(e.target.value)}><option value="all">Semua status</option>{Object.entries(statusText).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select><span className="ipMeta">{visible.length} dari {rows.length} usulan</span></div>
    </div>
    {loading?<AsyncStatePanel state="loading" title="Memuat usulan indikator" compact/>:error&&!rows.length?<AsyncStatePanel state="error" title="Daftar usulan belum tersedia" description={error} onRetry={()=>void load()} compact/>:<div className="ipRows">
      {visible.map(row=><article className="ipCard" key={row.id}>
        <div className="ipCardHead"><div><h4>{row.proposed_code?row.proposed_code+' · ':''}{row.title}</h4><div className="ipMeta">{row.room_name} · {row.profile_year} · {row.indicator_type} · Diajukan {fmt(row.submitted_at)} oleh {row.submitter_name}</div></div><span className="ipStatus">{statusText[row.status]}</span></div>
        <div className="ipDetail"><strong>Justifikasi:</strong> {row.rationale}<br/><strong>Pengukuran:</strong> {row.numerator_definition} / {row.denominator_definition}<br/><strong>Target:</strong> {row.target_text||'Belum ditentukan'} · <strong>Satuan:</strong> {row.unit_of_measure} · <strong>Grain:</strong> {row.measurement_grain}</div>
        {row.review_note&&<div className="ipDetail"><strong>Catatan telaah {row.reviewer_name?'oleh '+row.reviewer_name:''}:</strong> {row.review_note}</div>}
        {role==='PIC'&&row.status==='perlu_revisi'&&row.submitter_name&&<div className="ipToolbar" style={{marginTop:10}}><button type="button" className="ipBtn warn" onClick={()=>editAgain(row)}>Perbaiki usulan</button></div>}
        {canReview&&row.status==='diajukan'&&<div className="ipReview"><label className="ipField"><span>Catatan telaah (wajib untuk revisi/penolakan)</span><textarea value={reviewNotes[row.id]||''} onChange={e=>setReviewNotes(v=>({...v,[row.id]:e.target.value}))} placeholder="Tuliskan telaah ilmiah, kelayakan indikator, definisi operasional, dan rekomendasi…"/></label><div className="ipToolbar"><button className="ipBtn primary" type="button" disabled={busy} onClick={()=>void review(row.id,'setujui')}>Setujui</button><button className="ipBtn warn" type="button" disabled={busy} onClick={()=>void review(row.id,'revisi')}>Kembalikan untuk revisi</button><button className="ipBtn danger" type="button" disabled={busy} onClick={()=>void review(row.id,'tolak')}>Tolak</button></div></div>}
        {canReview&&row.status==='disetujui'&&<div className="ipActivation"><input aria-label={'Kode indikator final untuk '+row.title} value={activationCodes[row.id]||''} onChange={e=>setActivationCodes(v=>({...v,[row.id]:e.target.value}))} placeholder="Kode indikator final"/><button className="ipBtn primary" type="button" disabled={busy} onClick={()=>void activate(row)}>Aktifkan ke katalog</button></div>}
        {row.status==='aktif'&&<div className="ipMeta">Profil katalog: {row.activated_profile_id}</div>}
      </article>)}
      {visible.length===0&&<div className="ipPanel"><AsyncStatePanel state="empty" title="Tidak ada usulan pada filter ini" description="Ubah filter status atau ajukan indikator baru." compact/></div>}
    </div>}
    {form&&<div className="ipOverlay" role="presentation"><div ref={proposalDialogRef} tabIndex={-1} className="ipPanel ipModal" role="dialog" aria-modal="true" aria-labelledby="ip-form-title"><div className="ipCardHead"><div><h3 id="ip-form-title" className="ipFormTitle">{editingId?'Revisi usulan indikator':'Form pengajuan indikator baru'}</h3><p className="ipIntro">Lengkapi definisi indikator agar dapat ditelaah secara metodologis.</p></div><button className="ipBtn" type="button" data-dialog-autofocus onClick={closeForm} disabled={busy}>Tutup</button></div>
      <div className="ipFormGrid">
        <label className="ipField"><span>Unit pemilik</span><select value={String(form.room_id)} disabled={role==='PIC'} onChange={e=>setForm(v=>v?{...v,room_id:Number(e.target.value)}:v)}>{roomChoices.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        {field('profile_year','Tahun profil','number')}
        {field('proposed_code','Kode usulan (opsional)')}
        {field('title','Nama indikator')}
        {field('indicator_type','Kelompok indikator','select',['IMP-Unit','IMP-RS Manajemen Risiko','IMP-RS Pelayanan Klinis Prioritas','IMP-RS Sasaran Keselamatan Pasien','IMP-RS Perbaikan Sistem','IMP-RS Rencana Strategis Rumah Sakit','INM'])}
        {field('category','Kategori')}
        {field('unit_of_measure','Satuan')}
        {field('target_text','Target teks')}
        {field('target_operator','Operator target','select',['>=','<=','=','>','<'])}
        {field('target_value','Nilai target (angka, opsional)','number')}
        {field('measurement_grain','Grain pengukuran','select',['patient_episode','provider_day','daily_metric','event','activity','aggregate'])}
        {field('indicator_direction','Arah indikator','select',['positive','negative'])}
        {field('measurement_type','Tipe pengukuran','select',['ratio','compliance','visit','door','minutes','numeric','occurrence'])}
        {field('numerator_definition','Definisi pembilang (N)','textarea')}
        {field('denominator_definition','Definisi penyebut (D)','textarea')}
        <label className="ipField full"><span>Justifikasi / latar belakang masalah (minimal 20 karakter)</span><textarea rows={4} value={form.rationale} onChange={e=>setForm(v=>v?{...v,rationale:e.target.value}:v)}/></label>
      </div>
      <div className="ipToolbar" style={{justifyContent:'flex-end',marginTop:13}}><button className="ipBtn" type="button" onClick={closeForm} disabled={busy}>Batal</button><button className="ipBtn primary" type="button" onClick={()=>void save()} disabled={busy}>{busy?'Mengirim…':'Kirim usulan'}</button></div>
    </div></div>}
  </section>
}
