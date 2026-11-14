import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const gateway = read('supabase/functions/aureka-tanya/index.ts')

test('all five AI providers have server-side adapters and a deterministic fallback order', () => {
  for (const provider of ['groq', 'nvidia', 'gemini', 'deepseek', 'llm7']) {
    assert.ok(gateway.includes(provider), 'Missing provider: ' + provider)
  }
  assert.match(gateway, /groq,nvidia,gemini,deepseek,llm7/)
  assert.match(gateway, /AI_PROVIDER_ORDER/)
})

test('DeepSeek and LLM7 require explicit server-side opt-in', () => {
  assert.match(gateway, /AI_ENABLE_DEEPSEEK/)
  assert.match(gateway, /AI_ENABLE_LLM7/)
  assert.match(gateway, /Deno\.env\.get\("AI_ENABLE_DEEPSEEK"\) !== "true"/)
  assert.match(gateway, /Deno\.env\.get\("AI_ENABLE_LLM7"\) !== "true"/)
})

test('NARA minimizes incident fields before constructing provider context', () => {
  assert.match(gateway, /select\("incident_type,type,created_at"\)/)
  assert.doesNotMatch(gateway, /from\("incidents"\)\s*\.select\("\*"\)/)
})

test('rate limit is applied before warmup and oversized requests are rejected', () => {
  assert.ok(gateway.indexOf('rateLimited(who.user.id)') < gateway.indexOf('if (body.warmup)'))
  assert.match(gateway, /contentLength > 32768/)
})

test('browser receives generic internal errors without server detail', () => {
  assert.match(gateway, /NARA AI sedang mengalami gangguan/)
  assert.doesNotMatch(gateway, /detail: detail\.slice/)
})
