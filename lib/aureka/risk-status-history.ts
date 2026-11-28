type Plan={id:string;plan_code:string;title:string;owner_room_id:number|null}
type Relation={plan_id:string;risk_id:string}
type Event={id:string;plan_id:string;from_status:string;to_status:string;action:string;created_at:string}
export function resolveRiskStatusHistory<T extends Plan,E extends Event>(riskId:string,visibleRiskIds:readonly string[],plans:readonly T[],relations:readonly Relation[],events:readonly E[],canViewPlan:(plan:T)=>boolean){
 if(!visibleRiskIds.includes(riskId))return []
 const related=new Set(relations.filter(r=>r.risk_id===riskId).map(r=>r.plan_id))
 const visible=new Map(plans.filter(p=>related.has(p.id)&&canViewPlan(p)).map(p=>[p.id,p]))
 return events.flatMap(event=>{
  const plan=visible.get(event.plan_id)
  return plan?[{event,plan}]:[]
 }).sort((a,b)=>b.event.created_at.localeCompare(a.event.created_at)||a.event.id.localeCompare(b.event.id))
}
