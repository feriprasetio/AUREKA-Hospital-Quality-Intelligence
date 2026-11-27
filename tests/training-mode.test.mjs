import assert from 'node:assert/strict'
import test from 'node:test'
import { exitLegacyTrainingMode, isLegacyTrainingMode } from '../lib/aureka/training-mode.ts'

test('legacy training remains active until explicitly exited', () => {
  const values = new Map([['aureka-latihan', '1']])
  globalThis.window = {
    localStorage: {
      getItem: key => values.get(key),
      removeItem: key => values.delete(key),
    },
  }
  try {
    assert.equal(isLegacyTrainingMode(), true)
    exitLegacyTrainingMode()
    assert.equal(isLegacyTrainingMode(), false)
  } finally {
    delete globalThis.window
  }
  assert.equal(isLegacyTrainingMode(), false)
})
