import test from 'node:test'
import assert from 'node:assert/strict'
import { isStatementTimeout, nextBatchSizeAfterTimeout } from '../lib/aureka/import-batching.ts'

test('detects PostgreSQL statement timeout errors', () => {
  assert.equal(isStatementTimeout({ code: '57014', message: 'canceling statement' }), true)
  assert.equal(isStatementTimeout(new Error('canceling statement due to statement timeout')), true)
  assert.equal(isStatementTimeout(new Error('permission denied')), false)
})

test('reduces only timed-out batches and stops at a single-row minimum', () => {
  const timeout = new Error('canceling statement due to statement timeout')
  assert.equal(nextBatchSizeAfterTimeout(timeout, 20), 10)
  assert.equal(nextBatchSizeAfterTimeout(timeout, 10), 5)
  assert.equal(nextBatchSizeAfterTimeout(timeout, 5), 2)
  assert.equal(nextBatchSizeAfterTimeout(timeout, 2), 1)
  assert.equal(nextBatchSizeAfterTimeout(timeout, 1), null)
  assert.equal(nextBatchSizeAfterTimeout(new Error('validation failed'), 20), null)
})

test('preserves a configured minimum and does not retry invalid sizes', () => {
  const timeout = { code: '57014' }
  assert.equal(nextBatchSizeAfterTimeout(timeout, 25), 12)
  assert.equal(nextBatchSizeAfterTimeout(timeout, 7), 3)
  assert.equal(nextBatchSizeAfterTimeout(timeout, 3, 3), null)
  assert.equal(nextBatchSizeAfterTimeout(timeout, 5, 0), null)
})
