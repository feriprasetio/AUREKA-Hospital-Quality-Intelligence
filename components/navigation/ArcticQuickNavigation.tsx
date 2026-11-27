'use client'

import { useEffect, useState } from 'react'
import AurekaModal from '@/components/ui/AurekaModal'
import { hasActiveDialog } from '@/components/layout/useAccessibleDialog'
import type { AurekaNavigationGroup } from '@/lib/aureka/module-registry'

type Destination = AurekaNavigationGroup['items'][number]
export default function ArcticQuickNavigation({groups,contextKey,onSelect}:{groups:readonly AurekaNavigationGroup[];contextKey:string;onSelect:(group:string,item:Destination)=>void}) {
  const [open,setOpen]=useState(false)
  const [query,setQuery]=useState('')
  const close=()=>{setOpen(false);setQuery('')}
  useEffect(()=>{close()},[contextKey])
  useEffect(()=>{
    const handler=(event:KeyboardEvent)=>{
      if(event.defaultPrevented||event.isComposing||event.repeat||!(event.ctrlKey||event.metaKey)||event.altKey||event.shiftKey||event.key.toLowerCase()!=='k'||hasActiveDialog())return
      event.preventDefault();setQuery('');setOpen(true)
    }
    document.addEventListener('keydown',handler)
    return()=>document.removeEventListener('keydown',handler)
  },[])
  // Search only metadata from the filtered canonical menu, never patient
  // records, hidden modules, remote queries, or browser storage.
  const terms=query.toLocaleLowerCase('id-ID').trim().split(/\s+/).filter(Boolean)
  const results=groups.flatMap(group=>group.items.filter(item=>item.status!=='planned'&&terms.every(term=>(group.label+' '+item.label).toLocaleLowerCase('id-ID').includes(term))).map(item=>({group,item})))
  const choose=(group:string,item:Destination)=>{close();onSelect(group,item)}
  return <>
    <button type="button" className="arcticLayoutExit arcticQuickTrigger" title="Cari modul (Ctrl+K)" aria-label="Cari modul" aria-haspopup="dialog" onClick={()=>{setQuery('');setOpen(true)}}>Cari modul <kbd>Ctrl K</kbd></button>
    <AurekaModal open={open} onClose={close} size="lg" title="Cari modul AUREKA" subtitle="Pilih tujuan yang tersedia bagi akun ini. Tidak mencari data pasien.">
      <div className="arcticQuickBody">
        <label htmlFor="arctic-module-query">Nama kategori atau modul</label>
        <input id="arctic-module-query" type="search" autoComplete="off" data-dialog-autofocus value={query} onChange={e=>setQuery(e.target.value)} onKeyDown={e=>{if(e.key==='Enter'&&!e.nativeEvent.isComposing&&results.length===1){e.preventDefault();choose(results[0].group.id,results[0].item)}}}/>
        <small role="status">{results.length} tujuan</small>
        <div className="arcticQuickResults">{results.map(({group,item})=><button type="button" key={group.id+'/'+item.id} data-arctic-quick={item.id} onClick={()=>choose(group.id,item)}><strong>{item.label}</strong><small>{group.label}</small></button>)}</div>
        {!results.length&&<p>Tidak ditemukan modul yang tersedia.</p>}
      </div>
    </AurekaModal>
  </>
}
