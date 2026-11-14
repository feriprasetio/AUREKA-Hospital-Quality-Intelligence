import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const home = read('components/HomeClient.tsx')
const registry = read('lib/aureka/module-registry.ts')

test('NARA AI is registered as a dedicated authenticated primary module', () => {
  assert.match(registry, /id:'nara', label:'NARA AI'/)
  assert.match(registry, /'home' \| 'nara' \| 'patients'/)
})

test('NARA AI route, hash navigation, lazy workspace and idle prefetch are wired', () => {
  assert.match(home, /NaraAIWorkspace=dynamic\(\(\)=>import\('@\/components\/NaraAIWorkspace'\)/)
  assert.match(home, /'nara-ai':'nara'/)
  assert.match(home, /nara:'#nara-ai'/)
  assert.match(home, /active==='nara'\?<NaraAIWorkspace sb=\{sb\}/)
  assert.match(home, /import\('@\/components\/NaraAIWorkspace'\)/)
})
