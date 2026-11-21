import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const schema = read('supabase/migrations/20261122180000_zero_file_archive_schema.sql')
const migration = read('supabase/migrations/20261122181000_zero_file_storage_policies.sql')

test('new Secretariat records allow NULL file paths and explicitly mark content-only mode', () => {
  assert.match(schema, /ALTER COLUMN object_path DROP NOT NULL/)
  assert.match(schema, /ALTER COLUMN bucket_id DROP NOT NULL/)
  assert.match(schema, /source_mode IN \('legacy_storage','data_only'\)/)
  assert.match(schema, /source_mode <> 'data_only' OR \(object_path IS NULL AND bucket_id IS NULL\)/)
})
test('user-accessible storage buckets cannot accept uploads or overwrites', () => {
  for (const kind of ['INSERT','UPDATE']) {
    assert.match(migration, new RegExp('AS RESTRICTIVE FOR '+kind+' TO anon, authenticated'))
  }
  assert.match(migration, /WITH CHECK \(false\)/)
  assert.doesNotMatch(migration, /DELETE FROM storage\.objects|DROP BUCKET|TRUNCATE/i)
})
test('new SPO, Secretariat and certificate flows do not upload binary objects', () => {
  for (const path of [
    'components/StandardsProcedureWorkspace.tsx',
    'components/governance/SecretariatWorkspace.tsx',
    'components/InHouseTrainingWorkspace.tsx',
    'components/StudentOrientationWorkspace.tsx',
    'components/QualityResultsWorkspace.tsx',
  ]) {
    const code = read(path)
    assert.doesNotMatch(code, /\.storage\.from\(/, path + ' must not reference Storage objects')
    assert.doesNotMatch(code, /\.upload\(/, path + ' must not upload original files')
  }
  const spo = read('components/StandardsProcedureWorkspace.tsx')
  assert.match(spo, /readLocalDocument\(file\)/)
  const sec = read('components/governance/SecretariatWorkspace.tsx')
  assert.match(sec, /readLocalDocument\(item\.file\)/)
  assert.match(sec, /source_mode:'data_only'/)
})
test('local reader never transfers File, Blob or binary to Supabase', () => {
  const source = read('lib/aureka/local-documents.ts')
  assert.match(source, /readLocalDocument\(file: File\)/)
  assert.match(source, /makeStructuredDocx\(/)
  assert.doesNotMatch(source, /supabase|fetch\(/i)
})

test('issued IHT certificates remain downloadable when no Storage path exists', () => {
  const code = read('components/InHouseTrainingWorkspace.tsx')
  assert.match(code, /c\?\.certificate_number\?<button type="button" onClick=\{\(\)=>void download\(c\)\}/)
  assert.doesNotMatch(code, /c\?\.object_path\?<button/)
  assert.match(code, /c\.render_snapshot/)
})
test('browser-local parsers preserve PDF row boundaries and do not upload file bytes', () => {
  const code = read('lib/aureka/local-documents.ts')
  assert.match(code, /Preserve real page row boundaries/)
  assert.match(code, /grouped\.entries\(\)/)
  assert.doesNotMatch(code, /\.storage\.from\(|functions\.invoke\(/)
})
