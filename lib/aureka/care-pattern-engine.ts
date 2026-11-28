export type CarePattern = {
  allowed: true; year: number; scope_room_id: number|null; includes_ready: boolean; named_allowed:boolean;
  records:number; ready_records:number; visit_source_records:number; visit_classified:number;
  discharge_source_records:number; discharge_dated:number; discharge_timed:number; attributed_records:number|null;
  visit_categories:{label:string;count:number}[]; discharge_days:{day:number;count:number}[]; discharge_hours:{hour:number;count:number}[];
  doctors:{staff_id:string;name:string;visite_n:number|null;discharge_n:number|null;clock_n:number|null;visit_regular:number|null;visit_late:number|null}[];
}
const count=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0
const nullable=(x:unknown)=>x===null||count(x)
const record=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x)
export function parseCarePattern(x:unknown,scope:{year:number;room:number|null;ready:boolean}):CarePattern{
  const keys=['records','ready_records','visit_source_records','visit_classified','discharge_source_records','discharge_dated','discharge_timed']
  if(!record(x)||x.allowed!==true||x.year!==scope.year||x.scope_room_id!==scope.room||x.includes_ready!==scope.ready||typeof x.named_allowed!=='boolean'||!keys.every(k=>count(x[k]))||!nullable(x.attributed_records))throw new Error('Ringkasan pola perawatan tidak sesuai cakupan.')
  if(!Array.isArray(x.visit_categories)||!x.visit_categories.every(r=>record(r)&&typeof r.label==='string'&&count(r.count))||
     !Array.isArray(x.discharge_days)||!x.discharge_days.every(r=>record(r)&&count(r.day)&&r.day>=1&&r.day<=7&&count(r.count))||
     !Array.isArray(x.discharge_hours)||!x.discharge_hours.every(r=>record(r)&&count(r.hour)&&r.hour<=23&&count(r.count))||
     !Array.isArray(x.doctors)||!x.doctors.every(r=>record(r)&&typeof r.staff_id==='string'&&typeof r.name==='string'&&['visite_n','discharge_n','clock_n','visit_regular','visit_late'].every(k=>nullable(r[k]))))throw new Error('Rincian pola perawatan belum lengkap.')
  const d=x as CarePattern
  const sum=(rows:{count:number}[])=>rows.reduce((n,r)=>n+r.count,0)
  if(d.ready_records>d.records||(!scope.ready&&d.ready_records!==0)||d.visit_source_records>d.records||d.visit_classified>d.visit_source_records||d.discharge_source_records>d.records||d.discharge_dated>d.discharge_source_records||d.discharge_timed>d.discharge_dated||sum(d.visit_categories)!==d.visit_classified||sum(d.discharge_days)!==d.discharge_dated||sum(d.discharge_hours)!==d.discharge_timed||(!d.named_allowed&&(d.doctors.length>0||d.attributed_records!==null)))throw new Error('Jumlah observasi pola perawatan tidak konsisten.')
  // The SQL contract groups once per bucket and per canonical DPJP. Reject
  // duplicates and inconsistent suppressed counts instead of showing misleading data.
  const unique=(values:readonly (string|number)[])=>new Set(values).size===values.length
  const invalid=()=>{throw new Error('Jumlah observasi pola perawatan tidak konsisten.')}
  if(!unique(d.visit_categories.map(r=>r.label))||!unique(d.discharge_days.map(r=>r.day))||
     !unique(d.discharge_hours.map(r=>r.hour))||!unique(d.doctors.map(r=>r.staff_id)))invalid()
  if(d.named_allowed){
    if(d.attributed_records===null||d.attributed_records>d.records)invalid()
    let visits=0,discharges=0,clocks=0
    for(const row of d.doctors){
      const {visite_n:v,discharge_n:q,clock_n:c,visit_regular:r,visit_late:l}=row
      if(!row.staff_id.trim()||!row.name.trim()||
        (v===null&&q===null)||(v!==null&&v<5)||(q!==null&&q<5)||(c!==null&&c<5)||
        (v===null&&(r!==null||l!==null))||
        (v!==null&&(r===null||l===null||r+l>v))||
        (c!==null&&(q===null||c>q)))invalid()
      visits+=v??0;discharges+=q??0;clocks+=c??0
    }
    if(visits>d.visit_classified||discharges>d.discharge_dated||clocks>d.discharge_timed||
      visits>(d.attributed_records??0)||discharges>(d.attributed_records??0))invalid()
  }
  return d
}

// Only show doctors whose observation count meets the threshold in the active
// analysis. Qualification for discharge does not imply qualification for visits.
export function doctorsForCarePattern(data:CarePattern,mode:'visite'|'pemulangan'):CarePattern['doctors']{
  if(!data.named_allowed)return []
  return data.doctors.filter(row=>(mode==='visite'?row.visite_n:row.discharge_n)!==null)
}
