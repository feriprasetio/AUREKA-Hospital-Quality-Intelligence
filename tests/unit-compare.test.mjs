import test from 'node:test'
import assert from 'node:assert/strict'
import { groupComparable, buildInmRows, titleKey } from '../lib/aureka/unit-compare.ts'

const monthly = (rate, n = 1) => Array.from({ length: 12 }, (_, i) => ({ month: i + 1, numerator: i < 2 ? rate : 0, denominator: i < 2 ? 100 : 0, rate: i < 2 ? rate : null, mean: null, targetAttainment: null, observations: i < 2 ? n : 0, readyRecords: 0, validatedRecords: i < 2 ? n : 0 }))
const res = (room, title, rate, extra = {}) => ({ profile: { room_id: room, code: room + '.1', title, target_text: '≥ 85%', target_operator: '>=', indicator_type: 'INM Indikator Nasional Mutu', ...extra }, kind: 'ratio', continuous: false, unit: '%', monthly: monthly(rate), annualRate: rate, annualMean: null, validatedRecords: 2, targetMet: rate >= 85 })
const name = (id) => 'Unit ' + id

test('judul dinormalisasi', () => {
  assert.equal(titleKey('Kepatuhan  Kebersihan-Tangan'), titleKey('kepatuhan kebersihan tangan'))
})

test('mengelompokkan indikator sama di ≥2 unit, terbaik dulu', () => {
  const groups = groupComparable([res(1, 'Kepatuhan Kebersihan Tangan', 80), res(2, 'kepatuhan kebersihan tangan', 95), res(3, 'Lain', 50)], name)
  assert.equal(groups.length, 1)
  assert.deepEqual(groups[0].entries.map((e) => e.room), ['Unit 2', 'Unit 1'])
})

test('target <= : nilai kecil lebih baik', () => {
  const g = groupComparable([res(1, 'Waktu', 10, { target_operator: '<=' }), res(2, 'Waktu', 5, { target_operator: '<=' })], name)
  assert.equal(g[0].entries[0].room, 'Unit 2')
})

test('baris INM per bulan berdata saja', () => {
  const rows = buildInmRows([res(1, 'Kepatuhan Kebersihan Tangan', 90), res(2, 'Bukan INM', 90, { indicator_type: 'IMP-Unit' })], 2026, name)
  assert.equal(rows.length, 2)
  assert.equal(rows[0].Bulan, 'Januari')
  assert.equal(rows[0].Numerator, 90)
})
