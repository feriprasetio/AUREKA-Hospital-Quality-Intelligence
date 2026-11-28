'use client'
import {useEffect,useState} from 'react'
import {aurekaSupabase} from '@/lib/aureka/supabase'
import {IMPROVEMENT_SOURCE_TYPES,parseImprovementLinks,parseImprovementSources,sourceMeta,type SourceKind,type ImprovementSource,type ImprovementLink} from '@/lib/aureka/improvement-source-engine'
import {toUserFacingError} from '@/lib/ui/error-feedback'
import {aurekaConfirm} from '@/components/ui/aurekaConfirm'
type Action={id:string;title:string;status:string}
export default function ImprovementSourcePanel({actions}:{actions:Action[]}){
 const [open,setOpen]=useState(false)
 const [selected,setSelected]=useState('')
 const action=actions.find(a=>a.id===selected)
 const [kind,setKind]=useState<SourceKind>('indicator')
 const [query,setQuery]=useState('')
 const [results,setResults]=useState<{kind:SourceKind;query:string;rows:ImprovementSource[]}|null>(null)
 const [links,setLinks]=useState<{action:string;rows:ImprovementLink[]}|null>(null)
 const [revision,setRevision]=useState(0)
 const [busy,setBusy]=useState(false)
 const [searching,setSearching]=useState(false)
 const [error,setError]=useState('')
 const [notice,setNotice]=useState('')
 const actionId=action?.id??''
 const currentLinks=links?.action===actionId?links.rows:undefined
 const currentResults=results?.kind===kind&&results.query===query?results.rows:undefined
 useEffect(()=>{
  if(!open||!actionId)return
  const controller=new AbortController()
  setLinks(null);setError('')
  void(async()=>{try{
   const {data,error}=await aurekaSupabase.rpc('aureka_action_sources',{p_action_id:actionId}).abortSignal(controller.signal)
   if(error)throw error
   if(!controller.signal.aborted)setLinks({action:actionId,rows:parseImprovementLinks(data)})
  }catch(e){if(!controller.signal.aborted)setError(toUserFacingError(e,{fallback:'Relasi sumber belum dapat dibaca.'}))}})()
  return()=>controller.abort()
 },[open,actionId,revision])
 const search=async()=>{
  if(searching||busy||!actionId)return
  setSearching(true);setResults(null);setError('');setNotice('')
  try{
   const {data,error}=await aurekaSupabase.rpc('aureka_improvement_sources',{p_kind:kind,p_query:query.trim(),p_limit:40})
   if(error)throw error
   setResults({kind,query,rows:parseImprovementSources(data)})
  }catch(e){setError(toUserFacingError(e,{fallback:'Pencarian sumber belum berhasil.'}))}
  finally{setSearching(false)}
 }
 const changeLink=async(sourceKind:SourceKind,sourceId:string,active:boolean)=>{
  if(busy||searching||!actionId)return
  if(!active&&!(await aurekaConfirm('Relasi akan dinonaktifkan. Record operasional dan RTL tetap tersimpan.',{title:'Lepaskan sumber?',confirmLabel:'Lepaskan',danger:false})))return
  setBusy(true);setError('');setNotice('')
  try{
   const {data,error}=await aurekaSupabase.rpc('aureka_set_action_source',{p_action_id:actionId,p_kind:sourceKind,p_source_id:sourceId,p_active:active})
   if(error)throw error
   if(data!==true)throw new Error('Perubahan relasi belum dikonfirmasi.')
   setNotice(active?'Sumber berhasil dihubungkan.':'Relasi dinonaktifkan.');setRevision(x=>x+1)
  }catch(e){setError(toUserFacingError(e,{fallback:'Relasi belum berhasil disimpan.'}))}
  finally{setBusy(false)}
 }
 return <section className="rmPanel" aria-label="Sumber lintas modul RTL" style={{marginBlock:'12px',padding:'14px'}}>
  <div className="rmSectionHead"><div><h4>Sumber lintas modul</h4><p>Hubungkan RTL yang sudah tersimpan dengan record asli. Satu sumber dapat terkait beberapa RTL; status masing-masing modul tetap independen.</p></div><button className="rmButton" type="button" onClick={()=>setOpen(x=>!x)} disabled={busy||searching}>{open?'Tutup':'Kelola relasi sumber'}</button></div>
  {open&&<div className="govForm">
   {error&&<p className="rmNotice error" role="alert">{error}</p>}{notice&&<p className="rmNotice" role="status">{notice}</p>}
   <label>Rencana tindak lanjut<select value={selected} disabled={busy||searching} onChange={e=>{setSelected(e.target.value);setResults(null);setNotice('')}}><option value="">Pilih RTL yang telah tersimpan</option>{actions.map(a=><option value={a.id} key={a.id}>{a.title} · {a.status}</option>)}</select></label>
   {!actions.length&&<p>Belum ada RTL pada filter ini. Buat RTL melalui tombol yang sudah tersedia.</p>}
   {action&&<>
    <h4>Sumber terhubung</h4>
    {!currentLinks&&!error?<p role="status">Memuat relasi…</p>:currentLinks?.length===0?<p>Belum ada sumber terhubung.</p>:currentLinks&&<div className="rmTableWrap"><table className="rmTable"><thead><tr><th>Modul</th><th>Sumber</th><th>Status sumber</th><th>Aksi</th></tr></thead><tbody>{currentLinks.map(l=><tr key={l.source_kind+':'+l.source_id}><td>{sourceMeta(l.source_kind)?.[1]}</td><td>{l.label}<small className="rmCellSmall">{l.source_id}</small></td><td>{l.source_status||'—'}</td><td><div className="rmActions"><a className="rmIconButton" href={sourceMeta(l.source_kind)?.[2]}>Buka modul</a><button className="rmIconButton" type="button" disabled={busy||searching} onClick={()=>void changeLink(l.source_kind,l.source_id,false)}>Lepaskan</button></div></td></tr>)}</tbody></table></div>}
    <div className="govFormRow"><label>Jenis sumber<select value={kind} disabled={busy||searching} onChange={e=>{setKind(e.target.value as SourceKind);setResults(null)}}>{IMPROVEMENT_SOURCE_TYPES.map(([k,title])=><option key={k} value={k}>{title}</option>)}</select></label><label>Cari kode, judul atau ID sumber<input maxLength={100} value={query} disabled={busy||searching} onChange={e=>{setQuery(e.target.value);setResults(null)}} placeholder="Kosongkan untuk 40 sumber terbaru"/></label></div>
    <button className="rmButton primary" type="button" disabled={searching||busy} onClick={()=>void search()}>{searching?'Mencari…':'Cari sumber asli'}</button>
    {currentResults&&(!currentResults.length?<p>Data tidak tersedia pada cakupan akses ini.</p>:<div className="rmTableWrap"><table className="rmTable"><thead><tr><th>Sumber</th><th>Status</th><th>Aksi</th></tr></thead><tbody>{currentResults.map(r=>{const linked=currentLinks?.some(l=>l.source_kind===kind&&l.source_id===r.source_id);return <tr key={r.source_id}><td>{r.label}</td><td>{r.source_status||'—'}</td><td><button className="rmIconButton" type="button" disabled={busy||searching||!currentLinks||linked} onClick={()=>void changeLink(kind,r.source_id,true)}>{linked?'Terhubung':'Hubungkan'}</button></td></tr>})}</tbody></table></div>)}
    <small>Relasi dibaca sesuai izin sumber. Pencarian terbatas 40 hasil; gunakan kode/ID untuk mempersempit. Hubungan tidak mengubah nilai indikator, status RCA, risiko, maupun evaluasi efektivitas.</small>
   </>}
  </div>}
 </section>
}
