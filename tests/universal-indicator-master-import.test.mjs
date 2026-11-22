import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const source = await readFile(new URL('../components/QualityIndicatorWorkspace.tsx', import.meta.url), 'utf8')
const panel = await readFile(new URL('../components/QualityWorkbookImportPanel.tsx', import.meta.url), 'utf8')

test('indicator workspace exposes unit-scoped universal profile Excel import for Superadmin', () => {
  assert.match(source, /QualityWorkbookImportPanel=dynamic/)
  assert.match(source, /isAdmin&&!isValidator&&roomId!=null&&container==='Audit Indikator Mutu'/)
  assert.match(source, /Impor Master \/ Profil Indikator \.xlsx/)
  assert.match(source, /masterWorkbookOpen&&isAdmin&&roomId!=null&&<AurekaModal/)
  assert.match(source, /importerKey="aureka-indicator-master"/)
  assert.match(source, /role="ADMIN"/)
  assert.match(source, /activeProfiles=\{profiles\.filter\(profile=>Number\(profile\.room_id\)===roomId\)/)
  assert.match(source, /setMasterWorkbookOpen\(false\);if\(await load\(\)\)/)
})

test('universal importer supports profile-only without patient data, and checks provenance before atomic RPC commit', () => {
  assert.match(panel, /'profiles_and_data' \| 'profiles_only' \| 'data_only'/)
  assert.match(panel, /importMode === 'profiles_only' \? 0 : preview\.rows\.length/)
  assert.match(panel, /const sourceDataRows = importMode === 'profiles_only' \? \[\]/)
  assert.match(panel, /create_quality_import_batch/)
  assert.match(panel, /validate_quality_import_batch/)
  assert.match(panel, /commit_quality_import_batch/)
  assert.match(panel, /if \(!code \|\| !title \|\| !\['patient_episode'/)
  assert.doesNotMatch(panel, /storage\.from\(/)
})


test('empty master defaults to profile-only import before any patient logbook ingestion', () => {
  assert.match(panel, /if \(roleCanImportProfiles && pSheet && activeProfiles\.length === 0\)/)
  assert.match(panel, /setImportMode\('profiles_only'\)/)
  assert.match(panel, /p_expected_rows: importMode === 'profiles_only' \? 0 : preview\.rows\.length/)
})


test('bulk profile set replacement cannot occur without explicit Superadmin confirmation', () => {
  assert.match(panel, /const \[replaceConfirmed, setReplaceConfirmed\] = useState\(false\)/)
  assert.match(panel, /importMode !== 'data_only' && activeProfiles\.length > 0 && !replaceConfirmed/)
  assert.match(panel, /setError\('Impor set profil penuh akan memensiunkan versi master/)
  assert.match(panel, /checked=\{replaceConfirmed\}/)
  assert.match(panel, /setReplaceConfirmed\(false\)/)
})
