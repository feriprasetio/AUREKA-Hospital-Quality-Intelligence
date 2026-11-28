// Presentation-only grid state. Never persist row IDs, query terms or values.
import { paginateGrid } from './grid-pagination.ts'
export const INCIDENT_GRID_COLUMNS = [
 ['incident_code','Kode',true],['incident_date','Tanggal',false],['unit_name','Unit',true],
 ['incident_type','Jenis',false],['summary','Ringkasan',false],['status','Status',true],
] as const
export type IncidentGridColumn = typeof INCIDENT_GRID_COLUMNS[number][0]
export type IncidentGridSort = {key:IncidentGridColumn;direction:1|-1}
export const INCIDENT_SORT_LIMIT=3
export const INCIDENT_COLUMN_ORDER=INCIDENT_GRID_COLUMNS.map(([key])=>key)
const allowed=new Set<string>(INCIDENT_COLUMN_ORDER)
const isColumn=(key:unknown):key is IncidentGridColumn=>typeof key==='string'&&allowed.has(key)
const collator=new Intl.Collator('id-ID',{numeric:true,sensitivity:'base'})
export function normalizeIncidentOrder(order:readonly unknown[]=[]):IncidentGridColumn[]{
 return ['incident_code',...Array.from(new Set([...order.filter(isColumn),...INCIDENT_COLUMN_ORDER])).filter(key=>key!=='incident_code')]
}
export function moveIncidentColumn(order:readonly unknown[],key:IncidentGridColumn,offset:-1|1):IncidentGridColumn[]{
 const result=normalizeIncidentOrder(order),index=result.indexOf(key),next=index+offset
 if(index<1||next<1||next>=result.length)return result
 ;[result[index],result[next]]=[result[next],result[index]]
 return result
}
export function incidentGridColumns(hidden:readonly string[]=[],order:readonly unknown[]=[]) {
 return normalizeIncidentOrder(order).map(key=>INCIDENT_GRID_COLUMNS.find(column=>column[0]===key)!).filter(([key,,required])=>required||!hidden.includes(key))
}
export function normalizeIncidentSort(input:unknown,visible:readonly IncidentGridColumn[]=INCIDENT_COLUMN_ORDER):IncidentGridSort[]{
 const values=Array.isArray(input)?input:input?[input]:[]
 const result:IncidentGridSort[]=[]
 for(const item of values){
  if(!item||!isColumn(item.key)||!visible.includes(item.key)||![1,-1].includes(item.direction)||result.some(sort=>sort.key===item.key))continue
  result.push({key:item.key,direction:item.direction})
  if(result.length===INCIDENT_SORT_LIMIT)break
 }
 return result
}
export function toggleIncidentSort(current:readonly IncidentGridSort[],key:IncidentGridColumn,append=false):IncidentGridSort[]{
 const valid=normalizeIncidentSort(current)
 const existing=valid.find(item=>item.key===key)
 const next:IncidentGridSort|null=existing?existing.direction===1?{key,direction:-1}:null:{key,direction:1}
 if(!append)return next?[next]:[]
 if(existing)return valid.flatMap(item=>item.key===key?(next?[next]:[]):[item])
 return normalizeIncidentSort([...valid,{key,direction:1}])
}
export function sortIncidentGrid<T extends {id:string} & Record<IncidentGridColumn,string|null>>(rows:readonly T[],sort:IncidentGridSort|null|readonly IncidentGridSort[]):readonly T[] {
 const criteria=normalizeIncidentSort(sort)
 if(!criteria.length)return rows
 return [...rows].sort((a,b)=>{
   for(const {key,direction} of criteria){
    const av=String(a[key]??''),bv=String(b[key]??'')
    const result=!av&&!bv?0:!av?1:!bv?-1:collator.compare(av,bv)*direction
    if(result)return result
   }
   return a.id.localeCompare(b.id)
 })
}
export type IncidentGridView={hidden:IncidentGridColumn[];order:IncidentGridColumn[];sort:IncidentGridSort[];pageSize:number}
export function normalizeIncidentView(input:Partial<IncidentGridView>):IncidentGridView{
 const hidden=INCIDENT_GRID_COLUMNS.filter(([key,,required])=>!required&&Array.isArray(input.hidden)&&input.hidden.includes(key)).map(([key])=>key)
 const order=normalizeIncidentOrder(Array.isArray(input.order)?input.order:[])
 return {hidden,order,sort:normalizeIncidentSort(input.sort,incidentGridColumns(hidden,order).map(([key])=>key)),pageSize:[25,50,100].includes(input.pageSize??0)?input.pageSize!:25}
}
export type IncidentAdvancedFilter={from:string;to:string;type:string}
export const EMPTY_INCIDENT_ADVANCED:IncidentAdvancedFilter={from:'',to:'',type:''}
const isDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value
export function incidentAdvancedError(filter:IncidentAdvancedFilter):string|null{
 if((filter.from&&!isDate(filter.from))||(filter.to&&!isDate(filter.to)))return 'Tanggal filter belum valid.'
 if(filter.from&&filter.to&&filter.from>filter.to)return 'Tanggal awal harus sebelum atau sama dengan tanggal akhir.'
 return null
}
export function matchesIncidentAdvanced(row:{incident_date:string|null;incident_type:string},filter:IncidentAdvancedFilter):boolean{
 if(incidentAdvancedError(filter))return false
 if(filter.type&&row.incident_type!==filter.type)return false
 if(!filter.from&&!filter.to)return true
 const date=row.incident_date?.slice(0,10)
 return Boolean(date&&isDate(date)&&(!filter.from||date>=filter.from)&&(!filter.to||date<=filter.to))
}
export function incidentGridPage<T>(rows:readonly T[],page:number,size:number) {
 return paginateGrid(rows,page,size,[25,50,100],25)
}
