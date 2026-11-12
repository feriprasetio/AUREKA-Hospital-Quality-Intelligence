export type AurekaRole =
  | 'ADMIN' | 'PMKP' | 'MANAGEMENT' | 'KABID' | 'DIREKTUR'
  | 'DEWAN_PENGAWAS' | 'PIC' | 'VALIDATOR'

export type ModuleStatus = 'available' | 'beta' | 'maintenance' | 'planned'
export type ModuleVisibility = 'all-authenticated' | 'management-only'
export type AurekaModule = {
  id: 'home' | 'patients' | 'quality' | 'safety' | 'risk' | 'clinical' | 'analytics' | 'regulations' | 'staff' | 'settings'
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
const CLINICAL_ROLES = ['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','PIC','VALIDATOR'] as const
const GOVERNANCE_ROLES = ['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC'] as const
const REGULATION_ROLES = ['ADMIN','PMKP','MANAGEMENT','DIREKTUR'] as const

/**
 * Blueprint Arsitektur Final v2 — Table 1.
 * Urutan array ini adalah urutan menu induk pada workspace.
 * Halaman Utama dirender sebagai root khusus; item lain dirender dari PRIMARY_NAV.
 */
export const AUREKA_MODULE_REGISTRY = [
  { id:'home', label:'Halaman Utama', group:'overview', status:'available', visibility:'all-authenticated', requiredRoles:ALL_ROLES, routeHash:'#halaman-utama', owner:'Komite PMKP', lastReviewed:'2026-11-12', description:'Beranda sebagai landing page dan Infografis sebagai ringkasan visual baca-saja.' },
  { id:'patients', label:'Pasien', group:'overview', status:'beta', visibility:'all-authenticated', requiredRoles:CLINICAL_ROLES, routeHash:'#pasien', owner:'Unit pelayanan / Komite PMKP', lastReviewed:'2026-11-12', description:'Register Pasien, Statistik, dan Metadata Pasien berbasis Nomor Rekam Medis.' },
  { id:'quality', label:'Indikator Mutu', group:'clinical', status:'beta', visibility:'all-authenticated', requiredRoles:CLINICAL_ROLES, routeHash:'#indikator-mutu', owner:'Komite PMKP / pemilik indikator', lastReviewed:'2026-11-12', description:'Form Logbook, Hasil Capaian, dan Profil Indikator.' },
  { id:'safety', label:'Keselamatan Pasien', group:'clinical', status:'beta', visibility:'all-authenticated', requiredRoles:CLINICAL_ROLES, routeHash:'#keselamatan-pasien', owner:'Komite PMKP / Tim Keselamatan Pasien', lastReviewed:'2026-11-12', description:'Insiden (Register dan Investigasi) serta Budaya (Survei Tahunan bernama).' },
  { id:'risk', label:'Manajemen Risiko', group:'governance', status:'beta', visibility:'all-authenticated', requiredRoles:GOVERNANCE_ROLES, routeHash:'#manajemen-risiko', owner:'Manajemen risiko rumah sakit', lastReviewed:'2026-11-12', description:'Risk Register, FMEA, Mitigasi/RTP, dan Evaluasi Keberhasilan Tindak Pengendalian.' },
  { id:'clinical', label:'Peningkatan Kinerja Klinis', group:'clinical', status:'beta', visibility:'all-authenticated', requiredRoles:CLINICAL_ROLES, routeHash:'#peningkatan-kinerja-klinis', owner:'Komite PMKP / Komite Medik', lastReviewed:'2026-11-12', description:'Audit Clinical Pathway dan Audit Klinis dan Kematian berbasis episode pasien.' },
  { id:'analytics', label:'Program', group:'governance', status:'beta', visibility:'all-authenticated', requiredRoles:['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC','VALIDATOR'], routeHash:'#program', owner:'Komite PMKP / Manajemen', lastReviewed:'2026-11-12', description:'Program Kerja Tahunan, Rekomendasi Ketua PMKP, dan Rencana Tindak Lanjut.' },
  { id:'regulations', label:'Regulasi', group:'governance', status:'planned', visibility:'all-authenticated', requiredRoles:REGULATION_ROLES, routeHash:'#regulasi', owner:'Direktur / Tata Usaha / pemilik dokumen', lastReviewed:'2026-11-12', description:'E-Regulasi, versioning dokumen, persetujuan elektronik, distribusi, dan audit trail; engine belum tersedia.' },
  { id:'staff', label:'Sumber Daya Manusia', group:'governance', status:'beta', visibility:'all-authenticated', requiredRoles:CLINICAL_ROLES, routeHash:'#sumber-daya-manusia', owner:'Super Admin / Komite PMKP', lastReviewed:'2026-11-12', description:'Daftar Tenaga Kerja, Tim dan Penugasan, OPPE, dan FPPE.' },
  { id:'settings', label:'Pengaturan', group:'governance', status:'beta', visibility:'all-authenticated', requiredRoles:ALL_ROLES, routeHash:'#pengaturan', owner:'Super Admin / Komite PMKP', lastReviewed:'2026-11-12', description:'Profil/Akun, Pengguna dan Role, Unit dan Instalasi, Keamanan, Preferensi Tampilan, Konfigurasi Sistem, dan Audit Log.' },
] as const satisfies readonly AurekaModule[]

export type AurekaModuleId = (typeof AUREKA_MODULE_REGISTRY)[number]['id']
export const AUREKA_PRIMARY_NAV: readonly AurekaModule[] = AUREKA_MODULE_REGISTRY.filter((module) => module.id !== 'home')

export const AUREKA_QUALITY_FEATURES = [
  { id:'imut', parent:'quality', title:'Audit Indikator Mutu', status:'beta', icon:'▥', summary:'Input, review, dan pantau indikator mutu nasional, rumah sakit, dan unit kerja.', description:'Logbook unit dengan master indikator dan pemeriksaan kelengkapan sebelum review.' },
  { id:'cp', parent:'clinical', title:'Audit Clinical Pathway', status:'beta', icon:'↗', summary:'Audit per episode pasien, checklist lintas PPA, dan penghitungan kepatuhan.', description:'Audit per episode dengan komponen PPA, inklusi, pengecualian, dan bukti.' },
  { id:'akk', parent:'clinical', title:'Audit Klinis dan Kematian', status:'beta', icon:'＋', summary:'Telaah klinis terstruktur, pembelajaran, rekomendasi, dan tindak lanjut.', description:'Telaah berbasis episode dan bukti rekam medis dengan tindak lanjut yang dapat ditelusuri.' },
] as const
