import test from 'node:test'
import assert from 'node:assert/strict'
import { diagnoseIndicator, calculateIndicatorResult } from '../lib/aureka/quality-results-engine.ts'

const profile = { id: 'p1', room_id: 7, code: '7.1', title: 'Kepatuhan', indicator_type: 'ratio', measurement_grain: 'monthly', target_text: '≥ 85%', target_operator: '>=', target_value: 85, schema_json: { measurement_type: 'ratio' } }
const row = (extra) => ({ room_id: 7, status: 'validated', record_date: '2026-03-10', core_data: { indicator_values: { '7.1': { numerator: 8, denominator: 10 } } }, ...extra })

test('setiap catatan gugur di satu alasan dan totalnya cocok dengan engine', () => {
  const rows = [
    row({}),
    row({ status: 'draft' }),
    row({ record_date: null }),
    row({ record_date: null, core_data: { record_date: '2026-04-02', indicator_values: { '7.1': { numerator: 1, denominator: 1 } } } }),
    row({ record_date: '2025-12-30' }),
    row({ core_data: { indicator_values: { '7.2': { numerator: 1, denominator: 1 } } } }),
    row({ core_data: { indicator_values: { '7.1': { numerator: 5, denominator: 0 } } } }),
    row({ room_id: 8 }),
  ]
  const d = diagnoseIndicator(profile, rows, 2026)
  assert.deepEqual([d.total, d.draft, d.noDate, d.otherYear, d.noValue, d.notCountable, d.invalidNumbers, d.counted], [7, 1, 1, 1, 1, 1, 1, 2])
  assert.equal(calculateIndicatorResult(profile, rows.filter((r) => r.room_id === 7), 2026).observations, d.counted)
  assert.ok(d.reasons.some((r) => /draf/.test(r)))
})

test('tanggal di core_data.record_date tetap terbaca', () => {
  const d = diagnoseIndicator(profile, [row({ record_date: null, core_data: { record_date: '2026-05-01', indicator_values: { '7.1': { numerator: 1, denominator: 2 } } } })], 2026)
  assert.equal(d.counted, 1)
})

test('profil tanpa jenis pengukuran menandai perlu dilengkapi, bukan angka salah', () => {
  const bare = { ...profile, schema_json: {} }
  const d = diagnoseIndicator(bare, [row({})], 2026)
  assert.equal(d.needsProfileSetup, 1)
  assert.ok(d.reasons.some((r) => /profil indikator belum lengkap/.test(r)))
})
