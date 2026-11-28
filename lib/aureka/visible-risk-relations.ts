// Only resolve stored relationships for which both endpoints are in the authorized current view.
type Endpoint={id:string}
type Edge={id:string;source_risk_id:string;target_risk_id:string;relationship_type:string;created_at:string}
export function resolveVisibleRiskRelations<T extends Endpoint,E extends Edge>(rows:readonly T[],edges:readonly E[],id:string){
 const byId=new Map(rows.map(row=>[row.id,row]))
 if(!byId.has(id))return []
 const result:Array<{edge:E;other:T;direction:'outgoing'|'incoming'}>=[]
 for(const edge of edges){
  if(edge.source_risk_id!==id&&edge.target_risk_id!==id)continue
  if(edge.source_risk_id===edge.target_risk_id)continue
  const direction=edge.source_risk_id===id?'outgoing':'incoming'
  const other=byId.get(direction==='outgoing'?edge.target_risk_id:edge.source_risk_id)
  if(other)result.push({edge,other,direction})
 }
 return result
}
