type Counted={affected_count:number}
type ResponseGroup=Counted&{auto_fixable:boolean}
type WarningGroup=Counted&{pending_count:number;needs_source_correction_count:number}
const valid=(v:unknown):v is number=>typeof v==='number'&&Number.isSafeInteger(v)&&v>=0
export function summarizeReconciliationPreview(response:readonly ResponseGroup[],warnings:readonly WarningGroup[]){
 if(!response.every(r=>valid(r.affected_count)&&typeof r.auto_fixable==='boolean')||!warnings.every(r=>valid(r.affected_count)&&valid(r.pending_count)&&valid(r.needs_source_correction_count)))return null
 const metrics={
 responseGroups:response.length,
 responseEntries:response.reduce((n,r)=>n+r.affected_count,0),
 autoGroups:response.filter(r=>r.auto_fixable).length,
 autoEntries:response.filter(r=>r.auto_fixable).reduce((n,r)=>n+r.affected_count,0),
 manualGroups:response.filter(r=>!r.auto_fixable).length,
 warningGroups:warnings.length,
 warningEntries:warnings.reduce((n,r)=>n+r.affected_count,0),
 pendingWarnings:warnings.reduce((n,r)=>n+r.pending_count,0),
 sourceCorrectionWarnings:warnings.reduce((n,r)=>n+r.needs_source_correction_count,0)
 }
 return Object.values(metrics).every(valid)?metrics:null
}
