import {paginateGrid} from './grid-pagination.ts'
export type ReadGridColumn<T>={id:string;label:string;value:(row:T)=>string|number|null|undefined}
export type ReadGridSort={key:string;direction:1|-1}
const collator=new Intl.Collator('id-ID',{numeric:true,sensitivity:'base'})
const normalized=(v:unknown)=>String(v??'').normalize('NFC').toLocaleLowerCase('id-ID').trim()
export function readGridRows<T>(rows:readonly T[],columns:readonly ReadGridColumn<T>[],query:string,sort:readonly ReadGridSort[]){
 const keys=new Map(columns.map(c=>[c.id,c]))
 const term=normalized(query)
 const criteria=sort.filter((s,i)=>keys.has(s.key)&&(s.direction===1||s.direction===-1)&&sort.findIndex(x=>x.key===s.key)===i).slice(0,3)
 const result=rows.filter(row=>!term||columns.some(c=>normalized(c.value(row)).includes(term)))
 if(!criteria.length)return result
 return result.map((row,index)=>({row,index})).sort((a,b)=>{
  for(const s of criteria){const c=keys.get(s.key)!;const x=c.value(a.row),y=c.value(b.row)
   const missing=(v:unknown)=>v==null||v===''||(typeof v==='number'&&!Number.isFinite(v))
   if(missing(x)||missing(y)){if(missing(x)!==missing(y))return missing(x)?1:-1;continue}
   const cmp=typeof x==='number'&&typeof y==='number'?x-y:collator.compare(String(x),String(y))
   if(cmp)return cmp*s.direction
  }
  return a.index-b.index
 }).map(x=>x.row)
}
export function readGridPage<T>(rows:readonly T[],columns:readonly ReadGridColumn<T>[],query:string,sort:readonly ReadGridSort[],page:number,size:number){
 const filtered=readGridRows(rows,columns,query,sort)
 return {...paginateGrid(filtered,page,size),total:filtered.length,loaded:rows.length}
}
