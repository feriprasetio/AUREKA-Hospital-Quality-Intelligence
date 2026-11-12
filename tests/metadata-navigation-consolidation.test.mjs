import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Sumber Daya Manusia is the primary entry point for workforce and OPPE functions', () => {
  const home = read('components/HomeClient.tsx')
  const registry = read('lib/aureka/module-registry.ts')
  const metadata = read('components/MetadataStatisticsWorkspace.tsx')

  // Blueprint v2: registri ditulis rapat (id:'staff') dan rute kanonik #sumber-daya-manusia
  assert.match(registry, /id:\s*'staff'/)
  assert.match(registry, /label:\s*'Sumber Daya Manusia'/)
  assert.match(registry, /routeHash:\s*'#sumber-daya-manusia'/)
  assert.ok(home.includes("AUREKA_PRIMARY_NAV.filter(({requiredRoles})=>requiredRoles.includes((role||'') as AurekaRole))"))
  assert.ok(home.includes("staff:["))
  assert.ok(home.includes("id:'directory',label:'Daftar Tenaga Kerja'"))
  assert.ok(home.includes("id:'team',label:'Tim dan Penugasan'"))
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
  const qualityStart = home.indexOf('quality:[')
  const qualityEnd = home.indexOf('\n   ],', qualityStart)
  const staffStart = home.indexOf('staff:[')
  const staffEnd = home.indexOf('\n   ],', staffStart)
  assert.ok(!home.slice(qualityStart, qualityEnd).includes('oppe-fppe'))
  assert.ok(home.slice(staffStart, staffEnd).includes('oppe-fppe'))
  assert.ok(home.includes("(analyticsTab==='oppe'||analyticsTab==='fppe')?<OppeAuditWorkspace"))
  assert.ok(home.includes("'tenaga-klinis':'staff'"))
  // Blueprint v2: rute hash per modul ditetapkan di satu peta
  assert.ok(home.includes("staff:'#sumber-daya-manusia'"))
  assert.ok(home.includes("analytics:'#program'"))
})
