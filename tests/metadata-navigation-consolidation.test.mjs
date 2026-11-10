import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Metadata is the single primary entry point for the metadata and workforce master', () => {
  const home = read('components/HomeClient.tsx')
  const registry = read('lib/aureka/module-registry.ts')
  const metadata = read('components/MetadataStatisticsWorkspace.tsx')

  assert.match(registry, /id: 'analytics',[\s\S]*?label: 'Metadata',[\s\S]*?routeHash: '#metadata'/)
  assert.match(home, /id!=='staff'/)
  assert.match(home, /id==='analytics'\?'Metadata'/)
  assert.doesNotMatch(home, /ClinicalWorkforceWorkspace|StaffWorkspaceArea|staffArea/)
  assert.match(metadata, /label: 'Program Kerja'/)
  assert.match(metadata, /label: 'Profil Indikator'/)
  assert.match(metadata, /label: 'Direktori Induk SDM'/)
})

test('Direktori Induk SDM contains exactly the staff directory and unit assignment areas', () => {
  const metadata = read('components/MetadataStatisticsWorkspace.tsx')

  assert.match(metadata, /label: 'Daftar Tenaga Kerja'/)
  assert.match(metadata, /label: 'Tim & Penugasan'/)
  assert.match(metadata, /aria-label="Bagian Direktori Induk SDM"/)
  assert.match(metadata, /StaffDirectoryWorkspace/)
  assert.match(metadata, /StaffTeamWorkspace/)
  assert.doesNotMatch(metadata, /StatisticsWorkspace|Statistik & Laporan|Review “Lainnya”/)
})

test('the unclear Other response review and Statistics & Reports tabs are removed', () => {
  const settings = read('components/QualitySettings.tsx')
  const metadata = read('components/MetadataStatisticsWorkspace.tsx')

  assert.doesNotMatch(settings, /Review “Lainnya”|pendingState|loadPending|review_status/)
  assert.match(settings, /label: 'Program Kerja'/)
  assert.match(settings, /label: 'Profil Indikator'/)
  assert.doesNotMatch(metadata, /StatisticsWorkspace|Statistik & Laporan|Review “Lainnya”/)
})

test('OPPE / FPPE is a Mutu Klinis subtab immediately after Audit Klinis dan Kematian', () => {
  const home = read('components/HomeClient.tsx')
  const qualityNav = home.slice(home.indexOf('quality:['), home.indexOf('safety:[', home.indexOf('quality:[')))

  assert.ok(qualityNav.indexOf("id:'audit-clinical-death'") < qualityNav.indexOf("id:'oppe-fppe'"))
  assert.match(home, /qualityOppeOpen\?'oppe-fppe'/)
  assert.match(home, /OppeAuditWorkspace key="quality-oppe-fppe"/)
  assert.match(home, /active==='quality'&&!qualityOppeOpen&&<nav className="qualityWorkspaceTabs"/)
  assert.match(home, /#mutu-klinis\/oppe-fppe/)
})
