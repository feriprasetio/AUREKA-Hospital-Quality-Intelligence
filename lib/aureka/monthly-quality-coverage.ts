import type {IndicatorResult} from './quality-results-engine.ts'
export const QUALITY_MONTH_NAMES=['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'] as const
type Input=Pick<IndicatorResult,'monthly'|'continuous'>
// Counts of profiles, not patient counts. Do not re-aggregate percentages or round target comparisons.
export function monthlyQualityCoverage(results:readonly Input[],month:number){
 if(!Number.isInteger(month)||month<1||month>12)return null
 let observed=0,measurable=0,withoutObservation=0,withoutMeasure=0,validatedProfileRecords=0
 for(const result of results){
  const bucket=result.monthly.find(item=>item.month===month)
  if(bucket&&Number.isSafeInteger(bucket.validatedRecords)&&bucket.validatedRecords>=0)validatedProfileRecords+=bucket.validatedRecords
  if(!bucket||!Number.isFinite(bucket.observations)||bucket.observations<=0){withoutObservation++;continue}
  observed++
  const measured=result.continuous?bucket.mean:bucket.rate
  if(typeof measured==='number'&&Number.isFinite(measured))measurable++
  else withoutMeasure++
 }
 return {active:results.length,observed,measurable,withoutObservation,withoutMeasure,validatedProfileRecords}
}
