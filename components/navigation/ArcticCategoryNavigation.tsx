'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { AurekaNavigationGroup } from '@/lib/aureka/module-registry'
import ArcticQuickNavigation from './ArcticQuickNavigation'

type Destination = AurekaNavigationGroup['items'][number]
// Display abbreviations only; canonical names, IDs, order and role filtering
// are always supplied by the existing registry and HomeClient.
const SHORT_LABELS: Partial<Record<AurekaNavigationGroup['id'], string>> = {
  clinical_performance: 'Kinerja Klinis',
  quality_patient_safety: 'PMKP',
  hospital_management: 'Manajemen RS',
  education_training: 'Diklat',
  director_supervisory_board: 'Direktur & Dewas',
}
type Props = {
  groups: readonly AurekaNavigationGroup[]
  activeCategoryId: string
  isActive: (item: Destination) => boolean
  onSelect: (category: string, item: Destination) => void
  onExit: () => void
  onLogout: () => void
  contextKey: string
}

// Only presentation: consume the existing filtered navigation and dispatch,
// never derive permissions or routes independently of HomeClient.
export default function ArcticCategoryNavigation({groups,activeCategoryId,isActive,onSelect,onExit,onLogout,contextKey}:Props) {
  const id=useId()
  const root=useRef<HTMLElement>(null)
  const trigger=useRef<HTMLButtonElement|null>(null)
  const [open,setOpen]=useState<string|null>(null)
  const available=groups.filter(group=>group.items.length>0)
  const category=available.find(group=>group.id===open)
  const current=available.find(group=>group.id===activeCategoryId)
  const close=(restore:boolean)=>{setOpen(null);if(restore)trigger.current?.focus()}
  useEffect(()=>{setOpen(null)},[contextKey])
  useEffect(()=>{
    const strip=root.current?.querySelector<HTMLElement>('.arcticCategoryStrip')
    const active=strip?.querySelector<HTMLElement>('[aria-current="true"]')
    if(!strip||!active||strip.clientWidth===0)return
    const bounds=strip.getBoundingClientRect(), item=active.getBoundingClientRect()
    if(item.left<bounds.left)strip.scrollLeft+=item.left-bounds.left-4
    else if(item.right>bounds.right)strip.scrollLeft+=item.right-bounds.right+4
  },[activeCategoryId])
  useEffect(()=>{
    if(open===null)return
    root.current?.querySelector<HTMLElement>('.arcticMegaHead strong')?.focus({preventScroll:true})
  },[open])
  useEffect(()=>{
    if(open===null)return
    const pointer=(event:PointerEvent)=>{if(event.target instanceof Node&&!root.current?.contains(event.target))setOpen(null)}
    const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&!event.defaultPrevented){event.preventDefault();setOpen(null);trigger.current?.focus()}}
    document.addEventListener('pointerdown',pointer)
    document.addEventListener('keydown',key)
    return()=>{document.removeEventListener('pointerdown',pointer);document.removeEventListener('keydown',key)}
  },[open])
  return <nav ref={root} className="arcticCategoryNav" aria-label="Kategori utama AUREKA" onBlur={event=>{if(event.relatedTarget instanceof Node&&!event.currentTarget.contains(event.relatedTarget))setOpen(null)}}>
    <div className="arcticCategoryBar">
      <button type="button" className="arcticCategoryMobile" aria-expanded={open!==null} aria-controls={open!==null?id:undefined} onClick={event=>{trigger.current=event.currentTarget;setOpen(value=>value===null?'all':null)}}>Kategori <span>{current?.label||'AUREKA'}</span> <span aria-hidden="true">⌄</span></button>
      <div className="arcticCategoryStrip">
        {available.map(group=><button key={group.id} type="button" data-arctic-category={group.id} aria-current={group.id===activeCategoryId?'true':undefined} aria-expanded={open===group.id} aria-controls={open===group.id?id:undefined} aria-label={group.label} title={group.label} onClick={event=>{trigger.current=event.currentTarget;setOpen(value=>value===group.id?null:group.id)}}><span className="arcticFullLabel">{group.label}</span><span className="arcticShortLabel" aria-hidden="true">{SHORT_LABELS[group.id]||group.label}</span><span aria-hidden="true">⌄</span></button>)}
      </div>
      <ArcticQuickNavigation groups={available} contextKey={contextKey} onSelect={(group,item)=>{close(false);onSelect(group,item)}}/>
      <button className="arcticLayoutExit" type="button" onClick={()=>{close(false);onExit()}} title="Kembali ke navigasi lama">Layout lama</button>
      <button className="arcticLayoutExit" type="button" onClick={()=>{close(false);onLogout()}}>Keluar</button>
    </div>
    {open!==null&&<section id={id} className="arcticMegaMenu" aria-label={category?.label||'Pilih kategori'}>
      <div className="arcticMegaHead"><strong tabIndex={-1}>{category?.label||'Pilih kategori'}</strong><button type="button" onClick={()=>close(true)} aria-label="Tutup menu kategori">×</button></div>
      {category?<><button type="button" className="arcticBackCategories" onClick={()=>setOpen('all')}>← Semua kategori</button>
        <div className="arcticModuleGrid">{category.items.map(item=><button key={item.id} type="button" data-arctic-destination={item.id} aria-current={isActive(item)?'page':undefined} disabled={item.status==='planned'} onClick={()=>{close(true);onSelect(category.id,item)}}><strong>{item.label}</strong>{item.note&&<small>{item.note}</small>}{item.status==='planned'&&<small>Belum aktif</small>}</button>)}</div></>
      :<div className="arcticModuleGrid">{available.map(group=><button key={group.id} type="button" onClick={()=>setOpen(group.id)}><strong>{group.label}</strong><small>{group.items.length} modul</small></button>)}</div>}
    </section>}
  </nav>
}
