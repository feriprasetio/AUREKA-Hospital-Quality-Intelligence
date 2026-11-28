/** Read-only view of existing authorized governance records. No inferred links or changes. */
export type GovernanceReviewAction={recommendation_id:string|null;status:string;due_date:string|null;improvement_method:string;cycle_plan:string;cycle_do:string;cycle_study_check:string;cycle_act:string}
export function scopedGovernanceActions<T extends {recommendation_id:string|null}>(actions:readonly T[],visibleRecommendationIds:readonly string[]){
 const ids=new Set(visibleRecommendationIds)
 // Unlinked items remain visible, as in the existing register. Never infer an inaccessible parent.
 return actions.filter(a=>!a.recommendation_id||ids.has(a.recommendation_id))
}
export function governanceReview(rows:readonly GovernanceReviewAction[],today:string){
 const states=['terbuka','berjalan','selesai','terverifikasi','dibatalkan']
 const terminal=new Set(['terverifikasi','dibatalkan','selesai'])
 const status=states.map(s=>({status:s,count:rows.filter(r=>r.status===s).length}))
 return {total:rows.length,status,other:rows.filter(r=>!states.includes(r.status)).length,overdue:rows.filter(r=>!terminal.has(r.status)&&r.due_date&&/^\d{4}-\d{2}-\d{2}$/.test(r.due_date)&&r.due_date<today).length,withoutDue:rows.filter(r=>!terminal.has(r.status)&&!r.due_date).length,unlinked:rows.filter(r=>!r.recommendation_id).length,incompleteCycle:rows.filter(r=>!['PDSA','PDCA'].includes(r.improvement_method)||![r.cycle_plan,r.cycle_do,r.cycle_study_check,r.cycle_act].every(x=>typeof x==='string'&&x.trim().length>0)).length}
}
