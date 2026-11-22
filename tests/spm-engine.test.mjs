import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateSpmMonthly, aggregateSpmMonths } from '../lib/aureka/spm-engine.ts'

test('SPM standalone ratios pool numerator and denominator and compare to fractional targets', () => {
  const indicator = {
    source_mode: 'standalone',
    calculation_config: { method: 'ratio', multiplier: 1 },
    target_operator: '≤',
    target_value: 0.015,
  }
  const jan = calculateSpmMonthly(indicator, { numerator: 1, denominator: 100 }, null, 1)
  const feb = calculateSpmMonthly(indicator, { numerator: 2, denominator: 300 }, null, 2)
  assert.equal(jan.value, 0.01)
  assert.equal(feb.value, 2 / 300)
  const annual = aggregateSpmMonths(indicator, [jan, feb])
  assert.equal(annual.numerator, 3)
  assert.equal(annual.denominator, 400)
  assert.equal(annual.value, 0.0075)
  assert.equal(annual.target_met, true)
})

test('SPM patient-fall denominator is sourced from quality episodes while numerator is entered manually', () => {
  const indicator = {
    source_mode: 'quality_denominator_linked',
    calculation_config: { method: 'no_event_rate', multiplier: 1 },
    target_operator: '=',
    target_value: 1,
  }
  const month = calculateSpmMonthly(
    indicator,
    { numerator: 125 },
    { falls: [{ month: 11, denominator: 125 }] },
    11,
  )
  assert.equal(month.numerator, 125)
  assert.equal(month.denominator, 125)
  assert.equal(month.value, 1)
  assert.equal(month.target_met, true)
  const withEvent = calculateSpmMonthly(
    indicator,
    { numerator: 124 },
    { falls: [{ month: 11, denominator: 125 }] },
    11,
  )
  assert.equal(withEvent.numerator, 124)
  assert.equal(withEvent.value, 124 / 125)
  assert.equal(withEvent.target_met, false)
})

test('SPM never converts missing linked denominator into a false 100 percent', () => {
  const indicator = { source_mode: 'quality_denominator_linked', calculation_config: { method: 'no_event_rate' }, target_operator: '=', target_value: 1 }
  const month = calculateSpmMonthly(indicator, { numerator: 0 }, { falls: [{ month: 1, denominator: 0 }] }, 1)
  assert.equal(month.value, null)
  assert.equal(month.status, 'no_data')
})

test('SPM rejects a manually entered numerator larger than the source denominator', () => {
  const indicator = { source_mode: 'quality_denominator_linked', calculation_config: { method: 'no_event_rate' }, target_operator: '=', target_value: 1 }
  const month = calculateSpmMonthly(indicator, { numerator: 7 }, { falls: [{ month: 2, denominator: 3 }] }, 2)
  assert.equal(month.value, null)
  assert.equal(month.status, 'invalid')
})

test('SPM score calculations convert a four-point scale and aggregate with respondent weights', () => {
  const indicator = { source_mode: 'standalone', calculation_config: { method: 'score_to_percent', scale_max: 4, multiplier: 100 }, target_operator: '≥', target_value: 80 }
  const jan = calculateSpmMonthly(indicator, { score_mean: 3.2, respondents: 50 }, null, 1)
  const feb = calculateSpmMonthly(indicator, { score_mean: 3.6, respondents: 10 }, null, 2)
  assert.equal(jan.value, 80)
  assert.equal(feb.value, 90)
  const annual = aggregateSpmMonths(indicator, [jan, feb])
  assert.equal(annual.numerator, 196)
  assert.equal(annual.denominator, 240)
  assert.ok(Math.abs((annual.value ?? 0) - 81.66666666666667) < 1e-9)
})


test('SPM distinguishes unavailable sources, measured zero, and a result without a configured target', () => {
  const indicator = { source_mode: 'quality_linked', calculation_config: { method: 'ratio' } }
  const source = { visite: [{ month: 1, denominator: 10 }, { month: 2, numerator: 0, denominator: 10 }] }
  const missing = calculateSpmMonthly(indicator, {}, source, 1)
  const zero = calculateSpmMonthly(indicator, {}, source, 2)
  assert.equal(missing.numerator, null)
  assert.equal(missing.status, 'no_data')
  assert.equal(zero.value, 0)
  assert.equal(zero.status, 'unassessed')
  assert.equal(aggregateSpmMonths(indicator, [missing, zero]).status, 'unassessed')
})

test('SPM keeps an all-invalid year distinct from a year without measurements', () => {
  const indicator = { source_mode: 'quality_linked', calculation_config: { method: 'ratio' } }
  const invalid = calculateSpmMonthly(indicator, {}, { visite: [{ month: 1, numerator: 12, denominator: 10 }] }, 1)
  assert.equal(invalid.status, 'invalid')
  assert.equal(aggregateSpmMonths(indicator, [invalid]).status, 'invalid')
})
