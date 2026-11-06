import test from 'node:test'
import assert from 'node:assert/strict'
import { readAllPages } from '../lib/aureka/pagination.ts'

test('reads every page beyond the former 20,000-row cap', async () => {
  const total = 20321
  const calls = []
  const rows = await readAllPages(async (from, to) => {
    calls.push([from, to])
    const length = Math.max(0, Math.min(to + 1, total) - from)
    return { data: Array.from({ length }, (_, index) => from + index), error: null }
  }, 500)

  assert.equal(rows.length, total)
  assert.equal(rows[0], 0)
  assert.equal(rows.at(-1), total - 1)
  assert.equal(calls.length, 41)
  assert.deepEqual(calls[0], [0, 499])
  assert.deepEqual(calls.at(-1), [20000, 20499])
})

test('returns an empty array when the source has no rows', async () => {
  const rows = await readAllPages(async () => ({ data: [], error: null }))
  assert.deepEqual(rows, [])
})

test('propagates backend errors rather than returning partial data', async () => {
  const failure = new Error('database unavailable')
  let calls = 0
  await assert.rejects(
    readAllPages(async () => {
      calls += 1
      return { data: null, error: failure }
    }),
    (error) => error === failure,
  )
  assert.equal(calls, 1)
})

test('validates page size before querying', async () => {
  let called = false
  await assert.rejects(
    readAllPages(async () => {
      called = true
      return { data: [], error: null }
    }, 0),
    RangeError,
  )
  assert.equal(called, false)
})
