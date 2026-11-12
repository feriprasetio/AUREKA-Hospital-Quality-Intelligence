'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import AurekaModal from '@/components/ui/AurekaModal'
import WorkspaceTableViewport from '@/components/workspace/WorkspaceTableViewport'

type Room = { id: number; name: string }
type Issuer = 'DEWAN_PENGAWAS'|'DIREKTUR'|'KETUA_PMKP'|'KABID'
type Level = 'DEWAN_PENGAWAS'|'DIREKTUR'|'KABID'|'UNIT'
type Method = 'PDSA'|'PDCA'
type Recommendation = { id:string; code:string; source:string; issued_by_level:Issuer; title:string; description:string; priority:string; program_year:number; given_by_name:string|null; given_at:string; status:string }
type Evaluation = { result:string; decision:string; note:string; evaluator_name:string|null; evaluated_at:string }
type Action = { id:string; recommendation_id:string|null; title:string; description:string; responsible_level:Level; assigned_to_name:string|null; assigned_room_id:number|null; room_name:string|null; due_date:string|null; expected_output:string; status:string; progress_note:string; evidence_url:string|null; improvement_method:Method; cycle_plan:string; cycle_do:string; cycle_study_check:string; cycle_act:string; last_evaluation:Evaluation|null }
type Payload = { role:string; can_manage:boolean; can_evaluate:boolean; recommendations:Recommendation[]; actions:Action[] }
type IssuerFilter = 'ALL'|Issuer

const ISSUER_LABEL:Record<Issuer,string>={DEWAN_PENGAWAS:'Dewan Pengawas',DIREKTUR:'Direktur',KETUA_PMKP:'Ketua PMKP',KABID:'Kepala Bidang'}
const LEVEL_LABEL:Record<Level,string>={DEWAN_PENGAWAS:'Dewan Pengawas',DIREKTUR:'Direktur',KABID:'Kepala Bidang',UNIT:'Unit'}
const STATUS_LABEL:Record<string,string>={terbuka:'Terbuka',berjalan:'Berjalan',selesai:'Selesai · menunggu verifikasi',terverifikasi:'Terverifikasi efektif',dibatalkan:'Dibatalkan'}
const SOURCE_LABEL:Record<string,string>={ketua_pmkp:'Rekomendasi PMKP',audit:'Hasil audit',risiko:'Manajemen risiko',insiden:'Insiden keselamatan pasien',program:'Program kerja',lainnya:'Lainnya'}
const fmtDate=(v?:string|null)=>(v?new Date(v.length===10?v+'T12:00:00':v).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):'—')
const overdue=(a:Action)=>Boolean(a.due_date&&!['terverifikasi','dibatalkan','selesai'].includes(a.status)&&new Date(a.due_date+'T23:59:59')<new Date())
const suggestMethod=(text:string):Method=>/\b(sop|kebijakan|administrasi|alur|prosedur|dokumentasi|jadwal|formulir|standarisasi|standarisasi|kepatuhan proses)\b/i.test(text)?'PDCA':'PDSA'

export default function GovernanceProgramWorkspace({rooms}:{rooms:Room[]}) {
  const [year,setYear]=useState(new Date().getFullYear())
  const [issuerFilter,setIssuerFilter]=useState<IssuerFilter>('ALL')
  const [data,setData]=useState<Payload|null>(null)
  const [loading,setLoading]=useState(true)
  const [error,setError]=useState('')
  const [notice,setNotice]=useState('')
  const [busy,setBusy]=useState(false)
  const [recDraft,setRecDraft]=useState<Partial<Recommendation>|null>(null)
  const [actDraft,setActDraft]=useState<Partial<Action>|null>(null)
  const [progress,setProgress]=useState<Action|null>(null)
  const [evalFor,setEvalFor]=useState<Action|null>(null)
  const [evalForm,setEvalForm]=useState({result:'efektif',decision:'ditutup',note:'',evidence_url:''})

  const load=useCallback(async()=>{
    setLoading(true);setError('')
    const {data:d,error:e}=await aurekaSupabase.rpc('aureka_gov_program_list',{p_year:year})
    if(e)setError(/function .* does not exist|Could not find the function/i.test(e.message)?'Fitur Program belum aktif. Pastikan migration program_priority_and_pdsa_pdca sudah diterapkan di Supabase.':toUserFacingError(e,{fallback:'Data rekomendasi dan RTL belum dapat dimuat.'}))
    else setData(d as Payload)
    setLoading(false)
  },[year])
  useEffect(()=>{void load()},[load])

  const run=async(fn:()=>PromiseLike<{error:{message:string}|null}>,ok:string)=>{
    setBusy(true);setNotice('');setError('')
    const {error:e}=await fn();setBusy(false)
    if(e){setError(toUserFacingError(e as Error,{fallback:'Perubahan belum tersimpan.'}));return false}
    setNotice(ok);await load();return true
  }

  const canManage=Boolean(data?.can_manage)
  const canEvaluate=Boolean(data?.can_evaluate)
  const recommendations=useMemo(()=>(data?.recommendations??[]).filter(r=>issuerFilter==='ALL'||r.issued_by_level===issuerFilter),[data,issuerFilter])
  const actions=useMemo(()=>(data?.actions??[]),[data])
  const recTitle=useMemo(()=>new Map((data?.recommendations??[]).map(r=>[r.id,r.code+' · '+r.title])),[data])
  const orphanActions=actions.filter(a=>!a.recommendation_id)
  const canUpdateProgress=(a:Action)=>canManage||data?.role===a.responsible_level||(data?.role==='PIC'&&a.responsible_level==='UNIT')
  const openAction=(seed:Partial<Action>={})=>{
    const rec=data?.recommendations.find(r=>r.id===seed.recommendation_id)
    const method=suggestMethod([rec?.title,rec?.description,seed.title,seed.description].filter(Boolean).join(' '))
    setActDraft({responsible_level:'KABID',improvement_method:method,cycle_plan:'',cycle_do:'',cycle_study_check:'',cycle_act:'',...seed})
  }

  const actionTable=(list:Action[])=><WorkspaceTableViewport label="Rencana tindak lanjut" className="rmTableWrap"><table className="rmTable"><thead><tr><th>Tindak lanjut dan siklus perbaikan</th><th>Metode</th><th>Penanggung jawab</th><th>Tenggat</th><th>Status</th><th>Evaluasi</th><th>Aksi</th></tr></thead><tbody>
    {list.length?list.map(a=><tr key={a.id}>
      <td><b>{a.title}</b>{a.progress_note&&<small className="rmCellSmall">Progres: {a.progress_note}</small>}
        <details className="govCycleDetails"><summary>Lihat siklus {a.improvement_method||'PDSA'}</summary><div><b>Plan</b><p>{a.cycle_plan||'Belum diisi'}</p><b>Do</b><p>{a.cycle_do||'Belum diisi'}</p><b>{a.improvement_method==='PDCA'?'Check':'Study'}</b><p>{a.cycle_study_check||'Belum diisi'}</p><b>Act</b><p>{a.cycle_act||'Belum diisi'}</p></div></details>
      </td>
      <td><span className="govMethodTag">{a.improvement_method||'PDSA'}</span></td>
      <td>{LEVEL_LABEL[a.responsible_level]}{a.assigned_to_name&&<small className="rmCellSmall">{a.assigned_to_name}</small>}{a.room_name&&<small className="rmCellSmall">{a.room_name}</small>}</td>
      <td>{fmtDate(a.due_date)}{overdue(a)&&<small className="rmCellSmall govOverdue">Lewat tenggat</small>}</td>
      <td><span className={'govStatus '+a.status}>{STATUS_LABEL[a.status]||a.status}</span></td>
      <td>{a.last_evaluation?<><b>{a.last_evaluation.result.replace('_',' ')}</b><small className="rmCellSmall">{a.last_evaluation.decision} · {fmtDate(a.last_evaluation.evaluated_at)}</small></>:'—'}</td>
      <td><div className="rmActions">
        {canUpdateProgress(a)&&!['terverifikasi','dibatalkan'].includes(a.status)&&<button type="button" className="rmIconButton" onClick={()=>setProgress({...a})}>Progres</button>}
        {canManage&&<button type="button" className="rmIconButton" onClick={()=>openAction({...a})}>Edit</button>}
        {canEvaluate&&a.status==='selesai'&&<button type="button" className="rmIconButton" onClick={()=>{setEvalFor(a);setEvalForm({result:'efektif',decision:'ditutup',note:'',evidence_url:a.evidence_url||''})}}>Evaluasi</button>}
      </div></td>
    </tr>):<tr><td colSpan={7}><div className="rmEmptySmall">Belum ada rencana tindak lanjut.</div></td></tr>}
  </tbody></table></WorkspaceTableViewport>

  const selectedLabel=issuerFilter==='ALL'?'Semua pemberi rekomendasi':ISSUER_LABEL[issuerFilter]
  return <section className="rmPanel govWorkspace" aria-label="Rekomendasi dan rencana tindak lanjut">
    <div className="rmSectionHead"><div><span className="rmEyebrow">Program · Perbaikan Berkelanjutan</span><h3>Rekomendasi dan Rencana Tindak Lanjut</h3><p>Satu daftar terpadu. Filter berdasarkan pihak pemberi rekomendasi; setiap tindak lanjut wajib memiliki siklus perbaikan PDCA atau PDSA.</p></div>
      <div className="govHeadTools">
        <label className="govYear">Pemberi rekomendasi <select value={issuerFilter} onChange={e=>setIssuerFilter(e.target.value as IssuerFilter)}><option value="ALL">Semua</option><option value="DEWAN_PENGAWAS">Dewan Pengawas</option><option value="DIREKTUR">Direktur</option><option value="KETUA_PMKP">Ketua PMKP</option><option value="KABID">Kepala Bidang</option></select></label>
        <label className="govYear">Tahun <select value={year} onChange={e=>setYear(Number(e.target.value))}>{[0,1,2].map(d=>new Date().getFullYear()+1-d).map(y=><option key={y} value={y}>{y}</option>)}</select></label>
        {canManage&&<><button type="button" className="rmButton primary" onClick={()=>setRecDraft({source:'ketua_pmkp',issued_by_level:'KETUA_PMKP',priority:'sedang',program_year:year,given_at:new Date().toISOString().slice(0,10)})}>+ Rekomendasi</button><button type="button" className="rmButton" onClick={()=>openAction()}>+ Tindak lanjut</button></>}
      </div>
    </div>
    {error&&<div className="rmNotice error" role="alert"><span>Perlu perhatian</span><p>{error}</p></div>}
    {notice&&<div className="rmNotice" role="status"><span>Informasi</span><p>{notice}</p></div>}
    {loading?<div className="rmLoading"><span className="rmSpinner"/>Memuat…</div>:data&&<>
      <div className="rmKpis">
        <div className="rmKpi"><span>Rekomendasi · {selectedLabel}</span><strong>{recommendations.length}</strong></div>
        <div className="rmKpi"><span>Rencana tindak lanjut</span><strong>{actions.filter(a=>!a.recommendation_id||recommendations.some(r=>r.id===a.recommendation_id)).length}</strong></div>
        <div className="rmKpi"><span>Lewat tenggat</span><strong>{actions.filter(overdue).length}</strong></div>
        <div className="rmKpi"><span>Menunggu verifikasi</span><strong>{actions.filter(a=>a.status==='selesai').length}</strong></div>
        <div className="rmKpi"><span>Terverifikasi efektif</span><strong>{actions.filter(a=>a.status==='terverifikasi').length}</strong></div>
      </div>
      <div className="govRecList">
        {recommendations.length?recommendations.map(r=>{
          const kids=actions.filter(a=>a.recommendation_id===r.id)
          return <article key={r.id} className="govRec">
            <header><div><span className="govCode">{r.code}</span><h4>{r.title}</h4><small>{ISSUER_LABEL[r.issued_by_level]||r.issued_by_level} · {r.given_by_name||ISSUER_LABEL[r.issued_by_level]} · {fmtDate(r.given_at)} · {SOURCE_LABEL[r.source]||r.source} · Prioritas {r.priority}</small></div>
              {canManage&&<button type="button" className="rmIconButton" onClick={()=>setRecDraft({...r})}>Edit</button>}
            </header>
            {r.description&&<p>{r.description}</p>}
            {kids.length?actionTable(kids):<div className="rmEmptySmall">Belum ada rencana tindak lanjut untuk rekomendasi ini.{canManage&&<> <button type="button" className="textButton" onClick={()=>openAction({recommendation_id:r.id})}>Tambah tindak lanjut</button></>}</div>}
            {canManage&&kids.length>0&&<button type="button" className="textButton" onClick={()=>openAction({recommendation_id:r.id})}>+ Tambah tindak lanjut</button>}
          </article>
        }):<div className="rmEmptySmall">Belum ada rekomendasi untuk filter {selectedLabel.toLowerCase()} pada tahun {year}.</div>}
      </div>
      {orphanActions.length>0&&<section className="govOrphanActions"><h4>Tindak lanjut tanpa rekomendasi induk</h4>{actionTable(orphanActions)}</section>}
    </>}

    <AurekaModal open={Boolean(recDraft)} title={recDraft?.id?'Edit rekomendasi':'Rekomendasi baru'} subtitle="Pihak pemberi rekomendasi dan sumber masalah dicatat terpisah." closeDisabled={busy} onClose={()=>setRecDraft(null)}
      footer={<><button type="button" className="akBtn akBtnGhost" onClick={()=>setRecDraft(null)}>Batal</button><button type="button" className="akBtn akBtnPrimary" disabled={busy||!recDraft?.title||recDraft.title.trim().length<5} onClick={async()=>{if(await run(()=>aurekaSupabase.rpc('aureka_gov_save_recommendation',{p:recDraft}),'Rekomendasi tersimpan.'))setRecDraft(null)}}>{busy?'Menyimpan…':'Simpan'}</button></>}>
      {recDraft&&<div className="govForm">
        <label>Judul rekomendasi<input value={recDraft.title||''} onChange={e=>setRecDraft({...recDraft,title:e.target.value})} placeholder="Tuliskan rekomendasi atau masalah yang perlu ditangani"/></label>
        <label>Uraian / masalah yang diangkat<textarea rows={4} value={recDraft.description||''} onChange={e=>setRecDraft({...recDraft,description:e.target.value})}/></label>
        <div className="govFormRow">
          <label>Pemberi rekomendasi<select value={recDraft.issued_by_level||'KETUA_PMKP'} onChange={e=>setRecDraft({...recDraft,issued_by_level:e.target.value as Issuer})}><option value="DEWAN_PENGAWAS">Dewan Pengawas</option><option value="DIREKTUR">Direktur</option><option value="KETUA_PMKP">Ketua PMKP</option><option value="KABID">Kepala Bidang</option></select></label>
          <label>Kategori sumber<select value={recDraft.source||'ketua_pmkp'} onChange={e=>setRecDraft({...recDraft,source:e.target.value})}>{Object.entries(SOURCE_LABEL).map(([k,v])=><option key={k} value={k}>{v}</option>)}</select></label>
        </div>
        <div className="govFormRow">
          <label>Prioritas<select value={recDraft.priority||'sedang'} onChange={e=>setRecDraft({...recDraft,priority:e.target.value})}><option value="tinggi">Tinggi</option><option value="sedang">Sedang</option><option value="rendah">Rendah</option></select></label>
          <label>Nama pemberi rekomendasi<input value={recDraft.given_by_name||''} onChange={e=>setRecDraft({...recDraft,given_by_name:e.target.value})} placeholder={ISSUER_LABEL[(recDraft.issued_by_level||'KETUA_PMKP') as Issuer]}/></label>
        </div>
        <div className="govFormRow">
          <label>Tahun program<input type="number" value={recDraft.program_year||year} onChange={e=>setRecDraft({...recDraft,program_year:Number(e.target.value)})}/></label>
          <label>Tanggal rekomendasi<input type="date" value={recDraft.given_at||''} onChange={e=>setRecDraft({...recDraft,given_at:e.target.value})}/></label>
        </div>
        {recDraft.id&&<label>Status<select value={recDraft.status||'aktif'} onChange={e=>setRecDraft({...recDraft,status:e.target.value})}><option value="aktif">Aktif</option><option value="selesai">Selesai</option><option value="dibatalkan">Dibatalkan</option></select></label>}
      </div>}
    </AurekaModal>

    <AurekaModal open={Boolean(actDraft)} title={actDraft?.id?'Edit rencana tindak lanjut':'Rencana tindak lanjut baru'} subtitle="Pilih metode berdasarkan karakter masalah, lalu lengkapi empat tahap siklus." closeDisabled={busy} onClose={()=>setActDraft(null)}
      footer={<><button type="button" className="akBtn akBtnGhost" onClick={()=>setActDraft(null)}>Batal</button><button type="button" className="akBtn akBtnPrimary" disabled={busy||!actDraft?.title||actDraft.title.trim().length<5||(!actDraft.id&&![actDraft.cycle_plan,actDraft.cycle_do,actDraft.cycle_study_check,actDraft.cycle_act].every(x=>String(x||'').trim().length>=5))} onClick={async()=>{if(await run(()=>aurekaSupabase.rpc('aureka_gov_save_action',{p:actDraft}),'Rencana tindak lanjut tersimpan.'))setActDraft(null)}}>{busy?'Menyimpan…':'Simpan RTL'}</button></>}>
      {actDraft&&<div className="govForm">
        <label>Rekomendasi induk<select value={actDraft.recommendation_id||''} onChange={e=>setActDraft({...actDraft,recommendation_id:e.target.value||null,improvement_method:suggestMethod(data?.recommendations.find(r=>r.id===e.target.value)?.title||'')})}><option value="">— Tanpa rekomendasi —</option>{(data?.recommendations??[]).map(r=><option key={r.id} value={r.id}>{r.code} · {r.title}</option>)}</select></label>
        <label>Rencana tindak lanjut<input value={actDraft.title||''} onChange={e=>setActDraft({...actDraft,title:e.target.value})} placeholder="Rumusan intervensi/perubahan yang akan dilakukan"/></label>
        <label>Uraian<textarea rows={3} value={actDraft.description||''} onChange={e=>setActDraft({...actDraft,description:e.target.value})}/></label>
        <div className="govFormRow">
          <label>Metode perbaikan<select value={actDraft.improvement_method||'PDSA'} onChange={e=>setActDraft({...actDraft,improvement_method:e.target.value as Method})}><option value="PDSA">PDSA · uji perubahan berbasis data</option><option value="PDCA">PDCA · kendali dan standardisasi proses</option></select></label>
          <label>Level penanggung jawab<select value={actDraft.responsible_level||'KABID'} onChange={e=>setActDraft({...actDraft,responsible_level:e.target.value as Level})}>{(Object.keys(LEVEL_LABEL) as Level[]).map(k=><option key={k} value={k}>{LEVEL_LABEL[k]}</option>)}</select></label>
        </div>
        <div className="rmNotice"><span>{actDraft.improvement_method==='PDCA'?'PDCA disarankan untuk standardisasi dan kendali proses.':'PDSA disarankan untuk uji perubahan, pembelajaran, dan pengukuran hasil.'}</span><p>{actDraft.improvement_method==='PDCA'?'Plan–Do–Check–Act: rencanakan standar, jalankan, periksa kesesuaian, lalu tindak lanjuti.':'Plan–Do–Study–Act: rumuskan hipotesis, uji perubahan, pelajari data, lalu adopsi/adaptasi/hentikan.'}</p></div>
        <label>Plan · Rencana dan prediksi hasil<textarea rows={3} value={actDraft.cycle_plan||''} onChange={e=>setActDraft({...actDraft,cycle_plan:e.target.value})} placeholder="Masalah, baseline, tujuan terukur, intervensi, hipotesis/prediksi, dan ukuran proses/outcome."/></label>
        <label>Do · Pelaksanaan uji perubahan<textarea rows={3} value={actDraft.cycle_do||''} onChange={e=>setActDraft({...actDraft,cycle_do:e.target.value})} placeholder="Siapa melakukan apa, kapan, di unit mana, dan bagaimana bukti pelaksanaan dicatat."/></label>
        <label>{actDraft.improvement_method==='PDCA'?'Check':'Study'} · Analisis hasil<textarea rows={3} value={actDraft.cycle_study_check||''} onChange={e=>setActDraft({...actDraft,cycle_study_check:e.target.value})} placeholder="Bandingkan data sebelum-sesudah dengan target; analisis variasi, hambatan, dan efek yang tidak diharapkan."/></label>
        <label>Act · Keputusan dan tindak lanjut<textarea rows={3} value={actDraft.cycle_act||''} onChange={e=>setActDraft({...actDraft,cycle_act:e.target.value})} placeholder="Adopsi, adaptasi, atau hentikan; tetapkan penanggung jawab, standardisasi, dan siklus berikutnya."/></label>
        <div className="govFormRow">
          <label>Nama penanggung jawab<input value={actDraft.assigned_to_name||''} onChange={e=>setActDraft({...actDraft,assigned_to_name:e.target.value})}/></label>
          <label>Unit<select value={actDraft.assigned_room_id??''} onChange={e=>setActDraft({...actDraft,assigned_room_id:e.target.value?Number(e.target.value):null})}><option value="">Rumah Sakit / lintas unit</option>{rooms.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
        </div>
        <div className="govFormRow">
          <label>Tenggat<input type="date" value={actDraft.due_date||''} onChange={e=>setActDraft({...actDraft,due_date:e.target.value})}/></label>
          <label>Output yang diharapkan<input value={actDraft.expected_output||''} onChange={e=>setActDraft({...actDraft,expected_output:e.target.value})}/></label>
        </div>
      </div>}
    </AurekaModal>

    <AurekaModal open={Boolean(progress)} size="md" title="Perbarui progres" subtitle={progress?.title} closeDisabled={busy} onClose={()=>setProgress(null)}
      footer={<><button type="button" className="akBtn akBtnGhost" onClick={()=>setProgress(null)}>Batal</button><button type="button" className="akBtn akBtnPrimary" disabled={busy} onClick={async()=>{if(progress&&await run(()=>aurekaSupabase.rpc('aureka_gov_save_action',{p:{id:progress.id,status:progress.status,progress_note:progress.progress_note,evidence_url:progress.evidence_url}}),'Progres tersimpan.'))setProgress(null)}}>{busy?'Menyimpan…':'Simpan'}</button></>}>
      {progress&&<div className="govForm"><label>Status<select value={progress.status} onChange={e=>setProgress({...progress,status:e.target.value})}><option value="terbuka">Terbuka</option><option value="berjalan">Berjalan</option><option value="selesai">Selesai · ajukan verifikasi</option></select></label><label>Catatan progres<textarea rows={3} value={progress.progress_note} onChange={e=>setProgress({...progress,progress_note:e.target.value})}/></label><label>Tautan bukti<input value={progress.evidence_url||''} onChange={e=>setProgress({...progress,evidence_url:e.target.value})}/></label></div>}
    </AurekaModal>

    <AurekaModal open={Boolean(evalFor)} size="md" title="Evaluasi efektivitas" subtitle={evalFor?.title} closeDisabled={busy} onClose={()=>setEvalFor(null)}
      footer={<><button type="button" className="akBtn akBtnGhost" onClick={()=>setEvalFor(null)}>Batal</button><button type="button" className="akBtn akBtnPrimary" disabled={busy||evalForm.note.trim().length<10} onClick={async()=>{if(evalFor&&await run(()=>aurekaSupabase.rpc('aureka_gov_evaluate_action',{p_action_id:evalFor.id,p_result:evalForm.result,p_decision:evalForm.decision,p_note:evalForm.note,p_evidence_url:evalForm.evidence_url||null}),'Evaluasi tersimpan.'))setEvalFor(null)}}>{busy?'Menyimpan…':'Simpan evaluasi'}</button></>}>
      <div className="govForm"><div className="govFormRow"><label>Hasil<select value={evalForm.result} onChange={e=>setEvalForm({...evalForm,result:e.target.value})}><option value="efektif">Efektif</option><option value="sebagian">Efektif sebagian</option><option value="tidak_efektif">Tidak efektif</option></select></label><label>Keputusan<select value={evalForm.decision} onChange={e=>setEvalForm({...evalForm,decision:e.target.value})}><option value="ditutup">Ditutup</option><option value="dilanjutkan">Dilanjutkan</option></select></label></div><label>Dasar penilaian (bukti, data sebelum–sesudah)<textarea rows={4} value={evalForm.note} onChange={e=>setEvalForm({...evalForm,note:e.target.value})}/></label><label>Tautan bukti (opsional)<input value={evalForm.evidence_url} onChange={e=>setEvalForm({...evalForm,evidence_url:e.target.value})}/></label></div>
    </AurekaModal>
    <style jsx>{`
      .govCycleDetails{margin-top:7px;font-size:10px;color:var(--muted,#65756c)}
      .govCycleDetails summary{cursor:pointer;color:var(--accent,#26866a);font-weight:700}
      .govCycleDetails div{padding:8px 10px;margin-top:6px;border-radius:9px;background:var(--surface-soft,#f2f6f3);line-height:1.5}
      .govCycleDetails p{margin:2px 0 7px;white-space:pre-wrap}
      .govMethodTag{display:inline-block;padding:4px 7px;border-radius:7px;background:var(--surface-soft,#eef5f1);font-size:10px;font-weight:800}
      .govOrphanActions{margin-top:18px}
      .govOrphanActions h4{font-size:13px}
    `}</style>
  </section>
}
