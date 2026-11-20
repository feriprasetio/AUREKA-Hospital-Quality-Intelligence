import type { AurekaRole } from '@/lib/aureka/module-registry'

export type AurekaNavigationStatus = 'available' | 'planned'
export type AurekaNavigationItem = {
  id: string
  label: string
  moduleId: string
  childId?: string
  status?: AurekaNavigationStatus
  note?: string
  requiredRoles?: readonly AurekaRole[]
}
export type AurekaSidebarDomain = {
  id: string
  label: string
  icon: string
  requiredRoles?: readonly AurekaRole[]
  items: readonly AurekaNavigationItem[]
}
const MANAGEMENT_ROLES: readonly AurekaRole[] = ['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR']
const EXECUTIVE_ROLES: readonly AurekaRole[] = ['ADMIN','PMKP','MANAGEMENT','KABID','DIREKTUR','DEWAN_PENGAWAS']
const PLANNED_NOTE = 'Disiapkan dalam arsitektur navigasi. Komponen operasional, sumber data, dan/atau backend belum dinyatakan aktif; menu tidak dapat dibuka sampai implementasi tervalidasi.'
/** Satu sumber konfigurasi untuk tujuh kelompok pemilik pekerjaan AUREKA. */
export const AUREKA_SIDEBAR_DOMAINS: readonly AurekaSidebarDomain[] = [
  { id: 'command_center', label: 'Dashboard', icon: 'home', items: [] },
  { id: 'patient_registry', label: 'Register Pasien', icon: 'patients', items: [
    { id: 'patient_overview', label: 'Ikhtisar Pasien', moduleId: 'patients', childId: 'overview' },
    { id: 'patient_directory', label: 'Direktori Pasien', moduleId: 'patients', childId: 'directory' },
    { id: 'patient_patterns', label: 'Pola Perawatan', moduleId: 'patients', childId: 'analysis' },
  ]},
  { id: 'clinical_performance', label: 'Peningkatan Kinerja Klinis', icon: 'clinical', items: [
    { id: 'realcost', label: 'Audit Realcost', moduleId: 'clinical', childId: 'audit-realcost', status: 'planned', note: PLANNED_NOTE, requiredRoles: MANAGEMENT_ROLES },
    { id: 'clinical_pathway', label: 'Audit Clinical Pathway', moduleId: 'clinical', childId: 'audit-pathway' },
    { id: 'clinical_death', label: 'Audit Klinis dan Kematian', moduleId: 'clinical', childId: 'audit-clinical-death' },
  ]},
  { id: 'pmkp_quality_safety', label: 'Peningkatan Mutu dan Keselamatan Pasien', icon: 'quality', items: [
    { id: 'secretariat', label: 'Sekretariat', moduleId: 'secretariat', childId: 'invitations' },
    { id: 'annual_program', label: 'Program Kerja Tahunan', moduleId: 'analytics', childId: 'programs' },
    { id: 'quality', label: 'Indikator Mutu', moduleId: 'quality', childId: 'quality-overview' },
    { id: 'safety', label: 'Keselamatan Pasien', moduleId: 'safety', childId: 'overview' },
    { id: 'risk', label: 'Manajemen Risiko', moduleId: 'risk', childId: 'overview' },
  ]},
  { id: 'hospital_management', label: 'Manajemen Rumah Sakit', icon: 'staff', items: [
    { id: 'spm', label: 'Standar Pelayanan Minimal', moduleId: 'quality', childId: 'spm' },
    { id: 'sop', label: 'Standar Prosedur Operasional', moduleId: 'settings', childId: 'sop', status: 'planned', note: PLANNED_NOTE, requiredRoles: MANAGEMENT_ROLES },
    { id: 'workforce', label: 'Tenaga Kerja', moduleId: 'staff', childId: 'directory' },
    { id: 'teams', label: 'Tim dan Penugasan', moduleId: 'staff', childId: 'team' },
    { id: 'oppe', label: 'OPPE', moduleId: 'staff', childId: 'oppe-fppe' },
    { id: 'fppe', label: 'FPPE', moduleId: 'staff', childId: 'fppe' },
    { id: 'training', label: 'In House Training', moduleId: 'staff', childId: 'in-house-training', status: 'planned', note: PLANNED_NOTE, requiredRoles: MANAGEMENT_ROLES },
    { id: 'student_orientation', label: 'Orientasi Mahasiswa', moduleId: 'staff', childId: 'student-orientation', status: 'planned', note: PLANNED_NOTE, requiredRoles: MANAGEMENT_ROLES },
  ]},
  { id: 'director_board', label: 'Direktur dan Dewan Pengawas', icon: 'analytics', requiredRoles: EXECUTIVE_ROLES, items: [
    { id: 'recommendations', label: 'Rekomendasi dan Rencana Tindak Lanjut', moduleId: 'analytics', childId: 'recommendations' },
  ]},
  { id: 'system_settings', label: 'Pengaturan', icon: 'settings', items: [
    { id: 'settings', label: 'Preferensi Akun dan Sistem', moduleId: 'settings', childId: 'profile' },
    { id: 'legal_assets', label: 'Legal dan Asset', moduleId: 'settings', childId: 'legal-assets', status: 'planned', note: PLANNED_NOTE, requiredRoles: MANAGEMENT_ROLES },
  ]},
]
