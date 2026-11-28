'use client'
import {useEffect,useId,useRef,type ReactNode} from 'react'
import AurekaModal from '@/components/ui/AurekaModal'
type Props={title:string;subtitle:string;split:boolean;canSplit:boolean;onModeChange:(split:boolean)=>void;onClose:()=>void;onFullDetail:()=>void;children:ReactNode}
/** Read-only surface; the domain owns query, scope and action adapters. */
export default function ContinuumInspector({title,subtitle,split,canSplit,onModeChange,onClose,onFullDetail,children}:Props){
 const id=useId()
 const heading=useRef<HTMLHeadingElement>(null)
 useEffect(()=>{if(split){const frame=requestAnimationFrame(()=>heading.current?.focus());return()=>cancelAnimationFrame(frame)}},[split])
 const controls=<><button type="button" className="akBtn akBtnGhost" onClick={onClose}>Tutup</button>{canSplit&&<button type="button" className="akBtn akBtnGhost" data-inspector-switch onClick={()=>onModeChange(!split)}>{split?'Pratinjau dialog':'Buka berdampingan'}</button>}<button type="button" className="akBtn akBtnPrimary" data-inspector-full onClick={onFullDetail}>Detail lengkap</button></>
 if(!split)return <AurekaModal open title={title} subtitle={subtitle} onClose={onClose} size="lg" footer={controls}><div className="continuumInspectorContent" data-continuum-inspector="quick">{children}</div></AurekaModal>
 return <aside className="continuumInspector" data-continuum-inspector="split" aria-labelledby={id} onKeyDown={e=>{if(e.key==='Escape'&&!e.defaultPrevented){e.preventDefault();onClose()}}}>
 <header><h3 ref={heading} tabIndex={-1} id={id}>{title}</h3><p>{subtitle}</p></header>
 <div className="continuumInspectorContent">{children}</div>
 <footer>{controls}</footer>
 </aside>
}
