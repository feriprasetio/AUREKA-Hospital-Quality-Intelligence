'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { AurekaNavigationGroup } from '@/lib/aureka/module-registry'
import ArcticQuickNavigation from './ArcticQuickNavigation'
import { pinContinuumWorkspace, resolveContinuumPin, WORKSPACE_PIN_LIMIT, type ContinuumWorkspace } from '@/lib/aureka/continuum-workspace'

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
  previewEnabled: boolean
  onTogglePreview: (enabled: boolean) => void
  onLogout: () => void
  contextKey: string
  currentWorkspace: ContinuumWorkspace|null
  onOpenWorkspace: (destination:ContinuumWorkspace)=>boolean
}

// Only presentation: consume the existing filtered navigation and dispatch,
// never derive permissions or routes independently of HomeClient.
export default function ArcticCategoryNavigation({groups,activeCategoryId,isActive,onSelect,onExit,onLogout,contextKey,previewEnabled,onTogglePreview,currentWorkspace,onOpenWorkspace}:Props) {
  const id=useId()
  const root=useRef<HTMLElement>(null)
  const trigger=useRef<HTMLButtonElement|null>(null)
  const [open,setOpen]=useState<string|null>(null)
  // Component key is account/role/scope/permission-bound; intentionally no browser persistence.
  const [pins,setPins]=useState<string[]>([])
  const [pinNotice,setPinNotice]=useState('')
  useEffect(()=>{if(!previewEnabled){setPins([]);setPinNotice('')}},[previewEnabled])
  const visiblePins=previewEnabled&&currentWorkspace?pins.map(resolveContinuumPin).filter((item):item is ContinuumWorkspace=>item!==null):[]
  const available=groups.filter(group=>group.items.length>0)
  const category=available.find(group=>group.id===open)
  const actionsOpen=open==='actions'
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
      <button type="button" className="arcticCategoryMobile" aria-expanded={open!==null&&!actionsOpen} aria-controls={open!==null&&!actionsOpen?id:undefined} onClick={event=>{trigger.current=event.currentTarget;setOpen(value=>value===null||value==='actions'?'all':null)}}><span className="arcticMobileCaption">Kategori</span><strong>{current?.label||'AUREKA'}</strong><span aria-hidden="true">⌄</span></button>
      <div className="arcticCategoryStrip">
        {available.map(group=><button key={group.id} type="button" data-arctic-category={group.id} aria-current={group.id===activeCategoryId?'true':undefined} aria-expanded={open===group.id} aria-controls={open===group.id?id:undefined} aria-label={group.label} title={group.label} onClick={event=>{trigger.current=event.currentTarget;setOpen(value=>value===group.id?null:group.id)}}><span className="arcticFullLabel">{group.label}</span><span className="arcticShortLabel" aria-hidden="true">{SHORT_LABELS[group.id]||group.label}</span><span aria-hidden="true">⌄</span></button>)}
      </div>
      <ArcticQuickNavigation groups={available} contextKey={contextKey} onSelect={(group,item)=>{close(false);onSelect(group,item)}}/>
      <button className="arcticLayoutExit arcticActionsTrigger" type="button" aria-label="Opsi navigasi dan akun" title="Opsi navigasi dan akun" aria-expanded={actionsOpen} aria-controls={actionsOpen?id:undefined} onClick={event=>{trigger.current=event.currentTarget;setOpen(value=>value==='actions'?null:'actions')}}>⋯</button>
    </div>
    {visiblePins.length>0&&<div className="arcticWorkspacePins" role="group" aria-label="Tab halaman sematan sesi ini">{visiblePins.map(item=><div key={item.id} className="arcticWorkspacePin"><button type="button" data-arctic-pin={item.id} aria-current={currentWorkspace?.id===item.id?'page':undefined} onClick={()=>{if(currentWorkspace?.id===item.id)return;if(!onOpenWorkspace(item)){setPins(old=>old.filter(id=>id!==item.id));setPinNotice('Halaman tidak tersedia bagi akses saat ini.')}else setPinNotice('')}}>{item.label}</button><button type="button" className="arcticPinClose" aria-label={'Lepas sematan '+item.label} onClick={()=>{setPins(old=>old.filter(id=>id!==item.id));root.current?.querySelector<HTMLButtonElement>('.arcticActionsTrigger')?.focus()}}>×</button></div>)}</div>}
    {pinNotice&&<p role="status" className="arcticPinNotice">{pinNotice}</p>}
    {open!==null&&<section id={id} className="arcticMegaMenu" data-actions={actionsOpen||undefined} aria-label={actionsOpen?'Opsi navigasi dan akun':category?.label||'Pilih kategori'}>
      <div className="arcticMegaHead"><strong tabIndex={-1}>{actionsOpen?'Opsi navigasi dan akun':category?.label||'Pilih kategori'}</strong><button type="button" onClick={()=>close(true)} aria-label="Tutup menu kategori">×</button></div>
      {actionsOpen?<div className="arcticModuleGrid">{previewEnabled&&currentWorkspace&&<button type="button" data-arctic-pin-current disabled={pins.includes(currentWorkspace.id)||pins.length>=WORKSPACE_PIN_LIMIT} onClick={()=>{setPins(old=>pinContinuumWorkspace(old,currentWorkspace.id));setPinNotice('');close(true)}}><strong>{pins.includes(currentWorkspace.id)?'Halaman sudah disematkan':pins.length>=WORKSPACE_PIN_LIMIT?'Batas enam halaman tercapai':'Sematkan halaman aktif'}</strong><small>Shortcut sesi ini; formulir dan filter tidak disimpan.</small></button>}<button type="button" data-arctic-data-preview aria-pressed={previewEnabled} onClick={()=>{close(true);onTogglePreview(!previewEnabled)}}><strong>{previewEnabled?'Nonaktifkan uji coba data-first':'Coba workspace data-first'}</strong><small>{previewEnabled?'Kembali ke tata letak data stabil':'Pilot Arctic Continuum; dapat dikembalikan kapan saja'}</small></button><button type="button" onClick={()=>{close(false);onExit()}}><strong>Layout lama</strong><small>Kembali ke navigasi sidebar</small></button><button type="button" onClick={()=>{close(false);onLogout()}}><strong>Keluar</strong><small>Keluar dari akun AUREKA</small></button></div>:category?<><button type="button" className="arcticBackCategories" onClick={()=>setOpen('all')}>← Semua kategori</button>
        <div className="arcticModuleGrid">{category.items.map(item=><button key={item.id} type="button" data-arctic-destination={item.id} aria-current={isActive(item)?'page':undefined} disabled={item.status==='planned'} onClick={()=>{close(true);onSelect(category.id,item)}}><strong>{item.label}</strong>{item.note&&<small>{item.note}</small>}{item.status==='planned'&&<small>Belum aktif</small>}</button>)}</div></>
      :<div className="arcticModuleGrid">{available.map(group=><button key={group.id} type="button" onClick={()=>setOpen(group.id)}><strong>{group.label}</strong><small>{group.items.length} modul{group.id===activeCategoryId?' · Kategori aktif':''}</small></button>)}</div>}
    </section>}
  </nav>
}
