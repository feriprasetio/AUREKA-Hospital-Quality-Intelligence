'use client'
import ContinuumReadGrid from '@/components/workspace/ContinuumReadGrid'
import ContinuumReadTable,{type ReadTableColumn} from '@/components/workspace/ContinuumReadTable'
import ContinuumSummary from '@/components/workspace/ContinuumSummary'
import WorkspaceTableViewport from '@/components/workspace/WorkspaceTableViewport'
import type {ReadGridColumn} from '@/lib/aureka/read-grid'
import AsyncStatePanel from '@/components/AsyncStatePanel'
import { readAllPages } from '@/lib/aureka/pagination'
import { useLatestWorkspaceRequest } from '@/lib/ui/use-latest-workspace-request'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { readLocalDocument, parseSpoSections, makeStructuredDocx, downloadBrowserBlob, printStructuredContent, type StructuredSection } from '@/lib/aureka/local-documents'

type Status = 'draft' | 'pending_review' | 'approved' | 'archived'
type Step = { step_number: number; content: string }
type Row = {
  id:string; title:string; document_number:string|null; revision_number:string; page_count:number|null; issue_date:string|null
  approval_title:string|null; approval_name:string|null; approval_identifier:string|null
  understanding:string; purpose:string; policy:string; procedure_steps:Step[]; related_units:string[]
  flowchart:{format?:string;code?:string;labels?:string[];note?:string;page_number?:number}|null; status:Status; source_file_name:string|null
  source_file_mime_type:string|null; source_file_size_bytes:number|null; source_storage_path:string|null; source_sha256:string|null
  analysis_engine:string|null; analysis_confidence:Record<string,unknown>|null; analysis_notes:string[]; review_notes:string|null
  created_at:string; updated_at:string
}
type Draft = {
  title:string; document_number:string; revision_number:string; page_count:string; issue_date:string
  approval_title:string; approval_name:string; approval_identifier:string; understanding:string; purpose:string; policy:string
  procedure_steps:Step[]; related_units:string; flowchart_code:string; flowchart_labels:string[]; flowchart_note:string; source_file_name:string; source_file_mime_type:string
  source_file_size_bytes:number|null; source_storage_path:string; source_sha256:string; analysis_engine:string
  analysis_confidence:Record<string,unknown>|null; analysis_notes:string[]; review_notes:string
}
const q=()=>aurekaSupabase.schema('aureka_quality')
const maxBytes=15*1024*1024
const pdf='application/pdf'
const docx='application/vnd.openxmlformats-officedocument.wordprocessingml.document'
const managers=['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR']
const approvers=['ADMIN','PMKP','DIREKTUR']
const labels:Record<Status,string>={draft:'Draf',pending_review:'Menunggu review',approved:'Disahkan',archived:'Diarsipkan'}
const empty=():Draft=>({title:'',document_number:'',revision_number:'00',page_count:'',issue_date:'',approval_title:'',approval_name:'',approval_identifier:'',understanding:'',purpose:'',policy:'',procedure_steps:[],related_units:'',flowchart_code:'',flowchart_labels:[],flowchart_note:'',source_file_name:'',source_file_mime_type:'',source_file_size_bytes:null,source_storage_path:'',source_sha256:'',analysis_engine:'',analysis_confidence:null,analysis_notes:[],review_notes:''})
function mapDraft(r:Row):Draft{return {...empty(),title:r.title||'',document_number:r.document_number||'',revision_number:r.revision_number||'00',page_count:r.page_count==null?'':String(r.page_count),issue_date:r.issue_date||'',approval_title:r.approval_title||'',approval_name:r.approval_name||'',approval_identifier:r.approval_identifier||'',understanding:r.understanding||'',purpose:r.purpose||'',policy:r.policy||'',procedure_steps:Array.isArray(r.procedure_steps)?r.procedure_steps:[],related_units:(r.related_units||[]).join('\n'),flowchart_code:r.flowchart?.code||'',flowchart_labels:Array.isArray(r.flowchart?.labels)?r.flowchart.labels:[],flowchart_note:r.flowchart?.note||'',source_file_name:r.source_file_name||'',source_file_mime_type:r.source_file_mime_type||'',source_file_size_bytes:r.source_file_size_bytes,source_storage_path:r.source_storage_path||'',source_sha256:r.source_sha256||'',analysis_engine:r.analysis_engine||'',analysis_confidence:r.analysis_confidence||null,analysis_notes:r.analysis_notes||[],review_notes:r.review_notes||''}}
function flowNodes(code:string){return code.split(/\s*-->\s*/).map(part=>{const m=/[A-Za-z][\w-]*(?:\[([^\]]+)\]|\(([^)]+)\)|\{([^}]+)\})/.exec(part);return m?(m[1]||m[2]||m[3]||'').trim():''}).filter(Boolean).slice(0,40)}
function safeName(name:string){return name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/-+/g,'-').slice(0,120)||'dokumen-spo'}
function dateLabel(value:string|null){if(!value)return 'Belum dicantumkan';const d=new Date(value+(value.length===10?'T00:00:00':''));return Number.isNaN(d.getTime())?value:d.toLocaleDateString('id-ID',{day:'2-digit',month:'long',year:'numeric'})}

export default function StandardsProcedureWorkspace({role,userId,dataFirst=false}:{role:string|null;userId:string;dataFirst?:boolean}){
  const canManage=managers.includes(role||'')
  const canApprove=approvers.includes(role||'')
  const inputRef=useRef<HTMLInputElement>(null)
  const [rows,setRows]=useState<Row[]>([])
  const [loading,setLoading]=useState(true)
  const [loadError,setLoadError]=useState('')
  const beginLoad=useLatestWorkspaceRequest(JSON.stringify([role,userId]))
  const [busy,setBusy]=useState(false)
  const [search,setSearch]=useState('')
  const [filter,setFilter]=useState<'all'|Status>('all')
  const [selected,setSelected]=useState<Row|null>(null)
  const [draft,setDraft]=useState<Draft>(empty)
  const [manual,setManual]=useState(false)
  const [notice,setNotice]=useState<{kind:'success'|'error'|'info';text:string}|null>(null)

  const load=useCallback(async()=>{
    const isCurrent=beginLoad()
    if(!isCurrent)return
    setLoading(true)
    setLoadError('')
    try{
      const nextRows=await readAllPages<Row>((from,to)=>q().from('standard_operating_procedures')
        .select('*').order('updated_at',{ascending:false}).order('id').range(from,to))
      if(isCurrent())setRows(nextRows)
    }catch(error){
      if(!isCurrent())return
      setRows([])
      setLoadError(toUserFacingError(error,{fallback:'Register SPO belum dapat dimuat. Periksa koneksi dan hak akses.'}))
    }finally{if(isCurrent())setLoading(false)}
  },[beginLoad])
  useEffect(()=>{void load()},[load])

  const counts=useMemo(()=>({all:rows.length,draft:rows.filter(r=>r.status==='draft').length,pending:rows.filter(r=>r.status==='pending_review').length,approved:rows.filter(r=>r.status==='approved').length}),[rows])
  const visible=useMemo(()=>rows.filter(r=>{
    const text=[r.title,r.document_number||'',r.approval_name||'',...(r.related_units||[])].join(' ').toLocaleLowerCase('id-ID')
    return (filter==='all'||r.status===filter)&&text.includes(search.trim().toLocaleLowerCase('id-ID'))
  }),[rows,filter,search])
  const setField=<K extends keyof Draft,>(key:K,value:Draft[K])=>setDraft(old=>({...old,[key]:value}))
  const startManual=()=>{setSelected(null);setDraft(empty());setManual(true);setNotice({kind:'info',text:'Form SPO baru siap diisi. Dokumen sumber hanya diproses sementara di browser.'})}
  const openRow=(row:Row)=>{setSelected(row);setDraft(mapDraft(row));setManual(false);setNotice(null)}
  // Browser-local extraction only; no Storage upload, server file payload or original binary archive.
  const uploadFile=async(file?:File)=>{
    if(!file)return
    const ext=file.name.toLowerCase().split('.').pop()
    if(!['pdf','docx'].includes(ext||'')){setNotice({kind:'error',text:'Gunakan PDF atau DOCX.'});return}
    if(file.size<1||file.size>maxBytes){setNotice({kind:'error',text:'File maksimal 15 MB.'});return}
    setBusy(true);setNotice({kind:'info',text:'Membaca dokumen sementara di browser. Tidak ada file dikirim ke Storage.'})
    try{
      const local=await readLocalDocument(file)
      const parsed=parseSpoSections(local.extractedText)
      setSelected(null);setManual(true)
      setDraft({
        ...empty(),
        title:local.title,
        page_count:local.pageCount==null?'':String(local.pageCount),
        understanding:parsed.understanding,
        purpose:parsed.purpose,
        policy:parsed.policy,
        procedure_steps:parsed.procedure_steps,
        related_units:parsed.related_units.join('\n'),
        source_file_name:file.name,
        source_file_mime_type:file.type||(ext==='pdf'?pdf:docx),
        source_file_size_bytes:file.size,
        source_storage_path:'',
        source_sha256:local.sha256,
        analysis_engine:'AUREKA Browser Local Document Parser v2',
        analysis_notes:[...local.notes,'Periksa seluruh bagian dan ketepatan hasil ekstraksi sebelum mengesahkan SPO.'],
      })
      setNotice({kind:'success',text:local.status==='completed'
        ?'Ekstraksi selesai sepenuhnya di browser. Periksa isi dan koreksi hasil pembacaan sebelum menyimpan.'
        :'Tidak ada teks digital terbaca. Isi SPO wajib dilengkapi secara manual; file asli tidak diarsipkan.'})
    }catch(error){setNotice({kind:'error',text:error instanceof Error?error.message:'Pembacaan lokal gagal.'})}
    finally{setBusy(false);if(inputRef.current)inputRef.current.value=''}
  }

  const save=async()=>{
    if(!canManage||busy)return
    if(draft.title.trim().length<2){setNotice({kind:'error',text:'Judul SPO wajib diisi.'});return}
    if(!draft.procedure_steps.some(s=>s.content.trim())){setNotice({kind:'error',text:'Isi minimal satu langkah pada bagian PROSEDUR.'});return}
    const pageCount=draft.page_count.trim()?Number(draft.page_count):null
    if(pageCount!=null&&(!Number.isInteger(pageCount)||pageCount<1)){
      setNotice({kind:'error',text:'Jumlah halaman harus berupa bilangan bulat positif.'});return
    }
    setBusy(true)
    const payload={
      title:draft.title.trim(),document_number:draft.document_number.trim()||null,revision_number:draft.revision_number.trim()||'00',
      page_count:pageCount,issue_date:draft.issue_date||null,
      approval_title:draft.approval_title.trim()||null,approval_name:draft.approval_name.trim()||null,
      approval_identifier:draft.approval_identifier.trim()||null,understanding:draft.understanding.trim(),purpose:draft.purpose.trim(),
      policy:draft.policy.trim(),procedure_steps:draft.procedure_steps.map(step=>step.content.trim()).filter(Boolean).map((content,i)=>({step_number:i+1,content})),
      related_units:draft.related_units.split(/[\n,;]+/).map(s=>s.trim()).filter(Boolean),
      flowchart:draft.flowchart_code.trim()?{format:'mermaid',code:draft.flowchart_code.trim()}:draft.flowchart_labels.length?{format:'extracted_diagram_labels',labels:draft.flowchart_labels,note:draft.flowchart_note}:draft.flowchart_note?{format:'source_page_text',note:draft.flowchart_note}:null,
      source_file_name:draft.source_file_name||null,source_file_mime_type:draft.source_file_mime_type||null,
      source_file_size_bytes:draft.source_file_size_bytes,source_storage_path:selected?.source_storage_path??null,
      source_sha256:draft.source_sha256||null,analysis_engine:draft.analysis_engine||null,
      analysis_confidence:draft.analysis_confidence,analysis_notes:draft.analysis_notes,review_notes:draft.review_notes.trim()||null,
      status:selected?.status??'draft',updated_by:userId,...(selected?{}:{created_by:userId}),
    }
    try{
      const result=selected
        ?await q().from('standard_operating_procedures').update(payload).eq('id',selected.id).eq('updated_at',selected.updated_at).select('*').maybeSingle()
        :await q().from('standard_operating_procedures').insert(payload).select('*').single()
      if(result.error)throw result.error
      if(!result.data)throw new Error('Dokumen telah berubah. Muat ulang register dan periksa versi terbaru sebelum menyimpan.')
      setSelected(result.data as Row);setDraft(mapDraft(result.data as Row));setManual(false)
      setNotice({kind:'success',text:'Perubahan isi SPO berhasil disimpan. Status: '+labels[(result.data as Row).status]+'.'})
      await load()
    }catch(error){setNotice({kind:'error',text:toUserFacingError(error,{fallback:'Draf SPO gagal disimpan.'})})}
    finally{setBusy(false)}
  }
  const updateStatus=async(status:Status)=>{
    if(!selected||busy||!canManage)return
    const nextStatus: Partial<Record<Status,Status>>={draft:'pending_review',pending_review:'approved',approved:'archived'}
    if(nextStatus[selected.status]!==status||((status==='approved'||status==='archived')&&!canApprove))return
    if((status==='pending_review'||status==='approved')&&JSON.stringify({...draft,review_notes:''})!==JSON.stringify({...mapDraft(selected),review_notes:''})){
      setNotice({kind:'error',text:'Simpan perubahan isi SPO sebelum mengubah status.'});return
    }
    setBusy(true)
    try{
      const patch:Record<string,unknown>={status,updated_by:userId}
      if(status==='pending_review')patch.review_notes=draft.review_notes.trim()||null
      if(status==='approved'){patch.approved_by=userId;patch.approved_at=new Date().toISOString()}
      const {data,error}=await q().from('standard_operating_procedures').update(patch).eq('id',selected.id).eq('updated_at',selected.updated_at).select('*').maybeSingle()
      if(error)throw error
      if(!data)throw new Error('Dokumen telah berubah. Muat ulang register dan periksa status terbaru.')
      setSelected(data as Row);setDraft(mapDraft(data as Row));setNotice({kind:'success',text:'Status SPO diperbarui menjadi '+labels[status]+'.'})
      await load()
    }catch(error){setNotice({kind:'error',text:toUserFacingError(error,{fallback:'Perubahan status tidak berhasil.'})})}
    finally{setBusy(false)}
  }
  const sections=():StructuredSection[]=>[
    {heading:'Nomor Dokumen',text:draft.document_number||'-'},
    {heading:'Revisi',text:draft.revision_number||'00'},
    {heading:'Tanggal Terbit',text:draft.issue_date||'-'},
    {heading:'Pengertian',text:draft.understanding},
    {heading:'Tujuan',text:draft.purpose},
    {heading:'Kebijakan',text:draft.policy},
    {heading:'Prosedur',text:draft.procedure_steps.map((step,i)=>(i+1)+'. '+step.content).join('\n')},
    {heading:'Unit Terkait',text:draft.related_units},
    {heading:'Pengesahan',text:[draft.approval_title,draft.approval_name,draft.approval_identifier].filter(Boolean).join(' · ')},
  ]
  const download=async()=>{
    setBusy(true)
    try{
      const blob=await makeStructuredDocx(draft.title||'SPO AUREKA',sections())
      downloadBrowserBlob(safeName(draft.document_number||draft.title||'SPO')+'.docx',blob)
      setNotice({kind:'success',text:'DOCX diregenerasi dari data tersimpan. Ini bukan salinan identik file sumber.'})
    }catch(error){setNotice({kind:'error',text:error instanceof Error?error.message:'DOCX tidak dapat dibuat.'})}
    finally{setBusy(false)}
  }
  const printPdf=()=>{
    try{printStructuredContent(draft.title||'SPO AUREKA',sections())}
    catch(error){setNotice({kind:'error',text:error instanceof Error?error.message:'Pratinjau PDF tidak dapat dibuka.'})}
  }
  const back=()=>{setSelected(null);setDraft(empty());setManual(false);setNotice(null)}
  const editing=(!selected||(['draft','pending_review'].includes(selected.status)))&&canManage
  const steps=draft.procedure_steps

  const display:readonly ReadTableColumn<Row>[]=[
    {id:'title',label:'Judul SPO',required:true,cell:r=><button type="button" className="spoLinkButton" disabled={busy} onClick={()=>openRow(r)}>{r.title}</button>},
    {id:'number',label:'Nomor dokumen',cell:r=>r.document_number||'Belum dicantumkan'},
    {id:'revision',label:'Revisi',cell:r=>r.revision_number||'00'},
    {id:'date',label:'Tanggal terbit',cell:r=>dateLabel(r.issue_date)},
    {id:'units',label:'Unit terkait',cell:r=>(r.related_units||[]).join(' · ')||'Belum diisi'},
    {id:'status',label:'Status',required:true,cell:r=><span className={'spoStatus spoStatus-'+r.status}>{labels[r.status]}</span>},
    {id:'source',label:'Sumber',cell:r=>r.source_file_name?'Hasil ekstraksi dokumen':'Input manual'}
  ]
  const columns:readonly ReadGridColumn<Row>[]=[
    {id:'title',label:'Judul',value:r=>r.title},{id:'number',label:'Nomor dokumen',value:r=>r.document_number},{id:'revision',label:'Revisi',value:r=>r.revision_number},{id:'date',label:'Tanggal terbit',value:r=>r.issue_date},{id:'units',label:'Unit terkait',value:r=>(r.related_units||[]).join(' · ')},{id:'status',label:'Status',value:r=>labels[r.status]}
  ]
  return <main className="spoWorkspace" aria-label="Standar Prosedur Operasional">
    <header className="spoHeader">
      <div><h1>Standar Prosedur Operasional</h1><p>Register SPO terstruktur, ekstraksi dokumen, dan kendali revisi.</p></div>
      {!selected&&<div className="spoHeaderActions">
        {canManage&&<button type="button" className="spoButton spoButtonSecondary" onClick={startManual} disabled={busy}>Tambah Manual</button>}
        {canManage&&<><input ref={inputRef} className="spoHiddenFile" type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={e=>void uploadFile(e.target.files?.[0])}/><button type="button" className="spoButton spoButtonPrimary" onClick={()=>inputRef.current?.click()} disabled={busy}>{busy?'Memproses…':'Upload SPO'}</button></>}
      </div>}
    </header>
    {notice&&<div className={'spoNotice spoNotice-'+notice.kind} role="status"><span>{notice.text}</span><button type="button" aria-label="Tutup notifikasi" onClick={()=>setNotice(null)}>×</button></div>}

    {selected||manual?<section className="spoEditor">
      <div className="spoEditorTop"><button type="button" className="spoLinkButton" onClick={back}>← Kembali ke Register</button><span className={'spoStatus spoStatus-'+(selected?.status||'draft')}>{labels[selected?.status||'draft']}</span></div>
      <div className="spoEditorHeading"><div><span className="spoEyebrow">{selected?'DETAIL DAN REVISI DOKUMEN':'DOKUMEN BARU'}</span><h2>{draft.title||'SPO baru'}</h2><p>Pastikan isi hasil ekstraksi sesuai dokumen sumber sebelum diajukan.</p></div><div><button type="button" className="spoButton spoButtonSecondary" onClick={()=>void download()} disabled={busy}>Unduh DOCX</button><button type="button" className="spoButton spoButtonSecondary" onClick={printPdf} disabled={busy}>Cetak / Simpan PDF</button></div></div>
      <fieldset className="spoFieldset" disabled={!editing||busy}>
        <section className="spoSection"><h3>Identitas dan Pengesahan</h3><div className="spoGrid">
          <label>Judul SPO<input value={draft.title} onChange={e=>setField('title',e.target.value)}/></label>
          <label>Nomor Dokumentasi<input value={draft.document_number} onChange={e=>setField('document_number',e.target.value)} placeholder="XX / UPT RSUD-SSMA / SPO / 2026"/></label>
          <label>Nomor Revisi<input value={draft.revision_number} onChange={e=>setField('revision_number',e.target.value)}/></label>
          <label>Jumlah Halaman<input type="number" min="1" value={draft.page_count} onChange={e=>setField('page_count',e.target.value)}/></label>
          <label>Tanggal Terbit<input type="date" value={draft.issue_date} onChange={e=>setField('issue_date',e.target.value)}/></label>
          <label>Jabatan Pengesah<input value={draft.approval_title} onChange={e=>setField('approval_title',e.target.value)} placeholder="Direktur"/></label>
          <label>Nama Pengesah<input value={draft.approval_name} onChange={e=>setField('approval_name',e.target.value)}/></label>
          <label>NIP / Identitas Pengesah<input value={draft.approval_identifier} onChange={e=>setField('approval_identifier',e.target.value)}/></label>
        </div></section>
        <section className="spoSection"><h3>Isi Standar Prosedur Operasional</h3>
          <label>Pengertian<textarea rows={3} value={draft.understanding} onChange={e=>setField('understanding',e.target.value)}/></label>
          <label>Tujuan<textarea rows={3} value={draft.purpose} onChange={e=>setField('purpose',e.target.value)}/></label>
          <label>Kebijakan<textarea rows={3} value={draft.policy} onChange={e=>setField('policy',e.target.value)}/></label>
        </section>
        <section className="spoSection"><div className="spoSectionTitle"><h3>Prosedur</h3><button type="button" className="spoLinkButton" onClick={()=>setField('procedure_steps',[...steps,{step_number:steps.length+1,content:''}])}>+ Tambah langkah</button></div>
          <div className="spoSteps">{steps.map((step,i)=><div className="spoStep" key={'step-'+i}><b>{i+1}</b><textarea rows={2} aria-label={'Langkah '+(i+1)} value={step.content} onChange={e=>setField('procedure_steps',steps.map((s,j)=>j===i?{...s,content:e.target.value}:s))}/><button type="button" aria-label={'Hapus langkah '+(i+1)} onClick={()=>setField('procedure_steps',steps.filter((_,j)=>j!==i).map((s,j)=>({...s,step_number:j+1})))}>×</button></div>)}
          {!steps.length&&<p className="spoMuted">Belum ada langkah prosedur.</p>}</div>
        </section>
        <section className="spoSection spoGrid">
          <label>Unit Terkait<textarea rows={4} value={draft.related_units} onChange={e=>setField('related_units',e.target.value)} placeholder="Satu unit per baris"/></label>
          <label>Flowchart (opsional, format Mermaid)<textarea rows={7} value={draft.flowchart_code} onChange={e=>setField('flowchart_code',e.target.value)} placeholder={'flowchart TD\nA[Mulai] --> B[Langkah 1] --> C[Selesai]'}/></label>
        </section>
        {(draft.flowchart_code.trim()||draft.flowchart_labels.length||draft.flowchart_note)&&<section className="spoFlowPreview"><h3>Flowchart / Teks Diagram yang Terdeteksi</h3>{draft.flowchart_code.trim()?<><div className="spoFlowNodes">{flowNodes(draft.flowchart_code).map((node,i,nodes)=><div key={'f-'+i} className="spoFlowItem"><div>{node}</div>{i<nodes.length-1&&<span>↓</span>}</div>)}</div><details><summary>Lihat kode diagram</summary><pre>{draft.flowchart_code}</pre></details></>:<>{draft.flowchart_labels.length>0&&<div className="spoFlowLabels">{draft.flowchart_labels.map((label,i)=><span key={'fl-'+i}>{label}</span>)}</div>}<p className="spoMuted">{draft.flowchart_note}</p></>}</section>}
        <section className="spoSection spoGrid">
          <label>Catatan Review<textarea rows={3} value={draft.review_notes} onChange={e=>setField('review_notes',e.target.value)}/></label>
          <div className="spoSourceMeta"><h3>Dokumen Sumber dan Analisis</h3>
            {draft.source_file_name?<><strong>{draft.source_file_name}</strong><span>{((draft.source_file_size_bytes||0)/1024/1024).toFixed(2)} MB · {draft.source_storage_path?'arsip sumber':'file asal ekstraksi'}</span></>:<span>Belum ada file sumber.</span>}
            {draft.analysis_notes.map((n,i)=><small key={'note-'+i}>{n}</small>)}
          </div>
        </section>
      </fieldset>
      <footer className="spoActions">
        {editing&&<button type="button" className="spoButton spoButtonPrimary" disabled={busy} onClick={()=>void save()}>{busy?'Menyimpan…':'Simpan Draf SPO'}</button>}
        {selected?.status==='draft'&&canManage&&<button type="button" className="spoButton spoButtonSecondary" disabled={busy} onClick={()=>void updateStatus('pending_review')}>Ajukan Review</button>}
        {selected?.status==='pending_review'&&canApprove&&<button type="button" className="spoButton spoButtonSuccess" disabled={busy} onClick={()=>void updateStatus('approved')}>Sahkan SPO</button>}
        {selected?.status==='approved'&&canApprove&&<button type="button" className="spoButton spoButtonSecondary" disabled={busy} onClick={()=>void updateStatus('archived')}>Arsipkan</button>}
        {!canManage&&<p className="spoMuted">Akun Anda memiliki akses baca. Pengelolaan dan pengesahan dilakukan oleh pejabat berwenang.</p>}
      </footer>
    </section>:<>
      {!loading&&!loadError&&<ContinuumSummary enabled={dataFirst} label="Ringkasan register SPO"><section className="spoStats"><div><span>Total Register</span><strong>{counts.all}</strong></div><div><span>Draf</span><strong>{counts.draft}</strong></div><div><span>Menunggu Review</span><strong>{counts.pending}</strong></div><div><span>Disahkan</span><strong>{counts.approved}</strong></div></section></ContinuumSummary>}
      <section className="spoRegister"><div className="spoRegisterToolbar"><div><h2>Register SPO</h2><p>Telusuri dokumen berdasarkan judul, nomor dokumentasi, unit, dan status.</p></div><input type="search" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari judul, nomor, atau unit…" aria-label="Cari SPO"/></div>
        <nav className="spoFilters" aria-label="Filter status">{(['all','draft','pending_review','approved','archived'] as const).map(value=><button key={value} type="button" className={filter===value?'active':''} onClick={()=>setFilter(value)}>{value==='all'?'Semua':labels[value]}</button>)}</nav>
        {loading?<AsyncStatePanel state="loading" title="Memuat register SPO" compact/>:loadError?<AsyncStatePanel state="error" title="Register SPO belum tersedia" description={loadError} onRetry={()=>void load()} compact/>:dataFirst?<ContinuumReadGrid key={filter} rows={visible} columns={columns} display={display} label="Register SPO" showSearch={false}>{(page,_filtered,keys)=><WorkspaceTableViewport dataFirst label="Register SPO"><ContinuumReadTable rows={page} columns={display} keys={keys} rowKey={r=>r.id} className="rmTable" disableDomSort empty={rows.length?'Tidak ada SPO yang sesuai filter.':'Belum ada register SPO.'}/></WorkspaceTableViewport>}</ContinuumReadGrid>:visible.length?<div className="spoRecords">{visible.map(row=><button type="button" key={row.id} className="spoRecord" onClick={()=>openRow(row)}>
          <div className="spoRecordTop"><span>{row.document_number||'Nomor belum dicantumkan'}</span><span className={'spoStatus spoStatus-'+row.status}>{labels[row.status]}</span></div>
          <h3>{row.title}</h3><p>Revisi {row.revision_number||'00'} · Terbit {dateLabel(row.issue_date)}</p>
          <div className="spoRecordBottom"><span>{(row.related_units||[]).slice(0,3).join(' · ')||'Unit terkait belum diisi'}</span><span>{row.source_file_name?'Hasil ekstraksi dokumen':'Input manual'}</span></div>
        </button>)}</div>:<div className="spoEmpty"><strong>{rows.length?'Tidak ada SPO yang sesuai filter.':'Belum ada register SPO.'}</strong><p>{rows.length?'Ubah kata kunci atau status untuk melihat data lainnya.':'Unggah PDF/DOCX atau mulai dari form manual. AUREKA menampilkan isi terstruktur, bukan file mentah.'}</p></div>}
      </section>
    </>}
  </main>
}
