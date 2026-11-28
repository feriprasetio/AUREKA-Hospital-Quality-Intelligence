import { aurekaSupabase } from '@/lib/aureka/supabase'
import { readIndicatorResultDataset } from '@/lib/aureka/quality-result-dataset'
import { calculateIndicatorResultsForProfiles } from '@/lib/aureka/quality-results-engine'
import { readAurekaPortfolioSummary } from '@/lib/aureka/metric-contracts'
import { buildPublicInm, safePublicPartition } from '@/lib/aureka/public-publication-engine'
export async function loadPublicInm(year:number,month:number,signal:AbortSignal) {
  const dataset=await readIndicatorResultDataset(aurekaSupabase,year,null,signal,true)
  return buildPublicInm(calculateIndicatorResultsForProfiles(dataset.profiles,dataset.rows,year,false),year,month)
}
export async function loadPublicAggregate(domain:'safety'|'risk',year:number) {
  const result=await readAurekaPortfolioSummary(aurekaSupabase,year,null)
  const summary=result.data
  if(result.status!=='complete'||!summary||summary.year!==year||summary.room_id!==null) throw new Error('Ringkasan rumah sakit lengkap belum tersedia.')
  const data:Record<string,unknown>={}
  const monthly=(rows:{month:number;total:number}[])=>safePublicPartition(rows.filter(r=>Number.isInteger(r.month)&&r.month>=1&&r.month<=12).map(r=>({label:String(year)+'-'+String(r.month).padStart(2,'0'),count:r.total})))
  if(domain==='safety'){
    const trend=monthly(summary.incidents.monthly)
    const actions=safePublicPartition([{label:'Terbuka',count:summary.incidents.open},{label:'Ditutup',count:summary.incidents.closed}])
    if(trend.length)data.monthly=trend
    if(actions.length&&summary.incidents.open+summary.incidents.closed===summary.incidents.total)data.actions=actions
  }else{
    const trend=monthly(summary.risk.monthly)
    const levels=safePublicPartition(summary.risk.levels.map(r=>({label:r.label,count:r.count})).filter(r=>/^(very high|high|moderate|medium|low|very low|sangat tinggi|tinggi|sedang|rendah|sangat rendah)$/i.test(r.label)))
    if(trend.length)data.monthly=trend
    if(levels.length&&levels.reduce((n,r)=>n+r.count,0)===summary.risk.total)data.levels=levels
  }
  if(!Object.keys(data).length)throw new Error('Belum ada agregat yang memenuhi batas privasi dan kelengkapan publikasi.')
  return data
}
