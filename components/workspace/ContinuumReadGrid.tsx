'use client'
import {useState,type ReactNode} from 'react'
import {readGridPage,normalizeReadGridView,moveReadGridColumn,stepReadGridHistory,type ReadGridHistory,type ReadGridColumn,type ReadGridSort,type ReadGridView,type ReadGridDisplayColumn} from '@/lib/aureka/read-grid'
import {GRID_PAGE_SIZES} from '@/lib/aureka/grid-pagination'
/** Local view only: caller owns authorized data, no writes, no storage and no claims of server totals. */
export default function ContinuumReadGrid<T>({rows,columns,label,children,showSearch=true,display=[]}:{rows:readonly T[];columns:readonly ReadGridColumn<T>[];label:string;showSearch?:boolean;display?:readonly ReadGridDisplayColumn[];children:(page:readonly T[],filtered:boolean,keys:readonly string[])=>ReactNode}){
 const [query,setQuery]=useState('')
 const [sort,setSort]=useState<ReadGridSort[]>([])
 const [size,setSize]=useState(25)
 const [page,setPage]=useState(1)
 const [order,setOrder]=useState<string[]>([])
 const [hidden,setHidden]=useState<string[]>([])
 const [saved,setSaved]=useState<ReadGridView|null>(null)
 const [notice,setNotice]=useState('')
 const [history,setHistory]=useState<ReadGridHistory>({past:[],future:[]})
 const sortKeys=columns.map(c=>c.id)
 const config=normalizeReadGridView({order,hidden,sort,size},display,sortKeys)
 const visibleKeys=config.order.filter(id=>!config.hidden.includes(id))
 const activeColumns=columns.filter(c=>!config.hidden.includes(c.id))
 const view=readGridPage(rows,activeColumns,query,config.sort,page,config.size)
 const applyView=(next:ReadGridView)=>{setOrder(next.order);setHidden(next.hidden);setSort(next.sort);setSize(next.size);setPage(1)}
 const step=(action:'change'|'undo'|'redo',next?:ReadGridView)=>{const result=stepReadGridHistory(history,config,action,next?normalizeReadGridView(next,display,sortKeys):undefined);setHistory(result.history);applyView(normalizeReadGridView(result.view,display,sortKeys))}
 const apply=(next:ReadGridView)=>step('change',next)
 const toggleColumn=(id:string)=>apply(normalizeReadGridView({...config,hidden:config.hidden.includes(id)?config.hidden.filter(key=>key!==id):[...config.hidden,id]},display,sortKeys))
 return <section className="continuumReadGrid" aria-label={label} data-continuum-read-grid>
  <div className="continuumReadGridTools">{showSearch&&<label>Cari pada data dimuat<input data-read-grid-search value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} maxLength={200}/></label>}
  <details><summary>Urutan{config.sort.length?' · '+config.sort.length:''}</summary><ol>{config.sort.map(s=><li key={s.key}><span>{columns.find(c=>c.id===s.key)?.label}</span><button type="button" onClick={()=>{apply({...config,sort:config.sort.map(x=>x.key===s.key?{...x,direction:x.direction===1?-1:1}:x)})}}>{s.direction===1?'Naik':'Turun'}</button><button type="button" onClick={()=>{apply({...config,sort:config.sort.filter(x=>x.key!==s.key)})}} aria-label={'Hapus urutan '+s.key}>Hapus</button></li>)}</ol>
  <label>Tambah urutan<select data-read-grid-sort value="" disabled={config.sort.length>=3} onChange={e=>{const key=e.target.value;if(activeColumns.some(c=>c.id===key)&&!config.sort.some(x=>x.key===key)){apply({...config,sort:[...config.sort,{key,direction:1}]})}}}><option value="">Pilih kolom</option>{activeColumns.filter(c=>!config.sort.some(s=>s.key===c.id)).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label></details>
  {display.length>0&&<details data-read-grid-columns><summary>Kolom dan tampilan</summary><p>Kolom wajib tetap terlihat. Pengaturan ini tidak mengubah kewenangan atau sumber data.</p><ol>{config.order.map((id,index)=>{const column=display.find(c=>c.id===id)!;return <li key={id}><label><input type="checkbox" data-read-grid-column={id} checked={!config.hidden.includes(id)} disabled={index===0||column.required} onChange={()=>toggleColumn(id)}/>{column.label}</label><button type="button" data-read-grid-left={id} aria-label={'Geser '+column.label+' ke kiri'} disabled={index<=1} onClick={()=>apply({...config,order:moveReadGridColumn(config.order,id,-1)})}>←</button><button type="button" aria-label={'Geser '+column.label+' ke kanan'} disabled={index===0||index===config.order.length-1} onClick={()=>apply({...config,order:moveReadGridColumn(config.order,id,1)})}>→</button></li>})}</ol><button type="button" data-read-grid-save onClick={()=>{setSaved(config);setNotice('Tampilan tersimpan selama halaman ini terbuka.')}}>Simpan tampilan sesi</button><button type="button" data-read-grid-restore disabled={!saved} onClick={()=>{if(saved){apply(normalizeReadGridView(saved,display,sortKeys));setNotice('Tampilan dipulihkan.')}}}>Pulihkan tampilan</button>{notice&&<p role="status">{notice}</p>}<small>Hanya urutan, visibilitas kolom, sort dan jumlah baris. Tidak menyimpan kata pencarian atau data.</small><div className="continuumReadGridTools"><button type="button" data-read-grid-undo disabled={!history.past.length} onClick={()=>step('undo')}>Urungkan perubahan tampilan</button><button type="button" data-read-grid-redo disabled={!history.future.length} onClick={()=>step('redo')}>Ulangi perubahan tampilan</button></div></details>}
  <button type="button" data-read-grid-reset onClick={()=>{setQuery('');apply(normalizeReadGridView({},display,sortKeys));setNotice('')}}>Reset tampilan</button></div>
  {children(view.rows,Boolean(query.trim()),visibleKeys)}
  <footer className="continuumReadGridTools"><span role="status" data-read-grid-count>{view.start}–{view.end} dari {view.total} hasil · {view.loaded} dimuat</span><label>Baris<select data-read-grid-size value={size} onChange={e=>{apply({...config,size:Number(e.target.value)})}}>{GRID_PAGE_SIZES.map(n=><option key={n} value={n}>{n}</option>)}</select></label><button type="button" disabled={view.current<=1} onClick={()=>setPage(view.current-1)}>Sebelumnya</button><button type="button" disabled={view.current>=view.pages} onClick={()=>setPage(view.current+1)}>Berikutnya</button></footer>
 </section>
}
