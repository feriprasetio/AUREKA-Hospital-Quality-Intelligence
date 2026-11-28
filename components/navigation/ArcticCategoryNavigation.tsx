'use client'

import { useEffect, useId, useRef, useState } from 'react'
import type { AurekaNavigationGroup } from '@/lib/aureka/module-registry'
import ArcticQuickNavigation from './ArcticQuickNavigation'
import {visibleContinuumSkills} from '@/lib/aureka/continuum-skill-library'
import { pinContinuumWorkspace, resolveContinuumPin, WORKSPACE_PIN_LIMIT, type ContinuumWorkspace } from '@/lib/aureka/continuum-workspace'

import { CONTINUUM_SESSION_KEY, continuumScopeDigest, allowedContinuumPins, encodeContinuumSession, decodeContinuumSession, clearContinuumSession, moveContinuumPin } from '@/lib/aureka/continuum-session'

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
  storageScope: string|null
  canOpenWorkspace: (destination:ContinuumWorkspace)=>boolean
}

// Only presentation: consume the existing filtered navigation and dispatch,
// never derive permissions or routes independently of HomeClient.
export default function ArcticCategoryNavigation({groups,activeCategoryId,isActive,onSelect,onExit,onLogout,contextKey,previewEnabled,onTogglePreview,currentWorkspace,onOpenWorkspace,storageScope,canOpenWorkspace}:Props) {
  const id=useId()
  const root=useRef<HTMLElement>(null)
  const trigger=useRef<HTMLButtonElement|null>(null)
  const [open,setOpen]=useState<string|null>(null)
  // Explicit opt-in; the component key isolates account, role, scope and permissions.
  const [pins,setPins]=useState<string[]>([])
  const [pinNotice,setPinNotice]=useState('')
  const [scopeDigest,setScopeDigest]=useState<string|null>(null)
  const [restoreCandidate,setRestoreCandidate]=useState<string[]|null>(null)
  const [remember,setRemember]=useState(false)
  const [focusMode,setFocusMode]=useState(false)
  const authRef=useRef(canOpenWorkspace)
  authRef.current=canOpenWorkspace
  const focusExit=useRef<HTMLButtonElement>(null)
  const focusReturn=useRef(false)
  useEffect(()=>{
    if(!previewEnabled){setPins([]);setPinNotice('');setFocusMode(false);setRemember(false);setRestoreCandidate(null);setScopeDigest(null);return}
    if(!storageScope)return
    let cancelled=false
    void continuumScopeDigest(storageScope).then(digest=>{
      if(cancelled||!digest)return
      setScopeDigest(digest)
      try{
        const raw=sessionStorage.getItem(CONTINUUM_SESSION_KEY)
        const restored=decodeContinuumSession(raw,digest,authRef.current)
        if(restored===null){if(raw)clearContinuumSession();return}
        if(restored.length)setRestoreCandidate(restored)
      }catch{}
    })
    return()=>{cancelled=true}
  },[previewEnabled,storageScope])
  const savePins=(next:string[])=>{
    const safe=allowedContinuumPins(next,canOpenWorkspace)
    setPins(safe)
    if(remember&&scopeDigest){
      try{
        const encoded=encodeContinuumSession(scopeDigest,safe,canOpenWorkspace)
        if(encoded)sessionStorage.setItem(CONTINUUM_SESSION_KEY,encoded)
      }catch{setRemember(false);setPinNotice('Penyimpanan sesi tidak tersedia.')}
    }
  }
  const enableRemember=(next:string[])=>{
    if(!scopeDigest)return
    const safe=allowedContinuumPins(next,canOpenWorkspace)
    try{
      const encoded=encodeContinuumSession(scopeDigest,safe,canOpenWorkspace)
      if(!encoded)return
      sessionStorage.setItem(CONTINUUM_SESSION_KEY,encoded)
      setPins(safe);setRemember(true);setRestoreCandidate(null);setPinNotice('Sematan sesi dapat dipulihkan setelah memuat ulang.')
    }catch{setPinNotice('Penyimpanan sesi tidak tersedia.')}
  }
  useEffect(()=>{
    if(!focusReturn.current)return
    focusReturn.current=false
    if(focusMode)focusExit.current?.focus()
    else root.current?.querySelector<HTMLButtonElement>('.arcticActionsTrigger')?.focus()
  },[focusMode])
  const visiblePins=previewEnabled&&currentWorkspace?allowedContinuumPins(pins,canOpenWorkspace).map(resolveContinuumPin).filter((item):item is ContinuumWorkspace=>item!==null):[]
  const available=groups.filter(group=>group.items.length>0)
  const category=available.find(group=>group.id===open)
  const actionsOpen=open==='actions'
  const skillsOpen=open==='skills'
  const availableSkills=previewEnabled?visibleContinuumSkills(available.map(group=>group.id),canOpenWorkspace):[]
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
    {focusMode&&previewEnabled?<div className="arcticFocusBar" data-arctic-focus="true"><span><strong>Mode fokus</strong> · {currentWorkspace?.label||current?.label||'Ruang kerja'}</span><button type="button" ref={focusExit} data-arctic-focus-exit onClick={()=>{focusReturn.current=true;setFocusMode(false)}}>Tampilkan navigasi</button></div>:<>
    <div className="arcticCategoryBar">
      <button type="button" className="arcticCategoryMobile" aria-expanded={open!==null&&!actionsOpen&&!skillsOpen} aria-controls={open!==null&&!actionsOpen&&!skillsOpen?id:undefined} onClick={event=>{trigger.current=event.currentTarget;setOpen(value=>value===null||value==='actions'||value==='skills'?'all':null)}}><span className="arcticMobileCaption">Kategori</span><strong>{current?.label||'AUREKA'}</strong><span aria-hidden="true">⌄</span></button>
      <div className="arcticCategoryStrip">
        {available.map(group=><button key={group.id} type="button" data-arctic-category={group.id} aria-current={group.id===activeCategoryId?'true':undefined} aria-expanded={open===group.id} aria-controls={open===group.id?id:undefined} aria-label={group.label} title={group.label} onClick={event=>{trigger.current=event.currentTarget;setOpen(value=>value===group.id?null:group.id)}}><span className="arcticFullLabel">{group.label}</span><span className="arcticShortLabel" aria-hidden="true">{SHORT_LABELS[group.id]||group.label}</span><span aria-hidden="true">⌄</span></button>)}
      </div>
      <ArcticQuickNavigation groups={available} contextKey={contextKey} onSelect={(group,item)=>{close(false);onSelect(group,item)}}/>
      <button className="arcticLayoutExit arcticActionsTrigger" type="button" aria-label="Opsi navigasi dan akun" title="Opsi navigasi dan akun" aria-expanded={actionsOpen||skillsOpen} aria-controls={actionsOpen||skillsOpen?id:undefined} onClick={event=>{trigger.current=event.currentTarget;setOpen(value=>value==='actions'?null:'actions')}}>⋯</button>
    </div>
    {visiblePins.length>0&&<div className="arcticWorkspacePins" role="group" aria-label="Tab halaman sematan sesi ini">{visiblePins.map(item=><div key={item.id} className="arcticWorkspacePin"><button type="button" data-arctic-pin={item.id} aria-current={currentWorkspace?.id===item.id?'page':undefined} onClick={()=>{if(currentWorkspace?.id===item.id)return;if(!onOpenWorkspace(item)){savePins(pins.filter(id=>id!==item.id));setPinNotice('Halaman tidak tersedia bagi akses saat ini.')}else setPinNotice('')}}>{item.label}</button><button type="button" className="arcticPinClose" aria-label={'Lepas sematan '+item.label} onClick={()=>{savePins(pins.filter(id=>id!==item.id));root.current?.querySelector<HTMLButtonElement>('.arcticActionsTrigger')?.focus()}}>×</button></div>)}</div>}
    {pinNotice&&<p role="status" className="arcticPinNotice">{pinNotice}</p>}
    {open!==null&&<section id={id} className="arcticMegaMenu" data-actions={actionsOpen||skillsOpen||undefined} aria-label={skillsOpen?'Skills Library':actionsOpen?'Opsi navigasi dan akun':category?.label||'Pilih kategori'}>
      <div className="arcticMegaHead"><strong tabIndex={-1}>{skillsOpen?'Skills Library':actionsOpen?'Opsi navigasi dan akun':category?.label||'Pilih kategori'}</strong><button type="button" onClick={()=>close(true)} aria-label="Tutup menu kategori">×</button></div>
      {skillsOpen?<><button type="button" className="arcticBackCategories" onClick={()=>setOpen('actions')}>← Opsi navigasi</button><p className="arcticSkillsIntro">Kemampuan baca-saja yang tersedia saat ini. Jalankan dan tinjau hasilnya di halaman sumber; tidak ada eksekusi otomatis.</p><div className="arcticModuleGrid">{availableSkills.map(({skill,destination})=><button key={skill.id} type="button" data-arctic-skill={skill.id} onClick={()=>{if(onOpenWorkspace(destination)){close(true);setPinNotice(skill.entry)}else{close(true);setPinNotice('Halaman skill tidak tersedia pada akses saat ini.')}}}><strong>{skill.title} · v{skill.version}</strong><small>{skill.source}</small><small>Input: {skill.input}</small><small>Hasil: {skill.output}</small><small>{skill.entry}</small></button>)}</div>{!availableSkills.length&&<p>Tidak ada skill yang tersedia untuk akses saat ini.</p>}</>:actionsOpen?<div className="arcticModuleGrid">{availableSkills.length>0&&<button type="button" data-arctic-skills-open onClick={()=>setOpen('skills')}><strong>Skills Library</strong><small>{availableSkills.length} kemampuan yang dapat dijalankan pada halaman sumber.</small></button>}{previewEnabled&&currentWorkspace&&<button type="button" data-arctic-pin-current disabled={pins.includes(currentWorkspace.id)||pins.length>=WORKSPACE_PIN_LIMIT} onClick={()=>{savePins(pinContinuumWorkspace(pins,currentWorkspace.id));setPinNotice('');close(true)}}><strong>{pins.includes(currentWorkspace.id)?'Halaman sudah disematkan':pins.length>=WORKSPACE_PIN_LIMIT?'Batas enam halaman tercapai':'Sematkan halaman aktif'}</strong><small>Shortcut sesi ini; formulir dan filter tidak disimpan.</small></button>}{previewEnabled&&<><button type="button" data-arctic-focus-enter onClick={()=>{close(false);focusReturn.current=true;setFocusMode(true)}}><strong>Mode fokus</strong><small>Sembunyikan kategori dan sematan. Kontrol akun dan halaman tetap tersedia.</small></button>{scopeDigest&&<button type="button" data-arctic-remember aria-pressed={remember} onClick={()=>{if(remember){clearContinuumSession();setRemember(false);setRestoreCandidate(null);setPinNotice('Penyimpanan sematan dinonaktifkan.')}else enableRemember(pins)}}><strong>{remember?'Hentikan pemulihan sematan':'Ingat sematan saat muat ulang'}</strong><small>Hanya ID halaman pada tab browser dan cakupan akses ini.</small></button>}{restoreCandidate&&<button type="button" data-arctic-restore onClick={()=>{enableRemember(restoreCandidate);close(true)}}><strong>Pulihkan {restoreCandidate.length} sematan</strong><small>Disaring ulang menurut kewenangan. Draft tidak dipulihkan.</small></button>}{currentWorkspace&&pins.includes(currentWorkspace.id)&&pins.length>1&&<><button type="button" data-arctic-pin-left disabled={pins.indexOf(currentWorkspace.id)===0} onClick={()=>savePins(moveContinuumPin(pins,currentWorkspace.id,-1))}><strong>Geser sematan aktif ke kiri</strong></button><button type="button" data-arctic-pin-right disabled={pins.indexOf(currentWorkspace.id)===pins.length-1} onClick={()=>savePins(moveContinuumPin(pins,currentWorkspace.id,1))}><strong>Geser sematan aktif ke kanan</strong></button></>}</>}<button type="button" data-arctic-data-preview aria-pressed={previewEnabled} onClick={()=>{close(true);onTogglePreview(!previewEnabled)}}><strong>{previewEnabled?'Nonaktifkan uji coba data-first':'Coba workspace data-first'}</strong><small>{previewEnabled?'Kembali ke tata letak data stabil':'Pilot Arctic Continuum; dapat dikembalikan kapan saja'}</small></button><button type="button" onClick={()=>{close(false);onExit()}}><strong>Layout lama</strong><small>Kembali ke navigasi sidebar</small></button><button type="button" onClick={()=>{close(false);onLogout()}}><strong>Keluar</strong><small>Keluar dari akun AUREKA</small></button></div>:category?<><button type="button" className="arcticBackCategories" onClick={()=>setOpen('all')}>← Semua kategori</button>
        <div className="arcticModuleGrid">{availableSkills.some(({skill})=>skill.ownerCategory===category.id)&&<button type="button" data-arctic-category-skills onClick={()=>setOpen('skills')}><strong>Skills kategori</strong><small>Kemampuan baca-saja yang tersedia.</small></button>}{category.items.map(item=><button key={item.id} type="button" data-arctic-destination={item.id} aria-current={isActive(item)?'page':undefined} disabled={item.status==='planned'} onClick={()=>{close(true);onSelect(category.id,item)}}><strong>{item.label}</strong>{item.note&&<small>{item.note}</small>}{item.status==='planned'&&<small>Belum aktif</small>}</button>)}</div></>
      :<div className="arcticModuleGrid">{available.map(group=><button key={group.id} type="button" onClick={()=>setOpen(group.id)}><strong>{group.label}</strong><small>{group.items.length} modul{group.id===activeCategoryId?' · Kategori aktif':''}</small></button>)}</div>}
    </section>}
    </>}
  </nav>
}
