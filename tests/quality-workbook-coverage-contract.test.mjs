import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('generic workbook import uses stable identity, preserves draft status and mirrors indicator values',async()=>{
 const source=await readFile(new URL('../components/QualityWorkbookImportPanel.tsx',import.meta.url),'utf8')
 assert.match(source,/seenSourceKeys/)
 assert.match(source,/Mode Upsert memerlukan ID subjek/)
 assert.match(source,/status: isReady \? 'ready' : 'draft'/)
 assert.match(source,/indicator_values: Object\.fromEntries\(responses\.map/)
 assert.match(source,/isIndicatorApplicableToDiagnosis/)
})
