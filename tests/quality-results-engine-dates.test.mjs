import test from 'node:test'
import assert from 'node:assert/strict'
import { calculateIndicatorResult } from '../lib/aureka/quality-results-engine.ts'

function qualityRow(date, status, numerator, denominator) {
  return {
    room_id: 1,
    record_date: date,
    status,
    core_data: { indicator_values: { '1.1': { numerator, denominator } } },
  }
}

const profile = {
  id: 'p1',
  room_id: 1,
  code: '1.1',
  title: 'Kecepatan Respon',
  measurement_grain: 'daily_metric',
  numerator_definition: 'Respon tepat waktu',
  denominator_definition: 'Seluruh komplain',
  target_text: '≥ 80%',
  target_operator: '>=',
  target_value: 80,
}

test('tanggal rekam format Indonesia DD/MM/YYYY tidak bergeser zona waktu', () => {
  const result = calculateIndicatorResult(profile, [qualityRow('15/03/2026', 'validated', 4, 5)], 2026)
  assert.equal(result.observations, 1)
  assert.equal(result.monthly[2].numerator, 4)
  assert.equal(result.monthly[2].denominator, 5)
})

test('tanggal nama bulan Inggris tidak terpotong satu hari (regresi WIB UTC+7)', () => {
  const result = calculateIndicatorResult(profile, [qualityRow('March 15, 2026', 'validated', 4, 5)], 2026)
  assert.equal(result.observations, 1)
  assert.equal(result.monthly[2].numerator, 4)
  assert.equal(result.monthly[2].denominator, 5)
})

test('tanggal nama bulan Indonesia dipahami', () => {
  const result = calculateIndicatorResult(profile, [qualityRow('15 Maret 2026', 'validated', 2, 5)], 2026)
  assert.equal(result.observations, 1)
  assert.equal(result.monthly[2].denominator, 5)
})

test('tanggal ISO dengan waktu tetap pada tanggal kalendernya', () => {
  const result = calculateIndicatorResult(profile, [qualityRow('2026-03-15T23:30:00.000Z', 'validated', 5, 5)], 2026)
  assert.equal(result.monthly[2].denominator, 5)
})

test('tanggal dua digit tahun diperluas tanpa ditebak', () => {
  const result = calculateIndicatorResult(profile, [qualityRow('15/03/26', 'validated', 1, 2)], 2026)
  assert.equal(result.monthly[2].denominator, 2)
})

test('tanggal tak terparse diabaikan tanpa salah kelas bulan', () => {
  const result = calculateIndicatorResult(profile, [qualityRow('tanggal tidak jelas', 'validated', 4, 5)], 2026)
  assert.equal(result.observations, 0)
  assert.equal(result.annualDenominator, 0)
})

test('hasil indikator merekam versi engine dan versi profil', () => {
  const withVersion = { ...profile, version: 3 }
  const result = calculateIndicatorResult(withVersion, [qualityRow('2026-03-15', 'validated', 5, 5)], 2026)
  assert.equal(typeof result.engineVersion, 'string')
  assert.ok(result.engineVersion.length > 0)
  assert.equal(result.profileVersion, 3)
  const withoutVersion = calculateIndicatorResult(profile, [qualityRow('2026-03-15', 'validated', 5, 5)], 2026)
  assert.equal(withoutVersion.profileVersion, null)
})
