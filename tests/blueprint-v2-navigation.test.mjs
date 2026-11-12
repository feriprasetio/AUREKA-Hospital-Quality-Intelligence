import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('home exposes only Beranda and one canonical Infografis entry', () => {
  const home = read('components/HomeLandingWorkspace.tsx')
  assert.ok(home.includes("tabButton('welcome','Beranda')"))
  assert.ok(home.includes("tabButton('infographics','Infografis')"))
  assert.ok(!home.includes("tabButton('achievements'"))
  assert.ok(!home.includes("tab==='achievements'"))
  assert.ok(!home.includes('OverviewDashboard'))
})

test('primary navigation labels follow the approved domain terminology', () => {
  const registry = read('lib/aureka/module-registry.ts')
  for (const label of ["label:'Beranda'", "label:'Pasien'", "label:'Indikator Mutu'", "label:'Peningkatan Kinerja Klinis'", "label:'Keselamatan Pasien'", "label:'Manajemen Risiko'", "label:'Program'", "label:'Sumber Daya Manusia'", "label:'Pengaturan'"]) {
    assert.ok(registry.includes(label), 'Missing registry label: ' + label)
  }
})

test('OPPE and FPPE are reachable from SDM navigation and not from quality navigation', () => {
  const app = read('components/HomeClient.tsx')
  const qualityStart = app.indexOf('quality:[')
  const qualityEnd = app.indexOf('\n   ],', qualityStart)
  const staffStart = app.indexOf('staff:[')
  const staffEnd = app.indexOf('\n   ],', staffStart)
  const qualityGroup = app.slice(qualityStart, qualityEnd)
  const staffGroup = app.slice(staffStart, staffEnd)
  assert.ok(!qualityGroup.includes('oppe-fppe'))
  assert.ok(staffGroup.includes('Daftar Tenaga Kerja'))
  assert.ok(staffGroup.includes('Tim dan Penugasan'))
  assert.ok(staffGroup.includes('oppe-fppe'))
  // Blueprint v2 §9: OPPE dan FPPE menu terpisah, satu workspace dengan layar awal berbeda
  assert.ok(app.includes("active==='analytics'&&(analyticsTab==='oppe'||analyticsTab==='fppe')?<OppeAuditWorkspace"))
  assert.ok(staffGroup.includes("{id:'fppe',label:'FPPE'}"))
  assert.ok(app.includes("'sumber-daya-manusia':'staff'"))
  assert.ok(app.includes("if(next==='staff'){setAnalyticsTab(section==='oppe-fppe'||section==='oppe'?'oppe':section==='fppe'?'fppe':'directory')"))
})

test('legacy bookmarks remain mapped while the new HR route is canonical', () => {
  const app = read('components/HomeClient.tsx')
  assert.ok(app.includes("'metadata':'analytics'"))
  assert.ok(app.includes("analytics:'#program'"))
  assert.ok(app.includes("staff:'#sumber-daya-manusia'"))
  assert.ok(app.includes("'tenaga-klinis':'staff'"))
})

test('home parent and child navigation use the approved labels and canonical route', () => {
  const app = read('components/HomeClient.tsx')
  assert.ok(app.includes('title="Beranda"'))
  assert.ok(app.includes("home:[{id:'welcome',label:'Beranda'},{id:'infographics',label:'Infografis'}]"))
  assert.ok(app.includes("active==='home'?(homeTab==='infographics'?'infografis':'beranda')"))
  // Infografis dirender sebagai tab di dalam workspace Beranda, bukan komponen duplikat di HomeClient.
  assert.ok(app.includes('<HomeLandingWorkspace supabase={sb}'))
  assert.ok(app.includes('initialTab={homeTab} onTabChange={setHomeTab}'))
  assert.ok(!app.includes("homeTab==='infographics'\n     ? <InfographicsDashboard"))
})


test('indicator and clinical audit domains have separate navigation and canonical routes', () => {
  const app = read('components/HomeClient.tsx')
  const registry = read('lib/aureka/module-registry.ts')
  assert.ok(registry.includes("id:'quality', label:'Indikator Mutu'"))
  assert.ok(registry.includes("id:'clinical', label:'Peningkatan Kinerja Klinis'"))
  assert.ok(app.includes("clinical:["))
  assert.match(app, /quality:role==='DEWAN_PENGAWAS'/)
  // Route kanonis Hasil Capaian membedakan Unit Keseluruhan dan Kategori Indikator
  assert.ok(app.includes("hash='#indikator-mutu/'+(qualityResultsView?'hasil-capaian/'+(qualityResultsGroup==='category'?'kategori-indikator':'unit-keseluruhan'):'form-logbook')"))
  assert.ok(app.includes("hash='#peningkatan-kinerja-klinis/'+audit+(qualityResultsView?'/hasil-capaian':'')"))
  assert.ok(app.includes("active==='clinical'&&clinicalPathwayOpen?<ClinicalPathwayWorkspace"))
})


test('RTL is one workspace with a source dropdown, not three duplicated navigation entries', () => {
  const app = read('components/HomeClient.tsx')
  const workspace = read('components/governance/GovernanceProgramWorkspace.tsx')
  assert.match(app, /\{id:'rtl',label:'Rencana Tindak Lanjut \(RTL\)'\}/)
  assert.doesNotMatch(app, /\{id:'rtl-dewas'/)
  assert.doesNotMatch(app, /\{id:'rtl-direktur'/)
  assert.doesNotMatch(app, /\{id:'rtl-kabid'/)
  assert.match(workspace, /view === 'rtl' && <label className="govYear">Sumber rekomendasi/)
  assert.match(workspace, /value="DEWAN_PENGAWAS">Dewan Pengawas/)
  assert.match(workspace, /value="DIREKTUR">Direktur/)
  assert.match(workspace, /value="KABID">Kepala Bidang/)
  assert.match(app, /legacySection\.startsWith\('rtl-'\)\?'rtl'/)
})

test('E-Regulation exposes distinct document classes and monitoring without treating drafts as active regulations', () => {
  const app = read('components/HomeClient.tsx')
  const workspace = read('components/governance/RegulationWorkspace.tsx')
  assert.match(app, /label:'Pedoman dan Panduan'/)
  assert.match(app, /label:'Kebijakan Rumah Sakit'/)
  assert.match(app, /label:'Monitoring Regulasi'/)
  assert.match(workspace, /view === 'pedoman' \? all\.filter\(\(d\) => \['pedoman', 'panduan'\]/)
  assert.match(workspace, /view === 'kebijakan' \? all\.filter\(\(d\) => d\.doc_type === 'kebijakan'/)
  assert.match(workspace, /view === 'monitoring' \? all\.filter/)
  assert.match(workspace, /!\['history', 'approval', 'monitoring'\]\.includes\(view\)/)
})


test('PIC performance dashboard and indicator proposal workspaces are wired to authorized navigation', () => {
  const app = read('components/HomeClient.tsx')
  const performance = read('components/PicPerformanceWorkspace.tsx')
  const proposals = read('components/IndicatorProposalWorkspace.tsx')
  const migration = read('supabase/migrations/20261112160000_pic_performance_and_indicator_proposals.sql')
  assert.match(app, /hr\.read\.pic_performance/)
  assert.match(app, /id:'pic-performance',label:'Kinerja PIC'/)
  assert.match(app, /<PicPerformanceWorkspace\/>/)
  assert.match(performance, /aureka_pic_performance_dashboard/)
  assert.match(performance, /Data terakhir dibuat/)
  assert.match(app, /id:'proposals',label:'Usulan Indikator Baru'/)
  assert.match(app, /<IndicatorProposalWorkspace/)
  assert.match(proposals, /aureka_gov_indicator_proposal_save/)
  assert.match(proposals, /aureka_gov_indicator_proposal_review/)
  assert.match(proposals, /aureka_gov_indicator_proposal_activate/)
  assert.match(migration, /hr\.read\.pic_performance/)
  assert.match(migration, /submitted_by=auth\.uid\(\) and status='perlu_revisi'/)
  assert.match(migration, /p.submitted_by=auth\.uid\(\)/)
  assert.match(migration, /Pemisahan tugas: pengusul tidak boleh menelaah usulannya sendiri/)
  assert.match(migration, /Hanya usulan yang telah disetujui yang dapat diaktifkan/)
  assert.match(migration, /indicator_profiles/)
})
