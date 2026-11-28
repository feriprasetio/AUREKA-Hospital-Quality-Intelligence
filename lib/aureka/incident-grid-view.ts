// Presentation-only grid state. Never persist row IDs, query terms or values.
import { paginateGrid } from './grid-pagination.ts'
export const INCIDENT_GRID_COLUMNS = [
 ['incident_code','Kode',true],['incident_date','Tanggal',false],['unit_name','Unit',true],
 ['incident_type','Jenis',false],['summary','Ringkasan',false],['status','Status',true],
] as const
export type IncidentGridColumn = typeof INCIDENT_GRID_COLUMNS[number][0]
export type IncidentGridSort = {key:IncidentGridColumn;direction:1|-1}
const collator=new Intl.Collator('id-ID',{numeric:true,sensitivity:'base'})
export function incidentGridColumns(hidden:readonly string[]=[]) {
 return INCIDENT_GRID_COLUMNS.filter(([key,,required])=>required||!hidden.includes(key))
}
export function sortIncidentGrid<T extends {id:string} & Record<IncidentGridColumn,string|null>>(rows:readonly T[],sort:IncidentGridSort|null):readonly T[] {
 if(!sort)return rows
 return [...rows].sort((a,b)=>{
   const av=String(a[sort.key]??''),bv=String(b[sort.key]??'')
   return (!av&&!bv?0:!av?1:!bv?-1:collator.compare(av,bv)*sort.direction)||a.id.localeCompare(b.id)
 })
}
export function incidentGridPage<T>(rows:readonly T[],page:number,size:number) {
 return paginateGrid(rows,page,size,[25,50,100],25)
}
