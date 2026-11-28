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

export type ReadGridDisplayColumn={id:string;label:string;required?:boolean}
export type ReadGridView={order:string[];hidden:string[];sort:ReadGridSort[];size:number}
export function normalizeReadGridView(input:Partial<ReadGridView>,display:readonly ReadGridDisplayColumn[],sortKeys:readonly string[]):ReadGridView{
 const ids=display.map(c=>c.id),first=ids[0]
 const order=Array.from(new Set([...(first?[first]:[]),...(Array.isArray(input.order)?input.order.filter(id=>ids.includes(id)):[]),...ids]))
 const hidden=display.filter(c=>c.id!==first&&!c.required&&Array.isArray(input.hidden)&&input.hidden.includes(c.id)).map(c=>c.id)
 const sort=(Array.isArray(input.sort)?input.sort:[]).filter((s,i,a)=>s&&sortKeys.includes(s.key)&&!hidden.includes(s.key)&&(s.direction===1||s.direction===-1)&&a.findIndex(t=>t?.key===s.key)===i).slice(0,3).map(s=>({...s}))
 return {order,hidden,sort,size:[15,25,50,100].includes(input.size??0)?input.size!:25}
}
export function moveReadGridColumn(order:readonly string[],id:string,offset:-1|1):string[]{
 const next=[...order],index=next.indexOf(id),target=index+offset
 if(index<1||target<1||target>=next.length)return next
 ;[next[index],next[target]]=[next[target],next[index]]
 return next
}

export type ReadGridHistory={past:ReadGridView[];future:ReadGridView[]}
export function stepReadGridHistory(history:ReadGridHistory,current:ReadGridView,action:'change'|'undo'|'redo',next?:ReadGridView){
 if(action==='change'){
  if(!next||JSON.stringify(next)===JSON.stringify(current))return {view:current,history}
  return {view:next,history:{past:[...history.past,current].slice(-20),future:[] as ReadGridView[]}}
 }
 if(action==='undo'&&history.past.length)return {view:history.past.at(-1)!,history:{past:history.past.slice(0,-1),future:[current,...history.future].slice(0,20)}}
 if(action==='redo'&&history.future.length)return {view:history.future[0],history:{past:[...history.past,current].slice(-20),future:history.future.slice(1)}}
 return {view:current,history}
}
