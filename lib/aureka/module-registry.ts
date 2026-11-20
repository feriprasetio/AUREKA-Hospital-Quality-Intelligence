export type SecretariatSection = 'register' | 'invitations'

export type AurekaRole =
  | 'ADMIN' | 'PMKP' | 'MANAGEMENT' | 'KABID' | 'DIREKTUR'
  | 'DEWAN_PENGAWAS' | 'PIC' | 'VALIDATOR'

export type ModuleStatus = 'available' | 'beta' | 'maintenance' | 'planned'
export type AurekaCategoryId = 'command_center' | 'patient_registry' | 'clinical_performance' | 'quality_patient_safety' | 'hospital_management' | 'education_training' | 'director_supervisory_board' | 'settings'
export type ModuleVisibility = 'all-authenticated' | 'management-only'
export type AurekaModule = {
  id: 'home' | 'nara' | 'patients' | 'quality' | 'clinical' | 'safety' | 'risk' | 'insights' | 'analytics' | 'secretariat' | 'staff' | 'settings'
  label: string
  group: AurekaCategoryId
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
  { id:'home', label:'Dashboard', group:'command_center', status:'available', visibility:'all-authenticated', requiredRoles:ALL_ROLES, routeHash:'#beranda', owner:'Komite PMKP', lastReviewed:'2026-11-15', description:'Landing page personal, shortcut, tugas, dan notifikasi sesuai kewenangan.' },
  { id:'nara', label:'NARA AI', group:'command_center', status:'available', visibility:'all-authenticated', requiredRoles:ALL_ROLES, routeHash:'#nara-ai', owner:'Komite PMKP / AUREKA Intelligence', lastReviewed:'2026-11-15', description:'Asisten kecerdasan rumah sakit dengan lima provider AI melalui gateway terautentikasi dan konteks data agregat.' },
  { id:'patients', label:'Register Pasien', group:'patient_registry', status:'beta', visibility:'all-authenticated', requiredRoles:CLINICAL_ACCESS_ROLES, routeHash:'#pasien', owner:'Unit pelayanan / Komite PMKP', lastReviewed:'2026-11-20', description:'Direktori pasien dan Pola Perawatan (ICD-10, LOS, readmisi) dengan penelusuran relasi lintas pelayanan sesuai hak akses.' },
  { id:'quality', label:'Indikator Mutu', group:'quality_patient_safety', status:'beta', visibility:'all-authenticated', requiredRoles:QUALITY_ACCESS_ROLES, routeHash:'#indikator-mutu', owner:'Komite PMKP / pemilik indikator', lastReviewed:'2026-11-12', description:'Form logbook dan profil indikator untuk pelaksana; hasil capaian agregat baca-saja untuk Dewan Pengawas.' },
  { id:'clinical', label:'Peningkatan Kinerja Klinis', group:'clinical_performance', status:'beta', visibility:'all-authenticated', requiredRoles:CLINICAL_ACCESS_ROLES, routeHash:'#peningkatan-kinerja-klinis', owner:'Komite PMKP / Komite Medik', lastReviewed:'2026-11-12', description:'Audit Clinical Pathway serta Audit Klinis dan Kematian berbasis episode.' },
  { id:'safety', label:'Keselamatan Pasien', group:'quality_patient_safety', status:'beta', visibility:'all-authenticated', requiredRoles:['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','PIC'], routeHash:'#keselamatan-pasien', owner:'Komite PMKP / Tim Keselamatan Pasien', lastReviewed:'2026-11-12', description:'Register insiden, investigasi/RCA, dan survei budaya keselamatan bernama.' },
  { id:'risk', label:'Manajemen Risiko', group:'quality_patient_safety', status:'beta', visibility:'all-authenticated', requiredRoles:GOVERNANCE_ROLES, routeHash:'#manajemen-risiko', owner:'Komite PMKP / Manajemen Risiko Rumah Sakit', lastReviewed:'2026-11-12', description:'Risk Register, konektor, profil risiko, FMEA, RTP, dan evaluasi efektivitas kontrol.' },
  { id:'insights', label:'Visual Intelligence', group:'command_center', status:'available', visibility:'all-authenticated', requiredRoles:['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC','VALIDATOR'], routeHash:'#beranda', owner:'Komite PMKP / Manajemen', lastReviewed:'2026-11-21', description:'Analitik dan infografis lintas domain yang terintegrasi pada Dashboard; bukan tujuan navigasi mandiri.' },
  { id:'analytics', label:'Program & RTL', group:'quality_patient_safety', status:'beta', visibility:'all-authenticated', requiredRoles:['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS','PIC','VALIDATOR'], routeHash:'#program', owner:'Komite PMKP / Manajemen', lastReviewed:'2026-11-18', description:'Pemilik area prioritas, usulan indikator, rekomendasi, rencana tindak lanjut, progres, dan evaluasi.' },
  { id:'secretariat', label:'Sekretariat', group:'quality_patient_safety', status:'planned', visibility:'all-authenticated', requiredRoles:GOVERNANCE_ROLES, routeHash:'#sekretariat', owner:'Komite Peningkatan Mutu dan Keselamatan Pasien', lastReviewed:'2026-11-19', description:'Administrasi kegiatan: register kegiatan, nomor surat, dan pengiriman undangan kepada PIC unit. Detail UMANG (Undangan, Materi, Absensi Digital, Notulensi, dan Gambar) melekat pada masing-masing kegiatan melalui satu Meeting ID. Penyimpanan backend belum diaktifkan.' },
  { id:'staff', label:'Sumber Daya Manusia', group:'hospital_management', status:'beta', visibility:'all-authenticated', requiredRoles:CLINICAL_ACCESS_ROLES, routeHash:'#sumber-daya-manusia', owner:'Super Admin / Komite PMKP', lastReviewed:'2026-11-12', description:'Master tenaga kerja, tim dan penugasan, OPPE, FPPE, serta riwayat jabatan.' },
  { id:'settings', label:'Pengaturan', group:'settings', status:'beta', visibility:'all-authenticated', requiredRoles:ALL_ROLES, routeHash:'#pengaturan', owner:'Super Admin / Komite PMKP', lastReviewed:'2026-11-12', description:'Profil/akun, pengguna dan role, unit, keamanan, preferensi, konfigurasi, dan audit log.' },
] as const satisfies readonly AurekaModule[]

export type AurekaNavigationItem = {
  id: string
  label: string
  moduleId: AurekaModule['id']
  childId?: string
  status?: 'available' | 'planned'
  note?: string
  requiredRoles?: readonly AurekaRole[]
}
export type AurekaNavigationGroup = {
  id: AurekaCategoryId
  label: string
  icon: string
  requiredRoles?: readonly AurekaRole[]
  items: readonly AurekaNavigationItem[]
}

/**
 * One source of truth for the global seven-category navigation.
 * The sidebar renders categories only; the selected category reveals its modules.
 * Module tabs/sub-tabs are owned by each module's contextual navigation.
 */
/**
 * Canonical eight-category navigation, following Aureka Navigasi.docx.
 * Sidebar entries are MODULES only. Tabs/subtabs are rendered by each module workspace.
 * A module may route to an existing workspace section through moduleId + childId.
 */
export const AUREKA_NAVIGATION_GROUPS: readonly AurekaNavigationGroup[] = [
  // Susunan kategori dan modul mengikuti Aureka Navigasi.docx. Tab dan subtab
  // ditangani oleh workspace masing-masing, bukan dijadikan pohon ketiga di sidebar.
  { id:'command_center', label:'Dashboard', icon:'home', items:[
    { id:'dashboard', label:'Dashboard', moduleId:'home', childId:'overview' },
  ]},
  { id:'patient_registry', label:'Register Pasien', icon:'patients', items:[
    { id:'patient_directory', label:'Direktori Pasien', moduleId:'patients', childId:'overview' },
    { id:'patient_patterns', label:'Pola Perawatan', moduleId:'patients', childId:'analysis' },
  ]},
  { id:'clinical_performance', label:'Peningkatan Kinerja Klinis', icon:'clinical', items:[
    { id:'realcost_audit', label:'Audit Realcost', moduleId:'clinical', childId:'realcost', status:'available', requiredRoles:['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS'] },
    { id:'clinical_pathway', label:'Audit Clinical Pathway', moduleId:'clinical', childId:'audit-pathway' },
    { id:'clinical_audit_death', label:'Audit Klinis dan Kematian', moduleId:'clinical', childId:'audit-clinical' },
  ]},
  { id:'quality_patient_safety', label:'Peningkatan Mutu dan Keselamatan Pasien', icon:'quality', items:[
    { id:'secretariat', label:'Sekretariat', moduleId:'secretariat', childId:'register', status:'active', note:'Register dokumen, administrasi kegiatan, dan lima kategori berkas UMANG dalam satu Meeting ID.' },
    { id:'annual_program', label:'Program Kerja Tahunan', moduleId:'analytics', childId:'programs' },
    { id:'quality_indicators', label:'Indikator Mutu', moduleId:'quality', childId:'quality-overview' },
    { id:'patient_safety', label:'Keselamatan Pasien', moduleId:'safety', childId:'overview' },
    { id:'risk_management', label:'Manajemen Risiko', moduleId:'risk', childId:'register' },
  ]},
  { id:'hospital_management', label:'Manajemen Rumah Sakit', icon:'staff', items:[
    { id:'quality_development', label:'Pengembangan dan Pengendalian Mutu', moduleId:'quality', childId:'spm' },
    { id:'human_resources', label:'Sumber Daya Manusia', moduleId:'staff', childId:'directory' },
  ]},
  { id:'education_training', label:'Pendidikan dan Pelatihan', icon:'education', items:[
    { id:'in_house_training', label:'In House Training', moduleId:'staff', childId:'training', status:'planned', note:'Register IHT, dokumentasi pelatihan, dan penerbitan sertifikat PDF belum memiliki workspace aktif.' },
    { id:'student_orientation', label:'Orientasi Mahasiswa', moduleId:'staff', childId:'student-orientation', status:'planned', note:'Integrasi daftar mahasiswa dari Tim Koordinasi Pendidikan dan penerbitan sertifikat PDF belum tersedia.' },
  ]},
  { id:'director_supervisory_board', label:'Direktur dan Dewan Pengawas', icon:'analytics', items:[
    { id:'recommendations', label:'Rekomendasi dan Rencana Tindak Lanjut', moduleId:'analytics', childId:'recommendations' },
  ]},
  { id:'settings', label:'Pengaturan', icon:'settings', items:[
    { id:'account_preferences', label:'Preferensi Akun', moduleId:'settings', childId:'profile' },
    { id:'system_preferences', label:'Preferensi Sistem', moduleId:'settings', childId:'appearance' },
  ]},
] as const

export type AurekaModuleId = (typeof AUREKA_MODULE_REGISTRY)[number]['id']
export const AUREKA_PRIMARY_NAV: readonly AurekaModule[] = AUREKA_MODULE_REGISTRY.filter((module) => module.id !== 'home')

export const AUREKA_QUALITY_FEATURES = [
  { id:'imut', parent:'quality', title:'Audit Indikator Mutu', status:'beta', icon:'▥', summary:'Input, review, dan pantau indikator mutu nasional, rumah sakit, dan unit kerja.', description:'Logbook unit dengan master indikator dan pemeriksaan kelengkapan sebelum review.' },
  { id:'cp', parent:'clinical', title:'Audit Clinical Pathway', status:'beta', icon:'↗', summary:'Audit per episode pasien, checklist lintas PPA, dan penghitungan kepatuhan.', description:'Audit per episode dengan komponen PPA, inklusi, pengecualian, dan bukti.' },
  { id:'akk', parent:'clinical', title:'Audit Klinis dan Kematian', status:'beta', icon:'＋', summary:'Telaah klinis terstruktur, pembelajaran, rekomendasi, dan tindak lanjut.', description:'Telaah berbasis episode dan bukti rekam medis dengan tindak lanjut yang dapat ditelusuri.' },
] as const
