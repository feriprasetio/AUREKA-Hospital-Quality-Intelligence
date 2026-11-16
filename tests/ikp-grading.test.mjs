import test from 'node:test'
import assert from 'node:assert/strict'
import { gradeIncident, likelihoodScore, impactScore, IMPACT_OPTIONS } from '../lib/patient-safety/grading.ts'

const D4 = ['Sangat Jarang (lebih dari 5 tahun baru 1 kejadian)', 'Jarang (1 kejadian dalam 2 sampai 5 tahun terakhir)', 'Mungkin (1 kejadian dalam 1 sampai 2 tahun terakhir)', 'Sering (beberapa kejadian dalam setahun)', 'Sangat Sering (hampir setiap bulan ada kejadian)']

test('membaca skor probabilitas tanpa tertukar sangat jarang / jarang', () => {
  assert.deepEqual(D4.map(likelihoodScore), [1, 2, 3, 4, 5])
  assert.deepEqual(IMPACT_OPTIONS.map(impactScore), [1, 2, 3, 4, 5])
})

test('matriks KKPRS: sudut-sudut dan sel tengah', () => {
  const g = (l, i) => gradeIncident({ D4: D4[l - 1], D7: IMPACT_OPTIONS[i - 1] })?.label
  assert.equal(g(1, 1), 'Biru')
  assert.equal(g(1, 3), 'Hijau')
  assert.equal(g(2, 4), 'Kuning')
  assert.equal(g(3, 3), 'Kuning')
  assert.equal(g(3, 4), 'Merah')
  assert.equal(g(5, 1), 'Hijau')
  assert.equal(g(5, 5), 'Merah')
})

test('sentinel selalu merah; data kurang menghasilkan null', () => {
  assert.equal(gradeIncident({ A7: 'Kejadian Sentinel' })?.label, 'Merah')
  assert.equal(gradeIncident({ D4: D4[0] }), null)
  assert.equal(gradeIncident({}), null)
})
