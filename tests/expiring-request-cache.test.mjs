import assert from 'node:assert/strict'
import test from 'node:test'
import { createExpiringRequestCache } from '../lib/aureka/expiring-request-cache.ts'

test('deduplicates concurrent loads and keeps public data until expiry', async () => {
  let clock = 1_000
  let requests = 0
  let resolvePending
  const cache = createExpiringRequestCache(() => {
    requests++
    return new Promise(resolve => { resolvePending = resolve })
  }, 60_000, () => clock)

  const first = cache.load()
  const second = cache.load()
  assert.equal(first, second)
  await Promise.resolve()
  assert.equal(requests, 1)

  resolvePending({ published: true })
  const initial = await first
  assert.deepEqual(await cache.load(), initial)
  assert.equal(requests, 1)

  clock += 60_000
  const fresh = cache.load()
  await Promise.resolve()
  assert.equal(requests, 2)
  resolvePending({ published: false })
  assert.deepEqual(await fresh, { published: false })
})

test('does not cache failures; later requests can retry', async () => {
  let attempts = 0
  const cache = createExpiringRequestCache(async () => {
    attempts++
    if (attempts === 1) throw new Error('network failure')
    return 'recovered'
  }, 60_000)

  await assert.rejects(cache.load(), /network failure/)
  assert.equal(await cache.load(), 'recovered')
  assert.equal(attempts, 2)
})

test('rejects invalid cache durations', () => {
  assert.throws(() => createExpiringRequestCache(async () => 1, -1), RangeError)
  assert.throws(() => createExpiringRequestCache(async () => 1, Infinity), RangeError)
})
