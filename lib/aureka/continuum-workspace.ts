// Arctic Continuum v2.0: presentation taxonomy, not a router or permission grant.
// Legacy layout resolver remains intact until each domain passes its acceptance gate.
export const CONTINUUM_ARCHETYPES = [
  'data-grid','analytics','executive','document','workflow','object-explorer','form',
  'audit-evaluation','event','action-inbox','intelligence','configuration',
  'reconciliation','matrix','presentation','public-portal',
] as const
export type ContinuumArchetype = typeof CONTINUUM_ARCHETYPES[number]
export type ContinuumWorkspace = Readonly<{ id:string; module:string; section:string; label:string; archetype:ContinuumArchetype }>
type Entry = readonly [string,string,string,ContinuumArchetype]
const entries: readonly Entry[] = [
  ['home','','Dashboard','executive'], ['insights','','Analitik Rumah Sakit','analytics'], ['nara','','NARA AI','intelligence'],
  ['patients','overview','Direktori Pasien · Ikhtisar','analytics'], ['patients','directory','Daftar Pasien','data-grid'],
  ['patients','patterns','Pola Perawatan','analytics'], ['patients','icd','ICD-10','analytics'], ['patients','los','Length of Stay','analytics'], ['patients','readmisi','Readmisi','analytics'],
  ['clinical','realcost','Audit Realcost','audit-evaluation'], ['clinical','audit-pathway','Audit Clinical Pathway','audit-evaluation'],
  ['clinical','pathway-manual','Clinical Pathway · Manual','document'], ['clinical','pathway-analysis','Analisis Clinical Pathway','analytics'],
  ['clinical','audit-clinical','Audit Klinis','audit-evaluation'], ['clinical','audit-death','Audit Kematian','audit-evaluation'], ['clinical','result-clinical-death','Hasil Audit Klinis dan Kematian','analytics'],
  ['quality','quality-overview','Indikator Mutu · Ikhtisar','analytics'], ['quality','audit-indicators','Form Logbook','data-grid'],
  ['quality','profile-indicators','Profil Indikator','data-grid'], ['quality','result-unit','Hasil Capaian · Unit','data-grid'],
  ['quality','result-category','Hasil Capaian · Kategori','data-grid'], ['quality','quality-reporting','Monitoring Pelaporan','data-grid'],
  ['quality','pic-performance','Kinerja PIC','data-grid'], ['quality','quality-reconciliation','Rekonsiliasi Indikator','reconciliation'],
  ['quality','spm','Standar Pelayanan Minimal','data-grid'], ['quality','sop','Standar Prosedur Operasional','data-grid'],
  ['secretariat','register','Register Kegiatan','event'], ['secretariat','invitations','Undangan PIC','action-inbox'],
  ['safety','overview','Keselamatan Pasien · Ikhtisar','analytics'], ['safety','incidents','Register Insiden','data-grid'],
  ['safety','investigation','Investigasi Insiden','workflow'], ['safety','fmea-reactive','FMEA Reaktif','data-grid'],
  ['safety','survey','Survei Budaya Keselamatan','form'], ['safety','responses','Respons Survei','data-grid'],
  ['risk','overview','Manajemen Risiko · Ikhtisar','analytics'], ['risk','register','Register Risiko','data-grid'],
  ['risk','mitigation','Mitigasi Risiko','data-grid'], ['risk','connections','Koneksi Risiko','object-explorer'],
  ['risk','fmea','FMEA Preventif','data-grid'], ['risk','fmea-overview','FMEA · Ikhtisar','analytics'],
  ['risk','profile','Profil Risiko','matrix'], ['risk','evaluation','Evaluasi Kontrol','data-grid'],
  ['analytics','programs','Program Kerja','data-grid'], ['analytics','priorities','Area Prioritas','data-grid'],
  ['analytics','proposals','Usulan Indikator','form'], ['analytics','timeline','Timeline Program','workflow'],
  ['analytics','recommendations','Rekomendasi dan RTL','data-grid'],
  ['staff','directory','Direktori Tenaga Kerja','data-grid'], ['staff','team','Tim dan Penugasan','data-grid'],
  ['staff','oppe-fppe','OPPE','audit-evaluation'], ['staff','fppe','FPPE','audit-evaluation'],
  ['staff','training','In House Training','event'], ['staff','student-orientation','Orientasi Mahasiswa','event'],
  ['settings','profile','Profil Pengguna','configuration'], ['settings','security','Keamanan Akun','configuration'],
  ['settings','users','Pengguna dan Role','data-grid'], ['settings','units','Unit Kerja','data-grid'],
  ['settings','appearance','Preferensi Tampilan','configuration'], ['settings','system','Konfigurasi Sistem','configuration'],
  ['settings','permissions','Hak Akses','data-grid'], ['settings','mydata','Data Saya','form'],
  ['settings','audit','Audit Log','data-grid'], ['settings','legal','Legal dan Publikasi','configuration'],
]
const catalog = new Map(entries.map(([module,section,label,archetype]) => {
  const id=module+':'+section
  return [id,Object.freeze({id,module,section,label,archetype})] as const
}))
export function resolveContinuumWorkspace(module:string,section:string): ContinuumWorkspace|null {
  return catalog.get(module+':'+section)??null
}
export const WORKSPACE_PIN_LIMIT = 6
// Pins contain only static, allowlisted destination IDs; no record IDs, search, drafts or filters.
export function pinContinuumWorkspace(pins:readonly string[],id:string):string[] {
  const safe=Array.from(new Set(pins.filter(key=>catalog.has(key)))).slice(0,WORKSPACE_PIN_LIMIT)
  if(!catalog.has(id)||safe.includes(id)||safe.length>=WORKSPACE_PIN_LIMIT)return safe
  return [...safe,id]
}
export function resolveContinuumPin(id:string):ContinuumWorkspace|null {
  return catalog.get(id)??null
}
