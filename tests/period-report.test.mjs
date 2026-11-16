import test from 'node:test'
import assert from 'node:assert/strict'
import { buildPeriodReportHtml, buildMonthlyReportHtml, periodMonths } from '../lib/report/monthly-report.ts'

const summary = {
  quality: { active_indicators: 3, records: 30, validated: 20, validation_rate: 66.7, monthly: [{ month: 1, total: 5, validated: 4 }, { month: 2, total: 7, validated: 3 }, { month: 4, total: 9 }], categories: [] },
  clinical: { episodes: 0, validated_episodes: 0, clinical_pathway_audits: 0, clinical_death_audits: 0, monthly: [] },
  incidents: { total: 2, open: 1, closed: 1, monthly: [{ month: 3, total: 2 }] },
  risk: { total: 0, very_high: 0, open: 0, monthly: [], levels: [], categories: [] },
  program: { recommendations: 0, actions: 0, open_actions: 0, overdue_actions: 0, completed_actions: 0 },
}

test('bulan triwulan', () => {
  assert.deepEqual(periodMonths({ kind: 'quarter', quarter: 2 }), [4, 5, 6])
  assert.equal(periodMonths({ kind: 'year' }).length, 12)
})

test('laporan triwulan menjumlah 3 bulan dan menandai ruangan belum lengkap', () => {
  const html = buildPeriodReportHtml({ year: 2026, period: { kind: 'quarter', quarter: 1 }, scope: 'RS', summary, rooms: [{ name: 'IGD', months: [1, 2, 3] }, { name: 'ICU', months: [1] }], preparedBy: 'x' })
  assert.match(html, /Laporan Triwulan Mutu/)
  assert.match(html, /Triwulan I 2026/)
  assert.match(html, /<b>12<\/b>/) // catatan indikator Jan+Feb+Mar
  assert.match(html, /ICU <span class="muted">1\/3<\/span>/)
  assert.doesNotMatch(html, /<li>IGD/)
})

test('pembungkus bulanan tetap jalan', () => {
  const html = buildMonthlyReportHtml({ year: 2026, month: 2, scope: 'RS', summary, rooms: [{ name: 'IGD', reported: true }], preparedBy: 'x' })
  assert.match(html, /Laporan Bulanan Mutu/)
  assert.match(html, /Seluruh ruangan sudah mengisi logbook/)
})
