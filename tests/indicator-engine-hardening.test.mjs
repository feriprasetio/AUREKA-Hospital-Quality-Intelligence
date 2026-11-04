import test from 'node:test'
import assert from 'node:assert/strict'
import { compareToTarget, readTarget, resolveMeasurementKind } from '../lib/aureka/indicator-engine.ts'

test('target desimal Indonesia dengan grouping angka terbaca benar', () => {
  assert.deepEqual(readTarget({ target_text: '≥ 1.234,5' }), { value: 1234.5, operator: '>=' })
  assert.deepEqual(readTarget({ target_text: '≤ 95,5%' }), { value: 95.5, operator: '<=' })
  assert.deepEqual(readTarget({ target_text: '≥ 82,5%' }), { value: 82.5, operator: '>=' })
})

test('profil yang mendeklarasikan kolom numerator/denominator pada schema fields dianggap rasio', () => {
  assert.equal(resolveMeasurementKind({
    title: 'Indikator apa pun',
    schema_json: { fields: ['record_date', 'numerator', 'denominator'] },
  }), 'ratio')
})

test('operator ketat (<, >) toleran terhadap derau floating point secara simetris', () => {
  const less = { target_text: '< 90', target_operator: '<', target_value: 90 }
  assert.equal(compareToTarget(less, 89.99), true)
  assert.equal(compareToTarget(less, 90), false)
  assert.equal(compareToTarget(less, 90 - 5e-10), false) // dalam epsilon: dianggap sama dengan batas

  const greater = { target_text: '> 90', target_operator: '>', target_value: 90 }
  assert.equal(compareToTarget(greater, 90.01), true)
  assert.equal(compareToTarget(greater, 90), false)
  assert.equal(compareToTarget(greater, 90 + 5e-10), false)
})

test('operator longit (<=, >=) tetap berperilaku sama seperti sebelumnya', () => {
  const atMost = { target_text: '≤ 45 menit', target_operator: '<=', target_value: 45 }
  assert.equal(compareToTarget(atMost, 45), true)
  assert.equal(compareToTarget(atMost, 46), false)
  assert.equal(compareToTarget(atMost, 30), true)
})
