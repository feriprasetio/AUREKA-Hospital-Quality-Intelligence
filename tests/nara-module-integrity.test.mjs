import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8')
// Literal backslash followed by the letter n (a push/JSON escape artifact), built without source escapes.
const ESCAPED_NEWLINE = String.fromCharCode(92) + 'n'

test('NARA source files are free of literal backslash-n push artifacts', () => {
  const home = read('components/HomeClient.tsx')
  const registry = read('lib/aureka/module-registry.ts')
  assert.ok(!home.includes(ESCAPED_NEWLINE + 'const NaraAIWorkspace'), 'HomeClient import line contains a literal backslash-n artifact')
  assert.ok(!home.includes(ESCAPED_NEWLINE + '   :active='), 'HomeClient render chain contains a literal backslash-n artifact')
  assert.ok(!registry.includes(ESCAPED_NEWLINE + '  { id:'), 'module registry contains a literal backslash-n artifact')
})

test('NARA module is registered with a stable route', () => {
  const registry = read('lib/aureka/module-registry.ts')
  assert.ok(registry.includes(`{ id:'nara', label:'NARA AI'`), 'nara module missing from registry')
  assert.ok(registry.includes(`routeHash:'#nara-ai'`), 'nara routeHash missing from registry')
})

test('NARA hash routing works in both directions (no bounce back to Beranda)', () => {
  const home = read('components/HomeClient.tsx')
  assert.ok(home.includes(`nara:'#nara-ai'`), 'hash writer missing nara route')
  assert.ok(home.includes(`'nara-ai':'nara'`), 'hash reader missing nara-ai route; refresh/deep-link would bounce to home')
})

test('NARA workspace is wired into HomeClient render and idle prefetch', () => {
  const home = read('components/HomeClient.tsx')
  assert.ok(home.includes(`import('@/components/NaraAIWorkspace')`), 'NaraAIWorkspace import missing')
  assert.ok(home.includes(`:active==='nara'?<NaraAIWorkspace`), 'NaraAIWorkspace render branch missing')
})
