export const IMPROVEMENT_SOURCE_TYPES = [
 ['indicator','Indikator mutu','#indikator-mutu/profil-indikator'],
 ['incident','Register insiden','#keselamatan-pasien/incidents'],
 ['investigation','Investigasi / RCA','#keselamatan-pasien/investigation'],
 ['risk','Risk Register','#manajemen-risiko/register'],
 ['fmea','FMEA','#manajemen-risiko/fmea'],
 ['mitigation','Rencana pengendalian risiko (RTP)','#manajemen-risiko/mitigation'],
 ['pathway','Clinical Pathway','#peningkatan-kinerja-klinis/clinical-pathway/hasil-capaian'],
 ['clinical_audit','Audit klinis / kematian','#peningkatan-kinerja-klinis/audit-klinis-dan-kematian/hasil-capaian'],
 ['priority','Area prioritas','#sekretariat/program-kerja/area-prioritas'],
 ['annual_activity','Program tahunan','#sekretariat/program-kerja/timeline'],
 ['meeting','Register kegiatan / rapat','#sekretariat'],
 ['education','Pendidikan dan pelatihan','#sumber-daya-manusia/in-house-training'],
 ['sop','Standar prosedur operasional','#indikator-mutu/spo'],
] as const
export type SourceKind=typeof IMPROVEMENT_SOURCE_TYPES[number][0]
export type ImprovementSource={source_id:string;label:string;source_status:string|null;room_id:number|null;source_date?:string|null}
export type ImprovementLink=ImprovementSource&{source_kind:SourceKind;linked_at:string}
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
const isObject=(x:unknown):x is Record<string,unknown>=>x!==null&&typeof x==='object'&&!Array.isArray(x)
const source=(x:unknown):x is ImprovementSource=>isObject(x)&&uuid(x.source_id)&&typeof x.label==='string'&&(typeof x.source_status==='string'||x.source_status===null)&&(x.room_id===null||(typeof x.room_id==='number'&&Number.isSafeInteger(x.room_id)&&x.room_id>0))
export const sourceMeta=(kind:string)=>IMPROVEMENT_SOURCE_TYPES.find(x=>x[0]===kind)
export function parseImprovementSources(value:unknown):ImprovementSource[]{
 if(!Array.isArray(value)||!value.every(source)||new Set(value.map(x=>x.source_id)).size!==value.length)throw new Error('Daftar sumber tidak lengkap atau tidak konsisten.')
 return value
}
export function parseImprovementLinks(value:unknown):ImprovementLink[]{
 if(!Array.isArray(value)||!value.every(x=>source(x)&&isObject(x)&&typeof x.source_kind==='string'&&!!sourceMeta(x.source_kind)&&typeof x.linked_at==='string'))throw new Error('Relasi sumber tidak lengkap.')
 if(new Set(value.map(x=>x.source_kind+':'+x.source_id)).size!==value.length)throw new Error('Relasi sumber ganda.')
 return value as ImprovementLink[]
}
export type StaffEducationRow={participant_id:string;event_id:string;title:string;event_type:string;start_at:string|null;participant_status:string;present_sessions:number;recorded_sessions:number;valid_certificates:number}
const count=(x:unknown):x is number=>typeof x==='number'&&Number.isSafeInteger(x)&&x>=0
export function parseStaffEducation(value:unknown,staffId:string):StaffEducationRow[]{
 if(!isObject(value)||value.staff_id!==staffId||!Array.isArray(value.rows)||!value.rows.every(x=>isObject(x)&&uuid(x.participant_id)&&uuid(x.event_id)&&typeof x.title==='string'&&typeof x.event_type==='string'&&typeof x.participant_status==='string'&&(x.start_at===null||typeof x.start_at==='string')&&count(x.present_sessions)&&count(x.recorded_sessions)&&x.present_sessions<=x.recorded_sessions&&count(x.valid_certificates)))throw new Error('Riwayat pendidikan tidak lengkap atau tidak sesuai identitas.')
 return value.rows as StaffEducationRow[]
}
