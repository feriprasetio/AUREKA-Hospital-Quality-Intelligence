import {resolveContinuumWorkspace,type ContinuumWorkspace} from './continuum-workspace.ts'
export type SkillManifest={id:string;version:number;ownerCategory:string;title:string;module:string;section:string;effect:'read-only';input:string;source:string;output:string;steps:readonly string[];entry:string}
export const CONTINUUM_SKILLS:readonly SkillManifest[]=[
 {id:'reconciliation-preview',version:1,ownerCategory:'quality_patient_safety',title:'Tinjauan pra-rekonsiliasi',module:'quality',section:'quality-reconciliation',effect:'read-only',input:'Antrean resmi, tahun dan unit terpilih',source:'quality_reconciliation_list_v2',output:'Draf agregat kelompok dan kelayakan kandidat',steps:['Muat antrean terotorisasi','Validasi jumlah kelompok','Review dan ekspor draf'],entry:'Buka Skill · Tinjauan pra-rekonsiliasi. Eksekusi perubahan tetap pada alur per kelompok.'},
 {id:'monthly-quality-coverage',version:1,ownerCategory:'quality_patient_safety',title:'Rekap mutu bulanan',module:'quality',section:'result-unit',effect:'read-only',input:'Unit, tahun dan bulan',source:'Agregat bulanan mesin capaian indikator tervalidasi',output:'Draf kelengkapan hasil bulanan HTML/CSV',steps:['Pilih periode','Hitung kelengkapan profil dari hasil existing','Tinjau dan ekspor draf'],entry:'Buka Briefing mutu · laporan tervalidasi, lalu pilih bulan pada Rekap mutu bulanan.'},
 {id:'risk-register-review',version:1,ownerCategory:'quality_patient_safety',title:'Evaluasi risiko',module:'risk',section:'register',effect:'read-only',input:'Snapshot register risiko dan filter aktif',source:'Register risiko · matriks existing',output:'Draf hasil tinjauan dan laporan agregat HTML/CSV',steps:['Muat snapshot yang sah','Jalankan evaluasi deterministik','Periksa hasil dan susun laporan'],entry:'Pilih Evaluasi risiko pada register.'},
 {id:'validated-quality-briefing',version:1,ownerCategory:'quality_patient_safety',title:'Briefing mutu tervalidasi',module:'quality',section:'result-unit',effect:'read-only',input:'Unit dan tahun terpilih',source:'Profil aktif dan laporan tervalidasi · mesin capaian existing',output:'Draf briefing dan laporan agregat HTML/CSV',steps:['Pilih unit dan tahun','Susun draf dari hasil tervalidasi','Review dan ekspor laporan'],entry:'Buka Briefing mutu · laporan tervalidasi.'}
]
export function visibleContinuumSkills(categories:readonly string[],canOpen:(destination:ContinuumWorkspace)=>boolean){
 return CONTINUUM_SKILLS.flatMap(skill=>{
  const destination=resolveContinuumWorkspace(skill.module,skill.section)
  return categories.includes(skill.ownerCategory)&&destination&&canOpen(destination)?[{skill,destination}]:[]
 })
}
