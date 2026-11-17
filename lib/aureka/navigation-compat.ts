/**
 * Centralized navigation compatibility for the AUREKA workspace transition.
 * Rollback mobile tabs by setting NEXT_PUBLIC_AUREKA_MOBILE_WORKSPACE_TABS=false
 * in the production build environment and redeploying.
 */
export const AUREKA_NAV_FEATURES = {
  mobileWorkspaceTabs: process.env.NEXT_PUBLIC_AUREKA_MOBILE_WORKSPACE_TABS !== 'false',
} as const

/** Longest-prefix aliases preserve deep links and prevent broad aliases shadowing specifics. */
export const AUREKA_ROUTE_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['mutu-klinis/audit-indikator/hasil-capaian', 'indikator-mutu/hasil-capaian'],
  ['mutu-klinis/audit-indikator/form-logbook', 'indikator-mutu/form-logbook'],
  ['mutu-klinis/audit-indikator', 'indikator-mutu/form-logbook'],
  ['mutu-klinis/clinical-pathway', 'peningkatan-kinerja-klinis/clinical-pathway'],
  ['mutu-klinis/audit-klinis-dan-kematian', 'peningkatan-kinerja-klinis/audit-klinis-dan-kematian'],
  ['mutu-klinis/oppe-fppe', 'sumber-daya-manusia/oppe-fppe'],
  ['tenaga-klinis/oppe-fppe', 'sumber-daya-manusia/oppe-fppe'],
  ['tenaga-klinis/oppe', 'sumber-daya-manusia/oppe'],
  ['register-pasien/direktori-pasien', 'pasien/register-pasien/direktori-pasien'],
  ['register-pasien/rekapan-pasien', 'pasien/register-pasien/rekapan-pasien'],
  ['register-pasien/tambah-pasien', 'pasien/register-pasien/tambah-pasien'],
  ['register-pasien', 'pasien/register-pasien/tambah-pasien'],
  ['mutu-klinis', 'indikator-mutu'],
  ['ringkasan', 'beranda'],
  ['halaman-utama', 'beranda'],
  ['nara', 'nara-ai'],
  ['tenaga-klinis', 'sumber-daya-manusia'],
  ['program-indikator', 'program'],
  ['analitik-laporan', 'program'],
  ['metadata', 'program/metadata'],
  ['administrasi', 'pengaturan'],
] as const

const ROUTE_ALIASES_LONGEST_FIRST = [...AUREKA_ROUTE_ALIASES].sort((a, b) => b[0].length - a[0].length)

/** Returns a canonical, hash-free route path and preserves unmatched suffixes. */
export function normalizeAurekaRoutePath(value: string): string {
  const path = String(value ?? '').replace(/^#\/?/, '').replace(/^\/+|\/+$/g, '').toLowerCase()
  if (!path) return 'beranda'
  const alias = ROUTE_ALIASES_LONGEST_FIRST.find(([legacy]) => path === legacy || path.startsWith(legacy + '/'))
  return alias ? alias[1] + path.slice(alias[0].length) : path
}
