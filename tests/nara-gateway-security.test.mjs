import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const gateway = read('supabase/functions/aureka-tanya/index.ts')
const supabaseConfig = read('supabase/config.toml')

test('production Edge Function explicitly retains JWT verification', () => {
  assert.match(supabaseConfig, /\[functions\.aureka-tanya\][\s\S]*?verify_jwt = true/)
})

test('all five AI providers have server-side adapters and a deterministic fallback order', () => {
  for (const provider of ['groq', 'nvidia', 'gemini', 'deepseek', 'llm7']) {
    assert.ok(gateway.includes(provider), 'Missing provider: ' + provider)
  }
  assert.match(gateway, /groq,nvidia,gemini,deepseek,llm7/)
  assert.match(gateway, /AI_PROVIDER_ORDER/)
  assert.match(gateway, /PROVIDER_NAMES/)
  assert.match(gateway, /requestedOrder, \.\.\.PROVIDER_NAMES/)
})

test('DeepSeek and LLM7 are enabled when secrets exist and can be explicitly disabled', () => {
  assert.match(gateway, /AI_ENABLE_DEEPSEEK/)
  assert.match(gateway, /AI_ENABLE_LLM7/)
  assert.match(gateway, /Deno\.env\.get\("AI_ENABLE_DEEPSEEK"\) === "false"/)
  assert.match(gateway, /Deno\.env\.get\("AI_ENABLE_LLM7"\) === "false"/)
})

test('NARA minimizes incident fields before constructing provider context', () => {
  assert.match(gateway, /select\("incident_type,status,created_at"\)/)
  assert.doesNotMatch(gateway, /from\("incidents"\)\s*\.select\("\*"\)/)
})

test('rate limit is applied before warmup and oversized requests are rejected', () => {
  assert.ok(gateway.indexOf('rateLimited(who.user.id)') < gateway.indexOf('if (body.warmup)'))
  assert.match(gateway, /contentLength > 32768/)
})

test('provider fallback has a bounded total route budget', () => {
  assert.match(gateway, /PROVIDER_ROUTE_BUDGET_MS/)
  assert.match(gateway, /Date\.now\(\) \+ PROVIDER_ROUTE_BUDGET_MS/)
  assert.match(gateway, /if \(Date\.now\(\) >= deadline\) break/)
})

test('browser receives generic internal errors without server detail', () => {
  assert.match(gateway, /NARA AI sedang mengalami gangguan/)
  assert.doesNotMatch(gateway, /detail: detail\.slice/)
})
