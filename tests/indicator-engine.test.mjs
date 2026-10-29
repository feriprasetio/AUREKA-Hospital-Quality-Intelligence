import test from 'node:test'
import assert from 'node:assert/strict'
import { compareToTarget, isWithinVisitWindow, readTarget, resolveMeasurementKind } from '../lib/aureka/indicator-engine.ts'

test('explicit measurement metadata takes precedence over legacy title heuristics', () => {
  assert.equal(resolveMeasurementKind({
    title: 'Waktu tanggap',
    schema_json: { input_type: 'numeric_target' },
  }), 'numeric')
  assert.equal(resolveMeasurementKind({
    title: 'Kepatuhan identifikasi',
    schema_json: { measurement_type: 'numerator_denominator' },
  }), 'ratio')
})

test('uses the active profile target and operator rather than a fixed response-time threshold', () => {
  const profile = { title: 'Waktu tanggap', target_text: '≤ 45 menit', target_operator: '<=', target_value: 45 }
  assert.equal(compareToTarget(profile, 45), true)
  assert.equal(compareToTarget(profile, 46), false)
  assert.equal(compareToTarget(profile, 30), true)
})

test('reads a target and comparison operator from metadata text when numeric value is absent', () => {
  assert.deepEqual(readTarget({ target_text: '≥ 82,5%' }), { value: 82.5, operator: '>=' })
  assert.equal(compareToTarget({ target_text: '≥ 82,5%' }, 82.5), true)
  assert.equal(compareToTarget({ target_text: '≥ 82,5%' }, 82.4), false)
})

test('does not invent a target when the profile has no usable target', () => {
  assert.equal(compareToTarget({ title: 'Indikator tanpa target' }, 30), null)
})

test('uses the declared visit window instead of a hard-coded clock interval', () => {
  const profile = { title: 'Jam visite', schema_json: { target_start_time: '07:00', target_end_time: '13:00' } }
  assert.equal(isWithinVisitWindow(profile, '07:00'), true)
  assert.equal(isWithinVisitWindow(profile, '13:00'), true)
  assert.equal(isWithinVisitWindow(profile, '06:59'), false)
  assert.equal(isWithinVisitWindow({ target_text: 'Jam visite 06.00–14.00' }, '14:01'), false)
  assert.equal(isWithinVisitWindow({ title: 'Jam visite tanpa target' }, '08:00'), null)
})
