import test from 'node:test'
import assert from 'node:assert/strict'
import { scanSource, inventory } from '../scripts/arctic-continuum-discovery.mjs'

test('Gate 0 scanner extracts literal RPC and schema references with line numbers', () => {
  const result = scanSource("const q = sb.schema('aureka_quality').from('quality_records')\nawait sb.rpc('save_quality_logbook')\nconst saveReview = () => {}")
  assert.ok(result.some(x => x.kind === 'schema' && x.symbol === 'aureka_quality' && x.line === 1))
  assert.ok(result.some(x => x.kind === 'relation' && x.symbol === 'quality_records'))
  assert.ok(result.some(x => x.kind === 'rpc' && x.symbol === 'save_quality_logbook' && x.line === 2))
  assert.ok(result.some(x => x.kind === 'namedOperation' && x.symbol === 'saveReview' && x.line === 3))
})

test('Gate 0 scanner enumerates checkout source without database calls', () => {
  const result = inventory(process.cwd())
  assert.match(result.commit, /^[0-9a-f]{40}$/)
  assert.equal(result.unreadable, 0)
  assert.ok(result.entries.some(x => x.path === 'lib/aureka/module-registry.ts'))
  assert.ok(result.entries.some(x => x.path === 'components/HomeClient.tsx'))
  assert.ok(result.entries.some(x => x.path.startsWith('supabase/migrations/')))
  console.log('Arctic discovery:', result.commit, 'tracked:', result.trackedCount, 'source candidates:', result.candidates, 'static matches:', result.entries.reduce((n,e)=>n+(e.matches?.length ?? 0),0), 'runtime coverage: NOT VERIFIED')
})
