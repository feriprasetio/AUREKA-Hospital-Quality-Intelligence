import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPharmacyImportRecords } from '../lib/aureka/pharmacy-excel-import.ts'

function day(date, serviceStream, rows, overrides = {}) {
  const specs = [
    ['5.2', 'Copy Resep ' + (serviceStream === 'Rawat Jalan' ? 'Rajal' : 'Ranap'), 10, 200],
    ['5.3', 'High Alert ' + (serviceStream === 'Rawat Jalan' ? 'Rajal' : 'Ranap'), 2, 20],
    ['5.4', 'Fornas ' + (serviceStream === 'Rawat Jalan' ? 'Rajal' : 'Ranap'), 180, 200],
    ['5.5', 'Forumkit ' + (serviceStream === 'Rawat Jalan' ? 'Rajal' : 'Ranap'), 200, 200],
  ]
  return specs.map(([indicatorCode, sourceSheet, numerator, denominator], index) => ({
    date, serviceStream, indicatorCode, sourceSheet, sourceRow: 11 + index,
    numerator, denominator, ...overrides[indicatorCode],
  }))
}

test('merges four indicator sheets by date and service stream; converts High Alert non-compliance', () => {
  const result = buildPharmacyImportRecords([
    ...day('2026-09-01', 'Rawat Jalan'),
    ...day('2026-09-01', 'Rawat Inap'),
  ])
  assert.equal(result.records.length, 2)
  assert.equal(result.excluded.length, 0)
  const outpatient = result.records.find(row => row.serviceStream === 'Rawat Jalan')
  assert.equal(outpatient.values['5.3'].sourceNumerator, 2)
  assert.equal(outpatient.values['5.3'].noncompliant, 2)
  assert.equal(outpatient.values['5.3'].numerator, 18)
  assert.equal(outpatient.values['5.3'].denominator, 20)
})

test('skips days with no sample across all four indicators', () => {
  const noSample = day('2026-09-02', 'Rawat Jalan', [], {
    '5.2': { numerator: 0, denominator: 0 },
    '5.3': { numerator: 0, denominator: 0 },
    '5.4': { numerator: 0, denominator: 0 },
    '5.5': { numerator: 0, denominator: 0 },
  })
  const result = buildPharmacyImportRecords(noSample)
  assert.equal(result.records.length, 0)
  assert.equal(result.excluded.length, 0)
  assert.equal(result.noObservationCount, 1)
})

test('excludes a day when a numerator exceeds its denominator', () => {
  const result = buildPharmacyImportRecords(day('2026-05-12', 'Rawat Inap', [], {
    '5.4': { numerator: 192, denominator: 188 },
  }))
  assert.equal(result.records.length, 0)
  assert.equal(result.excluded.length, 1)
  assert.match(result.excluded[0].reasons.join(' '), /melebihi denominator/)
})

test('excludes incomplete indicator sets without inferring zero values', () => {
  const items = day('2026-09-03', 'Rawat Jalan')
  items[2].numerator = null
  items[2].denominator = null
  const result = buildPharmacyImportRecords(items)
  assert.equal(result.records.length, 0)
  assert.equal(result.excluded.length, 1)
  assert.match(result.excluded[0].reasons.join(' '), /tidak memiliki denominator/)
})
