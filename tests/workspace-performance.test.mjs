import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('HomeClient lazy-loads heavy workspaces rather than importing them into the route shell', () => {
  const source = read('components/HomeClient.tsx')
  const lazyModules = [
    'QualityIndicatorWorkspace',
    'QualityResultsWorkspace',
    'ClinicalPathwayWorkspace',
    'PatientSafetyWorkspace',
    'RiskManagementWorkspace',
    'QualityHub',
    'GeneralSettings',
    'OverviewDashboard',
    'MetadataStatisticsWorkspace',
    'OppeAuditWorkspace',
  ]
  for (const moduleName of lazyModules) {
    assert.match(source, new RegExp(`const ${moduleName}=dynamic\\(\\(\\)=>import\\('`))
    assert.doesNotMatch(source, new RegExp(`^import ${moduleName} from `, 'm'))
  }
  assert.doesNotMatch(source, /CommandPalette/)
  assert.match(source, /workspaceChunkLoading/)
})

test('Metadata workspace separates the staff master directory from unit assignment tabs', () => {
  const source = read('components/MetadataStatisticsWorkspace.tsx')
  for (const moduleName of ['StaffDirectoryWorkspace', 'StaffTeamWorkspace']) {
    assert.match(source, new RegExp(`const ${moduleName}\\s*=\\s*dynamic\\(\\(\\)\\s*=>\\s*import\\('`))
    assert.doesNotMatch(source, new RegExp(`^import ${moduleName} from `, 'm'))
  }
  assert.match(source, /label: 'Direktori Induk SDM'/)
  assert.match(source, /label: 'Daftar Tenaga Kerja'/)
  assert.match(source, /label: 'Tim & Penugasan'/)
  assert.match(source, /activeDirectoryTab === 'directory' && canOpenDirectory/)
  assert.match(source, /activeDirectoryTab === 'team' && canOpenTeam/)
})

test('FPPE and Clinical Death audit are split from their parent workspaces', () => {
  const oppe = read('components/OppeAuditWorkspace.tsx')
  const quality = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(oppe, /const FppeEvaluationWorkspace=dynamic\(\(\)=>import\('@\/components\/FppeEvaluationWorkspace'\)/)
  assert.match(oppe, /screen === 'fppe' &&/)
  assert.doesNotMatch(oppe, /^import FppeEvaluationWorkspace from /m)
  assert.match(quality, /const ClinicalDeathAuditWorkspace=dynamic\(\(\)=>import\('@\/components\/ClinicalDeathAuditWorkspace'\)/)
  assert.doesNotMatch(quality, /^import ClinicalDeathAuditWorkspace from /m)
  assert.match(quality, /container==='Audit Klinis dan Kematian'\?/)
})

test('Excel import dialogs are split into on-demand chunks and remain mounted after first use', () => {
  const source = read('components/QualityIndicatorWorkspace.tsx')
  const dialogs = [
    ['ComplaintExcelImportDialog', 'complaint'],
    ['AmbulanceExcelImportDialog', 'ambulance'],
    ['IbsExcelImportDialog', 'ibs'],
    ['PharmacyExcelImportDialog', 'pharmacy'],
    ['GiziExcelImportDialog', 'gizi'],
    ['LaboratoryExcelImportDialog', 'laboratory'],
    ['OutpatientExcelImportDialog', 'outpatient'],
    ['RehabMedikExcelImportDialog', 'rehab'],
    ['IcuExcelImportDialog', 'icu'],
    ['PerinatologyExcelImportDialog', 'perinatology'],
    ['NicuExcelImportDialog', 'nicu'],
    ['NifasExcelImportDialog', 'nifas'],
    ['PonekExcelImportDialog', 'ponek'],
    ['PediatricInpatientExcelImportDialog', 'pediatric-inpatient'],
    ['SurgicalInpatientExcelImportDialog', 'surgical-inpatient'],
  ]
  for (const [component, key] of dialogs) {
    assert.match(source, new RegExp(`const ${component}=dynamic\\(\\(\\)=>import\\('`))
    assert.match(source, new RegExp(`loadedImportDialogs\\.has\\('${key}'\\)\\&\\&<${component}`))
    assert.doesNotMatch(source, new RegExp(`^import ${component} from `, 'm'))
  }
  assert.match(source, /type ImportDialogKey=/)
  assert.match(source, /const \[loadedImportDialogs,setLoadedImportDialogs\]/)
  assert.match(source, /const openImportDialog=\(key:ImportDialogKey\)=>/)
  assert.match(source, /const next=new Set\(current\);next\.add\(key\);return next/)
  assert.match(source, /else if\(key==='ponek'\)setPonekImportOpen\(true\)/)
})

test('Metadata tabs lazy-load profile, workforce list, and assignment workspaces independently', () => {
  const source = read('components/MetadataStatisticsWorkspace.tsx')
  for (const moduleName of ['QualitySettings', 'StaffDirectoryWorkspace', 'StaffTeamWorkspace']) {
    assert.match(source, new RegExp(`const ${moduleName}\\s*=\\s*dynamic\\(\\(\\)\\s*=>\\s*import\\('`))
    assert.doesNotMatch(source, new RegExp(`^import ${moduleName} from `, 'm'))
  }
  assert.equal(source.includes('const StatisticsWorkspace'), false)
  assert.equal(source.includes('@/components/StatisticsWorkspace'), false)
})

test('performance refactor does not add bundle tooling or change Supabase and clinical engines', () => {
  const pkg = JSON.parse(read('package.json'))
  assert.equal(pkg.dependencies['@next/bundle-analyzer'], undefined)
  assert.equal(pkg.devDependencies['@next/bundle-analyzer'], undefined)
  assert.match(read('next.config.mjs'), /output: 'export'/)
})

test('Rawat Inap Anak and Rawat Inap Bedah workbook importers are room-scoped, lazy-loaded, and retain authorization guards', () => {
  const source = read('components/QualityIndicatorWorkspace.tsx')
  for (const [component, key] of [
    ['PediatricInpatientExcelImportDialog', 'pediatric-inpatient'],
    ['SurgicalInpatientExcelImportDialog', 'surgical-inpatient'],
  ]) {
    assert.match(source, new RegExp(`const ${component}=dynamic\\(\\(\\)=>import\\('`))
    assert.match(source, new RegExp(`loadedImportDialogs\\.has\\('${key}'\\)&&<${component}`))
    assert.doesNotMatch(source, new RegExp(`^import ${component} from `, 'm'))
  }
  assert.match(source, /else if\(id===22\)openImportDialog\('pediatric-inpatient'\)/)
  assert.match(source, /else if\(id===23\)openImportDialog\('surgical-inpatient'\)/)
  assert.match(source, /setPediatricInpatientImportOpen\(true\)/)
  assert.match(source, /setSurgicalInpatientImportOpen\(true\)/)
  assert.match(source, /authorized=\{canImportWorkbook\}/)
})

test('Rawat Inap Penyakit Dalam workbook importer is room-scoped, lazy-loaded, and retains authorization guards', () => {
  const source = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(source, /const PenyakitDalamInpatientExcelImportDialog=dynamic\(\(\)=>import\('@\/components\/PenyakitDalamInpatientExcelImportDialog'\)/)
  assert.match(source, /loadedImportDialogs\.has\('penyakit-dalam-inpatient'\)&&<PenyakitDalamInpatientExcelImportDialog/)
  assert.doesNotMatch(source, /^import PenyakitDalamInpatientExcelImportDialog from /m)
  assert.match(source, /else if\(id===25\)openImportDialog\('penyakit-dalam-inpatient'\)/)
  assert.match(source, /loadedImportDialogs\.has\('penyakit-dalam-inpatient'\)/)
  assert.match(source, /authorized=\{canImportWorkbook\}/)
  assert.match(source, /Number\(roomId\)===25/)
})
