// Shared display pagination, deliberately independent of filtering, exports, writes and RLS.
// The caller supplies already-authorized, already-filtered rows.
export const GRID_PAGE_SIZES = [15,25,50,100] as const
export function normalizeGridPageSize(value:unknown, allowed:readonly number[]=GRID_PAGE_SIZES, fallback=25):number {
  return typeof value==='number' && Number.isInteger(value) && allowed.includes(value) && value>0 ? value : fallback
}
export function paginateGrid<T>(rows:readonly T[],page:number,size:number,allowed:readonly number[]=GRID_PAGE_SIZES,fallback=25) {
  const pageSize=normalizeGridPageSize(size,allowed,fallback)
  const pages=Math.max(1,Math.ceil(rows.length/pageSize))
  const current=Math.min(pages,Math.max(1,Number.isFinite(page)?Math.trunc(page):1))
  const offset=(current-1)*pageSize
  return {rows:rows.slice(offset,offset+pageSize),current,pages,start:rows.length?offset+1:0,end:Math.min(offset+pageSize,rows.length)}
}
