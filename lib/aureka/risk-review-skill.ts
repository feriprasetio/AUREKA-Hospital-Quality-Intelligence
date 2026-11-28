import { buildCsvTable } from './csv-export.ts'
export const RISK_REVIEW_SKILL = Object.freeze({
  id:'risk-register-review',version:1,ownerCategory:'quality_patient_safety',
  source:'aureka_risk.risk_register',effect:'read-only',reviewRequired:true,
  inputs:['current authorized register snapshot','active filters','existing matrix and level functions'],
  steps:['validate snapshot','compare stored scores and levels with existing method','aggregate review indicators','preview and export'],
  output:'aggregate counts and review checklist',
})
const levels=['Sangat Rendah','Rendah','Sedang','Tinggi','Sangat Tinggi'] as const
type Level=typeof levels[number]
export type RiskReviewRow={
 likelihood:number;impact:number;risk_score:number;risk_level:string;
 residual_likelihood:number|null;residual_impact:number|null;residual_score:number|null;residual_level:string|null;
 owner_name:string|null;due_date:string|null;existing_controls:string|null;status:string
}
type Method={score:(likelihood:number,impact:number)=>number;level:(score:number)=>string}
const parameter=(v:unknown):v is number=>typeof v==='number'&&Number.isInteger(v)&&v>=1&&v<=5
const isLevel=(v:unknown):v is Level=>typeof v==='string'&&(levels as readonly string[]).includes(v)
export function reviewRiskSnapshot(rows:readonly RiskReviewRow[],method:Method){
 const distribution=levels.map(level=>({level,total:0,active:0}))
 let unknownLevel=0,baselineMismatch=0,residualMissing=0,residualMismatch=0,missingOwner=0,missingDue=0,missingControls=0,activePriority=0,unknownStatus=0
 for(const row of rows){
  const active=row.status==='Open'||row.status==='In Progress'
  if(!['Open','In Progress','Controlled','Accepted'].includes(row.status))unknownStatus++
  const validBaseline=parameter(row.likelihood)&&parameter(row.impact)&&row.risk_score===method.score(row.likelihood,row.impact)&&row.risk_level===method.level(row.risk_score)
  if(!validBaseline)baselineMismatch++
  if(isLevel(row.risk_level)){const group=distribution.find(x=>x.level===row.risk_level)!;group.total++;if(active)group.active++}
  else unknownLevel++
  if(active&&validBaseline&&['Sedang','Tinggi','Sangat Tinggi'].includes(row.risk_level))activePriority++
  if(row.residual_likelihood==null&&row.residual_impact==null&&row.residual_score==null&&row.residual_level==null)residualMissing++
  else if(!(parameter(row.residual_likelihood)&&parameter(row.residual_impact)&&row.residual_score===method.score(row.residual_likelihood,row.residual_impact)&&row.residual_level===method.level(row.residual_score)))residualMismatch++
  if(active&&!row.owner_name?.trim())missingOwner++
  if(active&&!row.due_date?.trim())missingDue++
  if(!row.existing_controls?.trim())missingControls++
 }
 return {total:rows.length,distribution,unknownLevel,baselineMismatch,residualMissing,residualMismatch,missingOwner,missingDue,missingControls,activePriority,unknownStatus}
}
export type RiskReviewResult=ReturnType<typeof reviewRiskSnapshot>
export function riskReviewMetrics(result:RiskReviewResult):Array<[string,number]>{
 return [['Total risiko',result.total],['Risiko aktif Sedang atau lebih tinggi dengan skor terverifikasi',result.activePriority],['Baseline perlu verifikasi',result.baselineMismatch],['Level tidak dikenal',result.unknownLevel],['Status tidak dikenal',result.unknownStatus],['Residual belum dinilai',result.residualMissing],['Residual perlu verifikasi',result.residualMismatch],['Risiko aktif tanpa pemilik',result.missingOwner],['Risiko aktif tanpa tenggat',result.missingDue],['Risiko tanpa kontrol tercatat',result.missingControls]]
}
export function riskReviewCsv(result:RiskReviewResult,scope:string,refreshedAt:string):string{
 return buildCsvTable(['Jenis','Keterangan','Nilai'],[
  ['Metadata','Status','Draf review baca-saja'],['Metadata','Sumber',RISK_REVIEW_SKILL.source],['Metadata','Cakupan filter',scope],['Metadata','Snapshot berhasil dimuat',refreshedAt],
  ...riskReviewMetrics(result).map(([label,value])=>['Tinjauan',label,value]),
  ...result.distribution.flatMap(x=>[['Level tersimpan',x.level,x.total],['Level aktif tersimpan',x.level,x.active]])
 ])
}
