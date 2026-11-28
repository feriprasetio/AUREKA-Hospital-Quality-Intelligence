export const CLINICAL_LINK_STATES = [
 ['identity_or_dates_missing','Identitas atau tanggal tidak lengkap'],
 ['ambiguous','Kunci ganda / kandidat ambigu'],
 ['no_exact_candidate','Tidak ditemukan kandidat persis'],
 ['unique_unvalidated_candidate','Kandidat tunggal belum tervalidasi'],
 ['unique_validated_candidate','Kandidat tunggal dengan audit tervalidasi'],
] as const
type State=typeof CLINICAL_LINK_STATES[number][0]
export type ClinicalCostLinkage={import_id:string;method:string;episodes:number;states:{state:State;count:number}[];cohorts:{template_code:string;inacbg_code:string;class_code:string;n:number;mean_tarif_rs:number|null;mean_tariff_inacbg:number|null;mean_gap:number|null;mean_los:number|null;tarif_n:number;ina_n:number;los_n:number}[];cohort_limit:number;minimum_cohort:number}
const obj=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const count=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0
const metric=(x:unknown)=>x===null||(typeof x==='number'&&Number.isFinite(x))
export function parseClinicalCostLinkage(x:unknown,importId:string):ClinicalCostLinkage {
 if(!obj(x)||x.import_id!==importId||x.method!=='mrn_normalized_admission_discharge_unique_candidate_v1'||!count(x.episodes)||x.minimum_cohort!==5||x.cohort_limit!==100||!Array.isArray(x.states)||!x.states.every(s=>obj(s)&&CLINICAL_LINK_STATES.some(([k])=>k===s.state)&&count(s.count))||!Array.isArray(x.cohorts)||x.cohorts.length>100||!x.cohorts.every(c=>obj(c)&&typeof c.template_code==='string'&&typeof c.inacbg_code==='string'&&typeof c.class_code==='string'&&count(c.n)&&c.n>=5&&[c.mean_tarif_rs,c.mean_tariff_inacbg,c.mean_gap,c.mean_los].every(metric)&&[c.tarif_n,c.ina_n,c.los_n].every(v=>count(v)&&v<=Number(c.n))))throw new Error('Ringkasan keterkaitan klinis dan biaya tidak sesuai kontrak sumber.')
 const d=x as ClinicalCostLinkage
 if(new Set(d.states.map(s=>s.state)).size!==d.states.length||d.states.reduce((n,s)=>n+s.count,0)!==d.episodes||d.cohorts.reduce((n,c)=>n+c.n,0)>(d.states.find(s=>s.state==='unique_validated_candidate')?.count??0))throw new Error('Jumlah kandidat tidak konsisten.')
 return d
}
