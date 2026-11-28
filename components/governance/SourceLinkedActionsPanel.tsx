'use client'
import {useEffect,useState} from 'react'
import {aurekaSupabase} from '@/lib/aureka/supabase'
import type {SourceKind} from '@/lib/aureka/improvement-source-engine'
import {toUserFacingError} from '@/lib/ui/error-feedback'
type LinkedAction={id:string;title:string;status:string;due_date:string|null;improvement_method:string;linked_at:string}
function parse(value:unknown,sourceKind:SourceKind,sourceId:string):LinkedAction[]{
 if(value===null||typeof value!=='object')throw new Error('Relasi RTL tidak lengkap.')
 const v=value as Record<string,unknown>
 if(v.source_kind!==sourceKind||v.source_id!==sourceId||!Array.isArray(v.actions)||v.actions.length>100||!v.actions.every(a=>a&&typeof a.id==='string'&&typeof a.title==='string'&&typeof a.status==='string'&&(a.due_date===null||typeof a.due_date==='string')&&typeof a.improvement_method==='string'&&typeof a.linked_at==='string'))throw new Error('Relasi RTL tidak sesuai sumber.')
 return v.actions as LinkedAction[]
}
export default function SourceLinkedActionsPanel({sourceKind,sourceId}:{sourceKind:SourceKind;sourceId:string}){
 const [open,setOpen]=useState(false)
 const [revision,setRevision]=useState(0)
 const [data,setData]=useState<LinkedAction[]|null>(null)
 const [error,setError]=useState('')
 useEffect(()=>{
  if(!open||!sourceId)return
  const c=new AbortController()
  setData(null);setError('')
  void(async()=>{try{
   const {data,error}=await aurekaSupabase.rpc('aureka_source_linked_actions',{p_kind:sourceKind,p_source_id:sourceId}).abortSignal(c.signal)
   if(error)throw error
   const rows=parse(data,sourceKind,sourceId)
   if(!c.signal.aborted)setData(rows)
  }catch(e){if(!c.signal.aborted)setError(toUserFacingError(e,{fallback:'RTL terkait belum dapat dibaca sesuai kewenangan.'}))}})()
  return()=>c.abort()
 },[open,sourceKind,sourceId,revision])
 return <section aria-label="RTL terkait sumber ini" style={{border:'1px solid var(--line, #dbe4ec)',borderRadius:10,padding:12,marginBlock:12,display:'grid',gap:8}}>
  <button type="button" className="rmButton" aria-expanded={open} onClick={()=>setOpen(x=>!x)}>{open?'Tutup RTL terkait':'Lihat RTL terkait sumber ini'}</button>
  {open&&<>{error?<p role="alert">{error}</p>:data===null?<p role="status">Memuat relasi…</p>:data.length===0?<p>Belum ada RTL yang secara eksplisit terhubung dengan record ini.</p>:<div style={{overflowX:'auto'}}><table className="rmTable" style={{width:'100%'}}><thead><tr><th>RTL</th><th>Siklus</th><th>Status</th><th>Tenggat</th></tr></thead><tbody>{data.map(a=><tr key={a.id}><td>{a.title}<small className="rmCellSmall">{a.id}</small></td><td>{a.improvement_method}</td><td>{a.status}</td><td>{a.due_date||'—'}</td></tr>)}</tbody></table></div>}
  <div style={{display:'flex',flexWrap:'wrap',gap:8,alignItems:'center'}}><button type="button" className="rmButton" onClick={()=>setRevision(x=>x+1)} disabled={data===null&&!error}>Muat ulang</button><small>Kelola relasi pada Program & RTL. Maksimal 100 RTL sesuai akses. Status sumber tidak diubah oleh panel ini.</small></div></>}
 </section>
}
