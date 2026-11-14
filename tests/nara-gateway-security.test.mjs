import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const gateway = readFileSync(new URL('../supabase/functions/aureka-tanya/index.ts', import.meta.url), 'utf8')

test('NARA gateway reads configuration from server-side environment', () => {
  assert.ok(gateway.includes('Deno.env.get'), 'gateway must read configuration from Deno.env')
  assert.ok(gateway.includes('AI_PROVIDER_ORDER'), 'provider order must be configurable server-side')
  assert.ok(gateway.includes('AI_ENABLE_DEEPSEEK'), 'DeepSeek kill switch must exist server-side')
  assert.ok(gateway.includes('AI_ENABLE_LLM7'), 'LLM7 kill switch must exist server-side')
})

test('NARA gateway contains no hardcoded provider credentials', () => {
  assert.ok(!/gsk_[A-Za-z0-9]{20,}/.test(gateway), 'possible hardcoded Groq API key')
  assert.ok(!/nvapi-[A-Za-z0-9_-]{20,}/.test(gateway), 'possible hardcoded NVIDIA API key')
  assert.ok(!/AIza[0-9A-Za-z_-]{35}/.test(gateway), 'possible hardcoded Google API key')
  assert.ok(!/sk-[A-Za-z0-9]{32,}/.test(gateway), 'possible hardcoded OpenAI/DeepSeek-style API key')
  assert.ok(!gateway.includes('sb_publishable_'), 'publishable key must not be embedded in the server gateway')
})

test('external AI context must not expose incident unit/month breakdowns', () => {
  assert.ok(!gateway.includes('per_bulan: Object.fromEntries(Object.entries(count(incidents'), 'incident per-month detail must stay out of AI context')
})
