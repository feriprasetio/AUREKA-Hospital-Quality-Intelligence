import test from 'node:test'
import assert from 'node:assert/strict'
import { analyzeRealcostEpisodes, REALCOST_COST_COMPONENTS, type RealcostEpisode } from '../lib/aureka/realcost-engine.ts'

function episode(overrides: Partial<RealcostEpisode> = {}): RealcostEpisode {
  const costs = Object.fromEntries(REALCOST_COST_COMPONENTS.map(item => [item.key, 0]))
  costs.KAMAR_AKOMODASI = 60
  costs.OBAT = 40
  const billing = Object.fromEntries(REALCOST_COST_COMPONENTS.map(item => [item.billingKey, costs[item.key]]))
  return {
    id: 'episode-1', source_row: 2, episode_key_hash: 'hash-1',
    admission_date: '2025-01-01', discharge_date: '2025-01-03',
    class_code: '3', inacbg_code: 'A-4-10-I', inacbg_description: 'Contoh',
    tariff_inacbg: 80, tarif_rs: 100, total_tarif: 80, tarif_poli_eks: 0,
    los: 2, icu_indicator: false, icu_los: 0, vent_hour: 0, discharge_status: '1',
    diagnosis_codes: ['A00.1'], procedure_codes: [], cost_components: costs,
    billing_group: billing, billing_group_total_tarif_rs: 100, ...overrides,
  }
}

test('engine reconciles cost components and billing-group values independently', () => {
  const result = analyzeRealcostEpisodes([episode()])
  assert.equal(result.episode_count, 1)
  assert.equal(result.tarif_rs_total, 100)
  assert.equal(result.tarif_inacbg_total, 80)
  assert.equal(result.tarif_gap_total, 20)
  assert.equal(result.reconciliation.component_total_mismatch_count, 0)
  assert.equal(result.reconciliation.c2_billing_group_mismatch_count, 0)
  assert.equal(result.reconciliation.c2_total_tarif_mismatch_count, 0)
})

test('tariff difference is directionally separated and not labelled as financial loss', () => {
  const result = analyzeRealcostEpisodes([
    episode(),
    episode({ id: 'episode-2', episode_key_hash: 'hash-2', tariff_inacbg: 120, tarif_rs: 100 }),
  ])
  assert.equal(result.tarif_gap_positive_count, 1)
  assert.equal(result.tarif_gap_negative_count, 1)
  assert.equal(result.tarif_gap_total, 0)
  assert.equal(result.tarif_gap_positive_total, 20)
  assert.equal(result.tarif_gap_negative_total, -20)
})

test('total tariff-package exception is retained as a separate control', () => {
  const result = analyzeRealcostEpisodes([episode({ total_tarif: 150, tarif_inacbg: 80, tarif_poli_eks: 0 })])
  assert.equal(result.reconciliation.total_tarif_vs_package_mismatch_count, 1)
})

test('component reconciliation flags a row when component sum differs from TARIF_RS', () => {
  const result = analyzeRealcostEpisodes([episode({ cost_components: { KAMAR_AKOMODASI: 61, OBAT: 40 } })])
  assert.equal(result.reconciliation.component_total_mismatch_count, 1)
  assert.equal(result.reconciliation.component_total_mismatch_amount, 1)
})

test('monthly and CBG summaries are reproducible and retain encounter-level denominators', () => {
  const result = analyzeRealcostEpisodes([
    episode(),
    episode({ id: 'episode-2', episode_key_hash: 'hash-2', discharge_date: '2025-02-01', inacbg_code: 'A-4-10-I', procedure_codes: ['PROC01'] }),
  ])
  assert.equal(result.monthly.length, 2)
  assert.equal(result.monthly[0].episodes, 1)
  assert.equal(result.top_inacbg[0].episodes, 2)
  assert.equal(result.median_los, 2)
  assert.equal(result.median_tarif_rs, 100)
  assert.equal(result.p90_tarif_rs, 100)
  assert.equal(result.tarif_rs_per_los_day, 50)
  assert.equal(result.top_diagnoses[0].code, 'A00.1')
  assert.equal(result.top_diagnoses[0].episodes, 2)
  assert.equal(result.top_procedures[0].code, 'PROC01')
  assert.equal(result.top_procedures[0].episodes, 2)
})
