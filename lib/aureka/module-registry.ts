export type AurekaRole =
  | 'ADMIN' | 'PMKP' | 'MANAGEMENT' | 'KABID' | 'DIREKTUR'
  | 'DEWAN_PENGAWAS' | 'PIC' | 'VALIDATOR'

export type ModuleStatus = 'available' | 'beta' | 'maintenance' | 'planned'
export type ModuleVisibility = 'all-authenticated' | 'management-only'
export type AurekaModule = {
  id: 'home' | 'patients' | 'quality' | 'clinical' | 'safety' | 'risk' | 'analytics' | 'staff' | 'settings'
  label: string
  group: 'overview' | 'clinical' | 'governance'
  status: ModuleStatus
  visibility: ModuleVisibility
  requiredRoles: readonly AurekaRole[]
  routeHash: string
  owner: string
  lastReviewed: string
  description: string
}

const ALL_ROLES = ['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC','VALIDATOR'] as const
const GOVERNANCE_ROLES = ['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC'] as const
const CLINICAL_ACCESS_ROLES = ['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','PIC','VALIDATOR'] as const
const QUALITY_ACCESS_ROLES = ['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC','VALIDATOR'] as const

export const AUREKA_MODULE_REGISTRY = [
  { id:'home', label:'Beranda', group:'overview', status:'available', visibility:'all-authenticated', requiredRoles:ALL_ROLES, routeHash:'#beranda', owner:'Komite PMKP', lastReviewed:'2026-11-12', description:'Landing page personal, shortcut, tugas, dan notifikasi sesuai kewenangan.' },
  { id:'patients', label:'Pasien', group:'overview', status:'beta', visibility:'all-authenticated', requiredRoles:CLINICAL_ACCESS_ROLES, routeHash:'#pasien', owner:'Unit pelayanan / Komite PMKP', lastReviewed:'2026-11-12', description:'Register episode pelayanan dan penelusuran identitas pasien berbasis Nomor Rekam Medis.' },
  { id:'quality', label:'Indikator Mutu', group:'clinical', status:'beta', visibility:'all-authenticated', requiredRoles:QUALITY_ACCESS_ROLES, routeHash:'#indikator-mutu', owner:'Komite PMKP / pemilik indikator', lastReviewed:'2026-11-12', description:'Form logbook dan profil indikator untuk pelaksana; hasil capaian agregat baca-saja untuk Dewan Pengawas.' },
  { id:'clinical', label:'Peningkatan Kinerja Klinis', group:'clinical', status:'beta', visibility:'all-authenticated', requiredRoles:CLINICAL_ACCESS_ROLES, routeHash:'#peningkatan-kinerja-klinis', owner:'Komite PMKP / Komite Medik', lastReviewed:'2026-11-12', description:'Audit Clinical Pathway serta Audit Klinis dan Kematian berbasis episode.' },
  { id:'safety', label:'Keselamatan Pasien', group:'clinical', status:'beta', visibility:'all-authenticated', requiredRoles:['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','PIC'], routeHash:'#keselamatan-pasien', owner:'Komite PMKP / Tim Keselamatan Pasien', lastReviewed:'2026-11-12', description:'Register insiden, investigasi/RCA, dan survei budaya keselamatan bernama.' },
  { id:'risk', label:'Manajemen Risiko', group:'governance', status:'beta', visibility:'all-authenticated', requiredRoles:GOVERNANCE_ROLES, routeHash:'#manajemen-risiko', owner:'Manajemen risiko rumah sakit', lastReviewed:'2026-11-12', description:'Risk Register, konektor, profil risiko, FMEA, RTP, dan evaluasi efektivitas kontrol.' },
  { id:'analytics', label:'Program', group:'governance', status:'beta', visibility:'all-authenticated', requiredRoles:['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC','VALIDATOR'], routeHash:'#program', owner:'Komite PMKP / Manajemen', lastReviewed:'2026-11-12', description:'Program kerja tahunan, rekomendasi, dan rencana tindak lanjut terintegrasi.' },
  { id:'staff', label:'Sumber Daya Manusia', group:'governance', status:'beta', visibility:'all-authenticated', requiredRoles:CLINICAL_ACCESS_ROLES, routeHash:'#sumber-daya-manusia', owner:'Super Admin / Komite PMKP', lastReviewed:'2026-11-12', description:'Master tenaga kerja, tim dan penugasan, OPPE, FPPE, serta riwayat jabatan.' },
  { id:'settings', label:'Pengaturan', group:'governance', status:'beta', visibility:'all-authenticated', requiredRoles:ALL_ROLES, routeHash:'#pengaturan', owner:'Super Admin / Komite PMKP', lastReviewed:'2026-11-12', description:'Profil/akun, pengguna dan role, unit, keamanan, preferensi, konfigurasi, dan audit log.' },
] as const satisfies readonly AurekaModule[]

export type AurekaModuleId = (typeof AUREKA_MODULE_REGISTRY)[number]['id']
export const AUREKA_PRIMARY_NAV: readonly AurekaModule[] = AUREKA_MODULE_REGISTRY.filter((module) => module.id !== 'home')

export const AUREKA_QUALITY_FEATURES = [
  { id:'imut', parent:'quality', title:'Audit Indikator Mutu', status:'beta', icon:'▥', summary:'Input, review, dan pantau indikator mutu nasional, rumah sakit, dan unit kerja.', description:'Logbook unit dengan master indikator dan pemeriksaan kelengkapan sebelum review.' },
  { id:'cp', parent:'clinical', title:'Audit Clinical Pathway', status:'beta', icon:'↗', summary:'Audit per episode pasien, checklist lintas PPA, dan penghitungan kepatuhan.', description:'Audit per episode dengan komponen PPA, inklusi, pengecualian, dan bukti.' },
  { id:'akk', parent:'clinical', title:'Audit Klinis dan Kematian', status:'beta', icon:'＋', summary:'Telaah klinis terstruktur, pembelajaran, rekomendasi, dan tindak lanjut.', description:'Telaah berbasis episode dan bukti rekam medis dengan tindak lanjut yang dapat ditelusuri.' },
] as const
