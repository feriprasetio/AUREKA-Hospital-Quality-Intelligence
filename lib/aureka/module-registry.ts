export type AurekaRole =
  | 'ADMIN'
  | 'PMKP'
  | 'MANAGEMENT'
  | 'KABID'
  | 'DIREKTUR'
  | 'DEWAN_PENGAWAS'
  | 'PIC'
  | 'VALIDATOR'

export type ModuleStatus = 'available' | 'beta' | 'maintenance' | 'planned'
export type ModuleVisibility = 'all-authenticated' | 'management-only'

export type AurekaModule = {
  id: 'home' | 'quality' | 'safety' | 'risk' | 'staff' | 'analytics' | 'settings'
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

export const AUREKA_MODULE_REGISTRY = [
  {
    id: 'home',
    label: 'Ringkasan',
    group: 'overview',
    status: 'beta',
    visibility: 'all-authenticated',
    requiredRoles: ['ADMIN', 'PMKP', 'MANAGEMENT', 'KABID', 'DIREKTUR', 'DEWAN_PENGAWAS', 'PIC', 'VALIDATOR'],
    routeHash: '#ringkasan',
    owner: 'Komite PMKP',
    lastReviewed: '2026-10-29',
    description: 'Dashboard operasional, antrean prioritas, dan status data sesuai hak akses.',
  },
  {
    id: 'quality',
    label: 'Mutu Klinis',
    group: 'clinical',
    status: 'beta',
    visibility: 'all-authenticated',
    requiredRoles: ['ADMIN', 'PMKP', 'MANAGEMENT', 'KABID', 'DIREKTUR', 'DEWAN_PENGAWAS', 'PIC', 'VALIDATOR'],
    routeHash: '#mutu-klinis',
    owner: 'Komite PMKP / pemilik indikator',
    lastReviewed: '2026-10-29',
    description: 'Audit Indikator Mutu, Clinical Pathway, dan Audit Klinis dan Kematian.',
  },
  {
    id: 'safety',
    label: 'Keselamatan Pasien',
    group: 'clinical',
    status: 'beta',
    visibility: 'all-authenticated',
    requiredRoles: ['ADMIN', 'PMKP', 'MANAGEMENT', 'KABID', 'DIREKTUR', 'DEWAN_PENGAWAS', 'PIC'],
    routeHash: '#keselamatan-pasien',
    owner: 'Komite PMKP / Tim Keselamatan Pasien',
    lastReviewed: '2026-10-29',
    description: 'Laporan insiden, investigasi, pembelajaran, dan tindak lanjut.',
  },
  {
    id: 'risk',
    label: 'Manajemen Risiko',
    group: 'governance',
    status: 'beta',
    visibility: 'all-authenticated',
    requiredRoles: ['ADMIN', 'PMKP', 'MANAGEMENT', 'KABID', 'DIREKTUR', 'DEWAN_PENGAWAS', 'PIC'],
    routeHash: '#manajemen-risiko',
    owner: 'Manajemen risiko rumah sakit',
    lastReviewed: '2026-10-29',
    description: 'Risk Register, RTP, FMEA/HFMEA, dan pemantauan pengendalian.',
  },
  {
    id: 'staff',
    label: 'Tenaga Klinis',
    group: 'governance',
    status: 'beta',
    visibility: 'all-authenticated',
    requiredRoles: ['ADMIN', 'PMKP', 'MANAGEMENT', 'KABID', 'DIREKTUR', 'DEWAN_PENGAWAS', 'PIC', 'VALIDATOR'],
    routeHash: '#tenaga-klinis',
    owner: 'Super Admin / Komite PMKP',
    lastReviewed: '2026-10-29',
    description: 'Direktori kanonik, tim dan penugasan, OPPE, FPPE, serta riwayat individu.',
  },
  {
    id: 'analytics',
    label: 'Analitik & Laporan',
    group: 'governance',
    status: 'beta',
    visibility: 'management-only',
    requiredRoles: ['ADMIN', 'PMKP', 'MANAGEMENT', 'KABID', 'DIREKTUR', 'DEWAN_PENGAWAS'],
    routeHash: '#analitik-laporan',
    owner: 'Komite PMKP / pengelola data',
    lastReviewed: '2026-10-29',
    description: 'Statistik, kelengkapan data, dan ekstraksi sesuai scope pengguna.',
  },
  {
    id: 'settings',
    label: 'Administrasi',
    group: 'governance',
    status: 'beta',
    visibility: 'all-authenticated',
    requiredRoles: ['ADMIN', 'PMKP', 'MANAGEMENT', 'KABID', 'DIREKTUR', 'DEWAN_PENGAWAS', 'PIC', 'VALIDATOR'],
    routeHash: '#administrasi',
    owner: 'Super Admin / Komite PMKP',
    lastReviewed: '2026-10-29',
    description: 'Akun, role, unit, kamus indikator, dan konfigurasi berwenang.',
  },
] as const satisfies readonly AurekaModule[]

export type AurekaModuleId = (typeof AUREKA_MODULE_REGISTRY)[number]['id']
export const AUREKA_PRIMARY_NAV: readonly AurekaModule[] = AUREKA_MODULE_REGISTRY.filter((module) => module.id !== 'home')

export const AUREKA_QUALITY_FEATURES = [
  {
    id: 'imut',
    parent: 'quality',
    title: 'Audit Indikator Mutu',
    status: 'beta',
    icon: '▥',
    summary: 'Input, review, dan pantau indikator mutu nasional, rumah sakit, dan unit kerja.',
    description: 'Logbook unit dengan master indikator dan pemeriksaan kelengkapan sebelum review.',
  },
  {
    id: 'cp',
    parent: 'quality',
    title: 'Audit Clinical Pathway',
    status: 'beta',
    icon: '↗',
    summary: 'Audit per episode pasien, checklist lintas PPA, dan penghitungan kepatuhan.',
    description: 'Audit per episode dengan komponen PPA, inklusi, pengecualian, dan bukti.',
  },
  {
    id: 'akk',
    parent: 'quality',
    title: 'Audit Klinis dan Kematian',
    status: 'beta',
    icon: '＋',
    summary: 'Telaah klinis terstruktur, pembelajaran, rekomendasi, dan tindak lanjut.',
    description: 'Telaah berbasis episode dan bukti rekam medis dengan tindak lanjut yang dapat ditelusuri.',
  },
] as const
