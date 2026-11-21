import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = file => readFileSync(new URL('../' + file, import.meta.url), 'utf8')

test('PDF.js v6 import is browser-local and uses matching legacy worker', () => {
  const source = read('lib/aureka/local-documents.ts')
  const packageJson = JSON.parse(read('package.json'))
  assert.equal(packageJson.dependencies['pdfjs-dist'], '6.5.438')
  assert.match(source, /import\('pdfjs-dist\/legacy\/build\/pdf\.mjs'\)/)
  assert.match(source, /new URL\('pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs', import\.meta\.url\)/)
  assert.match(source, /pdfjs\.getDocument\(\{ data: new Uint8Array\(bytes\), useSystemFonts: true \}\)/)
  assert.doesNotMatch(source, /isEvalSupported|document\.destroy\(\)/)
  assert.doesNotMatch(source, /getJavaScript\(|getJSActions\(|eval\(/)
})

test('PDF worker is destroyed on success and on rejected loading promise', () => {
  const source = read('lib/aureka/local-documents.ts')
  const pdfStart = source.indexOf('async function readPdf(')
  const pdfEnd = source.indexOf('async function readXlsx(', pdfStart)
  assert.ok(pdfStart > 0 && pdfEnd > pdfStart)
  const block = source.slice(pdfStart, pdfEnd)
  const tryStart = block.indexOf('try {')
  const awaitStart = block.indexOf('await loading.promise')
  const finallyStart = block.indexOf('finally { await loading.destroy() }')
  assert.ok(tryStart >= 0 && tryStart < awaitStart, 'load await must be inside try')
  assert.ok(finallyStart > awaitStart, 'always terminate the owned loading task')
  assert.match(block, /if \(document\.numPages > MAX_PAGES\)/)
  assert.match(block, /page\.cleanup\(\)/)
})

test('document input remains capped and never uploads or retains original PDF', () => {
  const source = read('lib/aureka/local-documents.ts')
  assert.match(source, /MAX_LOCAL_FILE_BYTES = 15 \* 1024 \* 1024/)
  assert.match(source, /MAX_PAGES = 150/)
  assert.match(source, /File sumber tidak disimpan di server maupun cache browser/)
  assert.doesNotMatch(source, /supabase\.storage|upload\(|createObjectURL\(file\)/)
})
