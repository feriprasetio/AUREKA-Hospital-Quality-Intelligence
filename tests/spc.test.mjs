import test from 'node:test'
import assert from 'node:assert/strict'
import { computeSpc } from '../lib/aureka/spc.ts'

const p = (month, numerator, denominator) => ({ month, numerator, denominator, value: denominator ? numerator / denominator * 100 : null })

test('p-chart: garis tengah = total N / total D, batas melebar saat n kecil', () => {
  const r = computeSpc([p(1, 90, 100), p(2, 92, 100), p(3, 88, 100), p(4, 9, 10), p(5, 91, 100)])
  assert.equal(r.method, 'p')
  assert.equal(r.center, Math.round((370 / 410) * 10000) / 100)
  const wideSpan = r.points[3].ucl - r.points[3].lcl
  const narrowSpan = r.points[0].ucl - r.points[0].lcl
  assert.ok(wideSpan > narrowSpan)
  assert.ok(r.points.every((pt) => pt.ucl <= 100 && pt.lcl >= 0))
})

test('menandai titik di luar batas', () => {
  const r = computeSpc([p(1, 95, 100), p(2, 94, 100), p(3, 96, 100), p(4, 95, 100), p(5, 60, 100), p(6, 95, 100)])
  assert.deepEqual(r.points.find((pt) => pt.month === 5).signals, ['luar-batas'])
  assert.match(r.verdict, /luar batas/)
})

test('XmR untuk nilai kontinu, dan sinyal tren 6 bulan', () => {
  const r = computeSpc([1, 2, 3, 4, 5, 6, 5].map((v, i) => ({ month: i + 1, value: v * 10 })))
  assert.equal(r.method, 'xmr')
  assert.ok(r.points.slice(0, 6).every((pt) => pt.signals.includes('tren')))
  assert.ok(!r.points[6].signals.includes('tren'))
})

test('pergeseran 8 bulan di satu sisi', () => {
  const vals = [50, 50, 50, 50, 60, 61, 62, 60, 61, 62, 60, 61]
  const r = computeSpc(vals.map((v, i) => ({ month: i + 1, value: v })))
  assert.ok(r.points.slice(4).every((pt) => pt.signals.includes('pergeseran')))
})

test('kurang dari 5 bulan: run chart dengan median, tanpa batas', () => {
  const r = computeSpc([p(1, 1, 2), p(2, 2, 2), { month: 3, value: null }])
  assert.equal(r.method, 'run')
  assert.equal(r.points.length, 2)
  assert.equal(r.points[0].ucl, null)
})
