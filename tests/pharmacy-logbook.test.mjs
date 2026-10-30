import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregatePharmacyMetric,
  combinePharmacyMetric,
  highAlertComplianceCounts,
} from '../lib/aureka/pharmacy-logbook.ts'

test('combines Rawat Jalan and Rawat Inap by summing counts, not averaging percentages', () => {
  const rows = [
    { databaseStatus: 'ready', formData: { 'Alur layanan': 'Rawat Jalan' }, indicatorValues: { '5.2': { numerator: 1, denominator: 10 } } },
    { databaseStatus: 'validated', formData: { 'Alur layanan': 'Rawat Inap' }, indicatorValues: { '5.2': { numerator: 90, denominator: 100 } } },
  ]
  const rajal = aggregatePharmacyMetric(rows, '5.2', 'Rawat Jalan')
  const ranap = aggregatePharmacyMetric(rows, '5.2', 'Rawat Inap')
  const combined = combinePharmacyMetric(rajal, ranap)
  assert.equal(rajal.rate, 10)
  assert.equal(ranap.rate, 90)
  assert.equal(combined.numerator, 91)
  assert.equal(combined.denominator, 110)
  assert.equal(combined.rate, 91 / 110 * 100)
  assert.notEqual(combined.rate, (rajal.rate + ranap.rate) / 2)
})

test('excludes draft and reopened entries from the reportable combined metric', () => {
  const rows = [
    { databaseStatus: 'ready', formData: { 'Alur layanan': 'Rawat Jalan' }, indicatorValues: { '5.4': { numerator: 8, denominator: 10 } } },
    { databaseStatus: 'draft', formData: { 'Alur layanan': 'Rawat Jalan' }, indicatorValues: { '5.4': { numerator: 100, denominator: 100 } } },
    { databaseStatus: 'reopened', formData: { 'Alur layanan': 'Rawat Inap' }, indicatorValues: { '5.4': { numerator: 0, denominator: 100 } } },
  ]
  const rajal = aggregatePharmacyMetric(rows, '5.4', 'Rawat Jalan')
  const ranap = aggregatePharmacyMetric(rows, '5.4', 'Rawat Inap')
  const combined = combinePharmacyMetric(rajal, ranap)
  assert.equal(combined.numerator, 8)
  assert.equal(combined.denominator, 10)
  assert.equal(combined.observations, 1)
  assert.equal(combined.rate, 80)
})

test('transforms workbook High Alert non-compliance to master compliance numerator', () => {
  assert.deepEqual(highAlertComplianceCounts(3, 100), { numerator: 97, denominator: 100 })
  assert.deepEqual(highAlertComplianceCounts(0, 80), { numerator: 80, denominator: 80 })
  assert.equal(highAlertComplianceCounts(101, 100), null)
  assert.equal(highAlertComplianceCounts(1, 0), null)
  assert.equal(highAlertComplianceCounts(null, 100), null)
})

test('reports High Alert non-compliance separately while aggregating master compliance correctly', () => {
  const rows = [
    { databaseStatus: 'ready', formData: { 'Alur layanan': 'Rawat Jalan' }, indicatorValues: { '5.3': { numerator: 97, denominator: 100, noncompliant: 3 } } },
    { databaseStatus: 'validated', formData: { 'Alur layanan': 'Rawat Inap' }, indicatorValues: { '5.3': { numerator: 48, denominator: 50, noncompliant: 2 } } },
  ]
  const combined = combinePharmacyMetric(
    aggregatePharmacyMetric(rows, '5.3', 'Rawat Jalan'),
    aggregatePharmacyMetric(rows, '5.3', 'Rawat Inap'),
  )
  assert.equal(combined.numerator, 145)
  assert.equal(combined.denominator, 150)
  assert.equal(combined.noncompliant, 5)
  assert.equal(combined.rate, 145 / 150 * 100)
})
