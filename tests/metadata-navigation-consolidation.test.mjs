import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Sumber Daya Manusia is the primary entry point for workforce and OPPE functions', () => {
  const home = read('components/HomeClient.tsx')
  const registry = read('lib/aureka/module-registry.ts')
  const metadata = read('components/MetadataStatisticsWorkspace.tsx')

  assert.match(registry, /id: 'staff',[\\s\\S]*?label: 'Sumber Daya Manusia',[\\s\\S]*?routeHash: '#tenaga-klinis'/)
  assert.match(home, /id!=='analytics'/)
  assert.match(home, /staff:\\[/)
  assert.match(home, /id:'directory',label:'Daftar Tenaga Kerja'/)
  assert.match(home, /id:'team',label:'Tim dan Penugasan'/)
  assert.doesNotMatch(home, /visibleMods[^\\n]*id==='analytics'\\?'Metadata'/)
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
  assert.equal(metadata.includes('const StatisticsWorkspace'), false)
  assert.equal(metadata.includes('@/components/StatisticsWorkspace'), false)
  assert.doesNotMatch(metadata, /Statistik & Laporan|Review “Lainnya”/)
})

test('the unclear Other response review and Statistics & Reports tabs are removed', () => {
  const settings = read('components/QualitySettings.tsx')
  const metadata = read('components/MetadataStatisticsWorkspace.tsx')

  assert.doesNotMatch(settings, /Review “Lainnya”|pendingState|loadPending|review_status/)
  assert.match(settings, /label: 'Program Kerja'/)
  assert.match(settings, /label: 'Profil Indikator'/)
  assert.equal(metadata.includes('const StatisticsWorkspace'), false)
  assert.equal(metadata.includes('@/components/StatisticsWorkspace'), false)
  assert.doesNotMatch(metadata, /Statistik & Laporan|Review “Lainnya”/)
})

test('OPPE / FPPE is nested under Sumber Daya Manusia and uses the canonical route', () => {
  const home = read('components/HomeClient.tsx')
  const qualityNav = home.slice(home.indexOf('quality:['), home.indexOf('safety:[', home.indexOf('quality:[')))
  const staffNav = home.slice(home.indexOf('staff:['), home.indexOf('}', home.indexOf('staff:[')) + 1)

  assert.doesNotMatch(qualityNav, /oppe-fppe/)
  assert.match(staffNav, /oppe-fppe/)
  assert.match(home, /analyticsTab==='oppe'\\?<OppeAuditWorkspace/)
  assert.match(home, /'tenaga-klinis':'staff'/)
  assert.match(home, /analytics:'#tenaga-klinis'/)
})

