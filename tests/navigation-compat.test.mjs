import test from 'node:test'
import assert from 'node:assert/strict'
import {
  AUREKA_NAV_FEATURES,
  normalizeAurekaRoutePath,
} from '../lib/aureka/navigation-compat.ts'

test('legacy bookmarks resolve to canonical module and workspace routes', () => {
  const cases = [
    ['#ringkasan', 'beranda'],
    ['halaman-utama', 'beranda'],
    ['nara', 'nara-ai'],
    ['mutu-klinis', 'indikator-mutu'],
    ['mutu-klinis/audit-indikator/form-logbook', 'indikator-mutu/form-logbook'],
    ['mutu-klinis/audit-indikator/hasil-capaian', 'indikator-mutu/hasil-capaian'],
    ['mutu-klinis/clinical-pathway/hasil-capaian', 'peningkatan-kinerja-klinis/clinical-pathway/hasil-capaian'],
    ['mutu-klinis/audit-klinis-dan-kematian', 'peningkatan-kinerja-klinis/audit-klinis-dan-kematian'],
    ['mutu-klinis/oppe-fppe', 'sumber-daya-manusia/oppe-fppe'],
    ['tenaga-klinis/oppe', 'sumber-daya-manusia/oppe'],
    ['register-pasien', 'pasien/register-pasien/tambah-pasien'],
    ['register-pasien/rekapan-pasien', 'pasien/register-pasien/rekapan-pasien'],
    ['register-pasien/direktori-pasien', 'pasien/register-pasien/direktori-pasien'],
    ['program-indikator', 'program'],
    ['analitik-laporan', 'program'],
    ['metadata', 'program/metadata'],
    ['administrasi/pengguna', 'pengaturan/pengguna'],
  ]
  for (const [legacy, canonical] of cases) {
    assert.equal(normalizeAurekaRoutePath(legacy), canonical, legacy)
  }
})

test('route aliases preserve unmatched deep-link suffixes and are idempotent', () => {
  const oldRoute = 'mutu-klinis/clinical-pathway/hasil-capaian/episode'
  const canonical = 'peningkatan-kinerja-klinis/clinical-pathway/hasil-capaian/episode'
  assert.equal(normalizeAurekaRoutePath(oldRoute), canonical)
  assert.equal(normalizeAurekaRoutePath(canonical), canonical)
  assert.equal(normalizeAurekaRoutePath('custom-module/custom-tab'), 'custom-module/custom-tab')
})

test('mobile workspace tabs have an explicit rollback feature flag', () => {
  assert.equal(AUREKA_NAV_FEATURES.mobileWorkspaceTabs, process.env.NEXT_PUBLIC_AUREKA_MOBILE_WORKSPACE_TABS !== 'false')
})
