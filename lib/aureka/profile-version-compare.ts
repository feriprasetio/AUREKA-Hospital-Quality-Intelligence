// A read-only comparison of versions already returned by the authorized catalog query.
export type VersionRecord=Record<string,unknown>
const identity=(row:VersionRecord)=>typeof row.code==='string'&&row.code.length>0&&Number.isSafeInteger(Number(row.room_id))&&Number(row.room_id)>0&&Number.isSafeInteger(Number(row.profile_year))&&Number(row.profile_year)>=1900?JSON.stringify([row.code,Number(row.room_id),Number(row.profile_year)]):null
const versionNumber=(row:VersionRecord)=>typeof row.version==='number'&&Number.isSafeInteger(row.version)&&row.version>0?row.version:null
export function resolveProfileVersions<T extends VersionRecord>(rows:readonly T[],anchor:T){
 const key=identity(anchor)
 if(!key||typeof anchor.id!=='string'||!rows.some(row=>row.id===anchor.id&&identity(row)===key))return {rows:[] as T[],ambiguous:false}
 const matching=rows.filter(row=>identity(row)===key)
 const numbers=matching.map(versionNumber)
 const ids=matching.map(row=>row.id)
 if(numbers.some(n=>n===null)||new Set(numbers).size!==numbers.length||ids.some(id=>typeof id!=='string'||!id)||new Set(ids).size!==ids.length)return {rows:[] as T[],ambiguous:true}
 return {rows:[...matching].sort((a,b)=>Number(b.version)-Number(a.version)),ambiguous:false}
}
function canonical(value:unknown):string{
 if(Array.isArray(value))return '['+value.map(canonical).join(',')+']'
 if(value&&typeof value==='object')return '{'+Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+canonical(v)).join(',')+'}'
 return JSON.stringify(value)??'undefined'
}
const field=(row:VersionRecord,key:string)=>row[key]
const schema=(row:VersionRecord,key:string)=>row.schema_json&&typeof row.schema_json==='object'?(row.schema_json as Record<string,unknown>)[key]:undefined
const printable=(v:unknown)=>v==null||v===''?'Belum tercatat':typeof v==='string'||typeof v==='number'||typeof v==='boolean'?String(v):'Metadata terstruktur'
const fields:Array<[string,(row:VersionRecord)=>unknown]>=[
 ['Nama indikator',r=>field(r,'title')],['Program',r=>field(r,'indicator_type')],['Kategori',r=>field(r,'category')],['Satuan',r=>field(r,'unit_of_measure')],
 ['Target',r=>field(r,'target_text')],['Operator target',r=>field(r,'target_operator')],['Nilai target',r=>field(r,'target_value')],
 ['Definisi pembilang',r=>field(r,'numerator_definition')],['Definisi penyebut',r=>field(r,'denominator_definition')],['Grain pengukuran',r=>field(r,'measurement_grain')],
 ['Metode pengukuran',r=>schema(r,'measurement_type')],['Arah indikator',r=>schema(r,'indicator_direction')],['Status target',r=>schema(r,'target_status')],['Dasar target',r=>schema(r,'target_basis')],
 ['Status versi saat ini',r=>field(r,'status')],['Aktif saat ini',r=>field(r,'is_active')]
]
export function compareProfileVersions(before:VersionRecord,after:VersionRecord){
 if(!identity(before)||identity(before)!==identity(after)||before.id===after.id||versionNumber(before)===null||versionNumber(after)===null||before.version===after.version)return null
 const result=fields.map(([label,read])=>{const a=read(before),b=read(after);return {label,before:printable(a),after:printable(b),changed:canonical(a)!==canonical(b)}})
 for(const [key,label] of [['schema_json','Konfigurasi pengukuran (JSON)'],['options_json','Pilihan respons (JSON)']]){
  const a=before[key],b=after[key],describe=(v:unknown)=>v==null?'Belum tercatat':Array.isArray(v)?v.length+' pilihan':'Metadata tersimpan'
  result.push({label,before:describe(a),after:describe(b),changed:canonical(a)!==canonical(b)})
 }
 return result
}
