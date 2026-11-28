'use client'
import {useState,type ReactNode} from 'react'
import {readGridPage,type ReadGridColumn,type ReadGridSort} from '@/lib/aureka/read-grid'
import {GRID_PAGE_SIZES} from '@/lib/aureka/grid-pagination'
/** Local view only: caller owns authorized data, no writes, no storage and no claims of server totals. */
export default function ContinuumReadGrid<T>({rows,columns,label,children,showSearch=true}:{rows:readonly T[];columns:readonly ReadGridColumn<T>[];label:string;showSearch?:boolean;children:(page:readonly T[],filtered:boolean)=>ReactNode}){
 const [query,setQuery]=useState('')
 const [sort,setSort]=useState<ReadGridSort[]>([])
 const [size,setSize]=useState(25)
 const [page,setPage]=useState(1)
 const view=readGridPage(rows,columns,query,sort,page,size)
 return <section className="continuumReadGrid" aria-label={label} data-continuum-read-grid>
  <div className="continuumReadGridTools">{showSearch&&<label>Cari pada data dimuat<input data-read-grid-search value={query} onChange={e=>{setQuery(e.target.value);setPage(1)}} maxLength={200}/></label>}
  <details><summary>Urutan{sort.length?' · '+sort.length:''}</summary><ol>{sort.map(s=><li key={s.key}><span>{columns.find(c=>c.id===s.key)?.label}</span><button type="button" onClick={()=>{setSort(current=>current.map(x=>x.key===s.key?{...x,direction:x.direction===1?-1:1}:x));setPage(1)}}>{s.direction===1?'Naik':'Turun'}</button><button type="button" onClick={()=>{setSort(current=>current.filter(x=>x.key!==s.key));setPage(1)}} aria-label={'Hapus urutan '+s.key}>Hapus</button></li>)}</ol>
  <label>Tambah urutan<select data-read-grid-sort value="" disabled={sort.length>=3} onChange={e=>{const key=e.target.value;if(columns.some(c=>c.id===key)&&!sort.some(x=>x.key===key)){setSort(current=>[...current,{key,direction:1}]);setPage(1)}}}><option value="">Pilih kolom</option>{columns.filter(c=>!sort.some(s=>s.key===c.id)).map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label></details>
  <button type="button" onClick={()=>{setQuery('');setSort([]);setPage(1)}}>Reset tampilan</button></div>
  {children(view.rows,Boolean(query.trim()))}
  <footer className="continuumReadGridTools"><span role="status" data-read-grid-count>{view.start}–{view.end} dari {view.total} hasil · {view.loaded} dimuat</span><label>Baris<select data-read-grid-size value={size} onChange={e=>{setSize(Number(e.target.value));setPage(1)}}>{GRID_PAGE_SIZES.map(n=><option key={n} value={n}>{n}</option>)}</select></label><button type="button" disabled={view.current<=1} onClick={()=>setPage(view.current-1)}>Sebelumnya</button><button type="button" disabled={view.current>=view.pages} onClick={()=>setPage(view.current+1)}>Berikutnya</button></footer>
 </section>
}
