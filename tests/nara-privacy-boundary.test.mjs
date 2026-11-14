import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const gateway = read('supabase/functions/aureka-tanya/index.ts')

test('NARA keeps all five providers behind the server-side gateway', () => {
  for (const provider of ['gemini', 'groq', 'nvidia', 'deepseek', 'llm7']) {
    assert.match(gateway, new RegExp(provider + ': keysOf|'+provider+'\\s*:'), 'Missing provider adapter: ' + provider)
  }
  assert.match(gateway, /AI_PROVIDER_ORDER \|\| "groq,nvidia,gemini,deepseek,llm7"/)
  assert.match(gateway, /AI_ENABLE_DEEPSEEK/)
  assert.match(gateway, /AI_ENABLE_LLM7/)
})

test('NARA Privacy Guard blocks common direct identifiers before provider calls', () => {
  assert.match(gateway, /sensitivePatterns/)
  assert.match(gateway, /\\b\\d\{16\}\\b/)
  assert.match(gateway, /nomor\\s\*rekam\\s\*medis/)
  assert.match(gateway, /status: 422|reply\(422/)
})

test('external AI context excludes incident unit/month detail and free-text risk events', () => {
  assert.doesNotMatch(gateway, /contoh_risiko_skor_tertinggi/)
  assert.match(gateway, /catatan_disclosure/)
  assert.match(gateway, /safeCount/)
  assert.match(gateway, /per_jenis: safeCount/)
  assert.doesNotMatch(gateway, /per_unit: count\(incidents\.rows/)
  assert.doesNotMatch(gateway, /per_bulan: Object\.fromEntries\(Object\.entries\(count\(incidents/)
})

test('DeepSeek and LLM7 are enabled by default unless explicitly disabled', () => {
  assert.match(gateway, /x === "deepseek" && Deno\.env\.get\("AI_ENABLE_DEEPSEEK"\) !== "true"/)
  assert.match(gateway, /x === "llm7" && Deno\.env\.get\("AI_ENABLE_LLM7"\) !== "true"/)
})

test('NARA identity is the intelligence layer; existing Tanya AUREKA UI remains unchanged', () => {
  assert.match(gateway, /NARA \(AUREKA Intelligence\)/)
  const ui = read('components/TanyaAureka.tsx')
  assert.match(ui, /Tanya AUREKA/)
})

test('logbook non-submission is calculated from raw counts before suppression', () => {
  assert.match(gateway, /Determine zero-submission units from raw internal counts before n<5 suppression/)
  assert.match(gateway, /return raw\.slice\(k \* 3, k \* 3 \+ 3\)\.reduce\(\(a, b\) => a \+ b, 0\) === 0/)
  assert.doesNotMatch(gateway, /logbookPerUnit\.filter\(\(u\) => !\(u\.per_triwulan/)
})
