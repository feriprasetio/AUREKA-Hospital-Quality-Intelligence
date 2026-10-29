export type ModuleStatus = 'available' | 'beta' | 'maintenance' | 'planned'
export type ModuleVisibility = 'all-authenticated' | 'management-only'

export type AurekaModule = {
  id: 'home' | 'quality' | 'safety' | 'risk' | 'staff' | 'analytics' | 'settings'
  label: string
  group: 'overview' | 'clinical' | 'governance'
  status: ModuleStatus
  visibility: ModuleVisibility
  routeHash: string
  owner: string
  lastVerified: string
  description: string
}

export const AUREKA_MODULE_REGISTRY = [
  {
    id: 'home',
    label: 'Ringkasan',
    group: 'overview',
    status: 'beta',
    visibility: 'all-authenticated',
    routeHash: '#ringkasan',
    owner: 'Komite PMKP',
    lastVerified: '2026-10-29',
    description: 'Dashboard operasional, antrean prioritas, dan status data sesuai hak akses.',
  },
  {
    id: 'quality',
    label: 'Mutu Klinis',
    group: 'clinical',
    status: 'beta',
    visibility: 'all-authenticated',
    routeHash: '#mutu-klinis',
    owner: 'Komite PMKP / pemilik indikator',
    lastVerified: '2026-10-29',
    description: 'Audit Indikator Mutu, Clinical Pathway, dan Audit Klinis dan Kematian.',
  },
  {
    id: 'safety',
    label: 'Keselamatan Pasien',
    group: 'clinical',
    status: 'beta',
    visibility: 'all-authenticated',
    routeHash: '#keselamatan-pasien',
    owner: 'Komite PMKP / Tim Keselamatan Pasien',
    lastVerified: '2026-10-29',
    description: 'Laporan insiden, investigasi, pembelajaran, dan tindak lanjut.',
  },
  {
    id: 'risk',
    label: 'Manajemen Risiko',
    group: 'governance',
    status: 'beta',
    visibility: 'all-authenticated',
    routeHash: '#manajemen-risiko',
    owner: 'Manajemen risiko rumah sakit',
    lastVerified: '2026-10-29',
    description: 'Risk Register, RTP, FMEA/HFMEA, dan pemantauan pengendalian.',
  },
  {
    id: 'staff',
    label: 'Tenaga Klinis',
    group: 'governance',
    status: 'beta',
    visibility: 'all-authenticated',
    routeHash: '#tenaga-klinis',
    owner: 'Super Admin / Komite PMKP',
    lastVerified: '2026-10-29',
    description: 'Direktori kanonik, tim dan penugasan, OPPE, FPPE, serta riwayat individu.',
  },
  {
    id: 'analytics',
    label: 'Analitik & Laporan',
    group: 'governance',
    status: 'beta',
    visibility: 'management-only',
    routeHash: '#analitik-laporan',
    owner: 'Komite PMKP / pengelola data',
    lastVerified: '2026-10-29',
    description: 'Statistik, kelengkapan data, dan ekstraksi sesuai scope pengguna.',
  },
  {
    id: 'settings',
    label: 'Administrasi',
    group: 'governance',
    status: 'beta',
    visibility: 'all-authenticated',
    routeHash: '#administrasi',
    owner: 'Super Admin / Komite PMKP',
    lastVerified: '2026-10-29',
    description: 'Akun, role, unit, kamus indikator, dan konfigurasi berwenang.',
  },
] as const satisfies readonly AurekaModule[]

export type AurekaModuleId = (typeof AUREKA_MODULE_REGISTRY)[number]['id']
export const AUREKA_PRIMARY_NAV = AUREKA_MODULE_REGISTRY.filter((module) => module.id !== 'home')

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
