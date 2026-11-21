import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../supabase/functions/aureka-document-ingest/index.ts', import.meta.url), 'utf8')

test('NARA knowledge ingestion indexes reviewed structured text, never raw source files', () => {
  assert.match(source, /String\(version\.extracted_text \|\| ""\)\.trim\(\)/)
  assert.match(source, /makeChunks\(extractedText\)/)
  assert.match(source, /MAX_EXTRACTED_CHARS/)
  for (const forbidden of ['.storage.from(', 'file.arrayBuffer(', 'inline_data', 'base64(', 'extractPdf(', 'extractDocx(']) {
    assert.ok(!source.includes(forbidden), 'raw binary ingestion must remain disabled: ' + forbidden)
  }
})

test('legacy local-file workflows are not reintroduced to the main modules', () => {
  for (const path of [
    'components/StandardsProcedureWorkspace.tsx',
    'components/governance/SecretariatWorkspace.tsx',
    'components/InHouseTrainingWorkspace.tsx',
    'components/StudentOrientationWorkspace.tsx',
    'components/QualityResultsWorkspace.tsx'
  ]) {
    const content = readFileSync(new URL('../' + path, import.meta.url), 'utf8')
    assert.doesNotMatch(content, /\.storage\.from\(/, path)
  }
})
