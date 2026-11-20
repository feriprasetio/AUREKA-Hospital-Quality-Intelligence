export const REALCOST_COST_COMPONENTS = [
  { key: 'PROSEDUR_NON_BEDAH', label: 'Prosedur non-bedah', billingKey: 'procedure_amt' },
  { key: 'PROSEDUR_BEDAH', label: 'Prosedur bedah', billingKey: 'surgical_amt' },
  { key: 'KONSULTASI', label: 'Konsultasi', billingKey: 'consul_amt' },
  { key: 'TENAGA_AHLI', label: 'Tenaga ahli', billingKey: 'expert_amt' },
  { key: 'KEPERAWATAN', label: 'Keperawatan', billingKey: 'nursing_amt' },
  { key: 'PENUNJANG', label: 'Penunjang', billingKey: 'ancillary_amt' },
  { key: 'RADIOLOGI', label: 'Radiologi', billingKey: 'radiology_amt' },
  { key: 'LABORATORIUM', label: 'Laboratorium', billingKey: 'laboratory_amt' },
  { key: 'PELAYANAN_DARAH', label: 'Pelayanan darah', billingKey: 'blood_amt' },
  { key: 'REHABILITASI', label: 'Rehabilitasi', billingKey: 'rehab_amt' },
  { key: 'KAMAR_AKOMODASI', label: 'Kamar akomodasi', billingKey: 'room_amt' },
  { key: 'RAWAT_INTENSIF', label: 'Rawat intensif', billingKey: 'intensive_amt' },
  { key: 'OBAT', label: 'Obat', billingKey: 'drug_amt' },
  { key: 'ALKES', label: 'Alat kesehatan', billingKey: 'device_amt' },
  { key: 'BMHP', label: 'Bahan medis habis pakai', billingKey: 'consumable_amt' },
  { key: 'SEWA_ALAT', label: 'Sewa alat', billingKey: 'device_rent_amt' },
  { key: 'OBAT_KRONIS', label: 'Obat kronis', billingKey: 'drug_chronic_amt' },
  { key: 'OBAT_KEMO', label: 'Obat kemoterapi', billingKey: 'drug_chemo_amt' },
] as const

export type RealcostCostKey = (typeof REALCOST_COST_COMPONENTS)[number]['key']
export type RealcostCostMap = Record<RealcostCostKey, number>

export type RealcostEpisode = {
  id: string
  import_id?: string
  source_row: number
  episode_key_hash: string
  admission_date: string | null
  discharge_date: string
  class_code: string
  inacbg_code: string
  inacbg_description: string
  tariff_inacbg: number
  tarif_rs: number
  total_tarif: number
  tarif_poli_eks: number
  los: number
  icu_indicator: boolean
  icu_los: number
  vent_hour: number
  discharge_status: string
  diagnosis_codes: string[]
  procedure_codes: string[]
  cost_components: Partial<RealcostCostMap>
  billing_group: Record<string, number>
  billing_group_total_tarif_rs: number | null
  source_payload?: Record<string, unknown>
}

export type RealcostDashboard = {
  episode_count: number
  tarif_inacbg_total: number
  tarif_rs_total: number
  total_tarif_total: number
  tarif_gap_total: number
  tarif_gap_positive_count: number
  tarif_gap_negative_count: number
  tarif_gap_positive_total: number
  tarif_gap_negative_total: number
  average_tarif_rs: number
  average_tarif_inacbg: number
  median_tarif_rs: number
  p90_tarif_rs: number
  tarif_rs_per_los_day: number
  average_los: number
  median_los: number
  p90_los: number
  maximum_los: number
  long_stay_over_30: number
  icu_episode_count: number
  icu_episode_rate: number
  monthly: Array<{ month: string; episodes: number; tarif_rs: number; tarif_inacbg: number; gap: number }>
  cost_components: Array<{ code: string; label: string; total: number; share_pct: number }>
  class_distribution: Array<{ class_code: string; episodes: number; tarif_rs: number; tarif_inacbg: number; average_los: number }>
  top_inacbg: Array<{ code: string; description: string; episodes: number; tarif_rs: number; tarif_inacbg: number; gap: number; average_los: number }>
  top_diagnoses: Array<{ code: string; episodes: number }>
  top_procedures: Array<{ code: string; episodes: number }>
  discharge_status_distribution: Array<{ code: string; episodes: number }>
  reconciliation: {
    component_total_mismatch_count: number
    component_total_mismatch_amount: number
    c2_billing_group_mismatch_count: number
    c2_total_tarif_mismatch_count: number
    total_tarif_vs_package_mismatch_count: number
  }
}

function finite(value: unknown): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

function median(values: number[]): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const position = (sorted.length - 1) * p
  const lower = Math.floor(position)
  const upper = Math.ceil(position)
  if (lower === upper) return sorted[lower]
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower)
}

function monthOf(value: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value.slice(0, 7) : 'Tidak diketahui'
}

export function analyzeRealcostEpisodes(rows: RealcostEpisode[]): RealcostDashboard {
  const monthly = new Map<string, { episodes: number; tarif_rs: number; tarif_inacbg: number; gap: number }>()
  const classes = new Map<string, { episodes: number; tarif_rs: number; tarif_inacbg: number; los_total: number }>()
  const cbgs = new Map<string, { description: string; episodes: number; tarif_rs: number; tarif_inacbg: number; gap: number; los_total: number }>()
  const statuses = new Map<string, number>()
  const components = new Map<string, number>()
  const diagnoses = new Map<string, number>()
  const procedures = new Map<string, number>()
  const tarifRsValues: number[] = []
  const losValues: number[] = []
  let tarifRsTotal = 0
  let tarifInacbgTotal = 0
  let totalTarifTotal = 0
  let positiveCount = 0
  let negativeCount = 0
  let positiveTotal = 0
  let negativeTotal = 0
  let componentMismatchCount = 0
  let componentMismatchAmount = 0
  let billingMismatchCount = 0
  let c2TarifMismatchCount = 0
  let totalTarifMismatchCount = 0
  let icuCount = 0

  for (const row of rows) {
    const tarifRs = finite(row.tarif_rs)
    const tarifInacbg = finite(row.tariff_inacbg)
    const gap = tarifRs - tarifInacbg
    const los = Math.max(0, finite(row.los))
    tarifRsTotal += tarifRs
    tarifInacbgTotal += tarifInacbg
    tarifRsValues.push(tarifRs)
    totalTarifTotal += finite(row.total_tarif)
    losValues.push(los)
    if (row.icu_indicator) icuCount++

    if (gap > 0) { positiveCount++; positiveTotal += gap }
    else if (gap < 0) { negativeCount++; negativeTotal += gap }

    const month = monthOf(row.discharge_date)
    const m = monthly.get(month) ?? { episodes: 0, tarif_rs: 0, tarif_inacbg: 0, gap: 0 }
    m.episodes++
    m.tarif_rs += tarifRs
    m.tarif_inacbg += tarifInacbg
    m.gap += gap
    monthly.set(month, m)

    const classCode = row.class_code || 'Tidak diketahui'
    const c = classes.get(classCode) ?? { episodes: 0, tarif_rs: 0, tarif_inacbg: 0, los_total: 0 }
    c.episodes++
    c.tarif_rs += tarifRs
    c.tarif_inacbg += tarifInacbg
    c.los_total += los
    classes.set(classCode, c)

    const cbgCode = row.inacbg_code || 'Tidak diketahui'
    const cbg = cbgs.get(cbgCode) ?? { description: row.inacbg_description || '', episodes: 0, tarif_rs: 0, tarif_inacbg: 0, gap: 0, los_total: 0 }
    cbg.episodes++
    cbg.tarif_rs += tarifRs
    cbg.tarif_inacbg += tarifInacbg
    cbg.gap += gap
    cbg.los_total += los
    if (!cbg.description && row.inacbg_description) cbg.description = row.inacbg_description
    cbgs.set(cbgCode, cbg)

    for (const code of new Set(row.diagnosis_codes.map(value => String(value).trim()).filter(Boolean))) diagnoses.set(code, (diagnoses.get(code) ?? 0) + 1)
    for (const code of new Set(row.procedure_codes.map(value => String(value).trim()).filter(Boolean))) procedures.set(code, (procedures.get(code) ?? 0) + 1)

    const status = row.discharge_status || 'Tidak diketahui'
    statuses.set(status, (statuses.get(status) ?? 0) + 1)

    let componentTotal = 0
    let componentCount = 0
    for (const item of REALCOST_COST_COMPONENTS) {
      const amount = finite(row.cost_components[item.key])
      componentTotal += amount
      componentCount++
      components.set(item.key, (components.get(item.key) ?? 0) + amount)
      const billingAmount = row.billing_group[item.billingKey]
      if (billingAmount != null && Math.abs(finite(billingAmount) - amount) > 1) {
        billingMismatchCount++
      }
    }
    if (componentCount && Math.abs(componentTotal - tarifRs) > 1) {
      componentMismatchCount++
      componentMismatchAmount += componentTotal - tarifRs
    }
    if (row.billing_group_total_tarif_rs != null && Math.abs(finite(row.billing_group_total_tarif_rs) - tarifRs) > 1) {
      c2TarifMismatchCount++
    }
    if (Math.abs(finite(row.total_tarif) - (tarifInacbg + finite(row.tarif_poli_eks))) > 1) {
      totalTarifMismatchCount++
    }
  }

  const componentList = REALCOST_COST_COMPONENTS.map(item => ({
    code: item.key,
    label: item.label,
    total: components.get(item.key) ?? 0,
    share_pct: tarifRsTotal > 0 ? ((components.get(item.key) ?? 0) / tarifRsTotal) * 100 : 0,
  })).sort((a, b) => b.total - a.total)

  return {
    episode_count: rows.length,
    tarif_inacbg_total: tarifInacbgTotal,
    tarif_rs_total: tarifRsTotal,
    total_tarif_total: totalTarifTotal,
    tarif_gap_total: tarifRsTotal - tarifInacbgTotal,
    tarif_gap_positive_count: positiveCount,
    tarif_gap_negative_count: negativeCount,
    tarif_gap_positive_total: positiveTotal,
    tarif_gap_negative_total: negativeTotal,
    average_tarif_rs: rows.length ? tarifRsTotal / rows.length : 0,
    average_tarif_inacbg: rows.length ? tarifInacbgTotal / rows.length : 0,
    median_tarif_rs: median(tarifRsValues),
    p90_tarif_rs: percentile(tarifRsValues, 0.9),
    tarif_rs_per_los_day: losValues.reduce((a, b) => a + b, 0) > 0 ? tarifRsTotal / losValues.reduce((a, b) => a + b, 0) : 0,
    average_los: losValues.length ? losValues.reduce((a, b) => a + b, 0) / losValues.length : 0,
    median_los: median(losValues),
    p90_los: percentile(losValues, 0.9),
    maximum_los: losValues.length ? Math.max(...losValues) : 0,
    long_stay_over_30: losValues.filter(value => value > 30).length,
    icu_episode_count: icuCount,
    icu_episode_rate: rows.length ? (icuCount / rows.length) * 100 : 0,
    monthly: [...monthly.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, value]) => ({ month, ...value })),
    cost_components: componentList,
    class_distribution: [...classes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([class_code, value]) => ({
      class_code, episodes: value.episodes, tarif_rs: value.tarif_rs, tarif_inacbg: value.tarif_inacbg,
      average_los: value.episodes ? value.los_total / value.episodes : 0,
    })),
    top_inacbg: [...cbgs.entries()].sort((a, b) => b[1].episodes - a[1].episodes).slice(0, 15).map(([code, value]) => ({
      code, description: value.description, episodes: value.episodes, tarif_rs: value.tarif_rs,
      tarif_inacbg: value.tarif_inacbg, gap: value.gap, average_los: value.episodes ? value.los_total / value.episodes : 0,
    })),
    top_diagnoses: [...diagnoses.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20).map(([code, episodes]) => ({ code, episodes })),
    top_procedures: [...procedures.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 20).map(([code, episodes]) => ({ code, episodes })),
    discharge_status_distribution: [...statuses.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([code, episodes]) => ({ code, episodes })),
    reconciliation: {
      component_total_mismatch_count: componentMismatchCount,
      component_total_mismatch_amount: componentMismatchAmount,
      c2_billing_group_mismatch_count: billingMismatchCount,
      c2_total_tarif_mismatch_count: c2TarifMismatchCount,
      total_tarif_vs_package_mismatch_count: totalTarifMismatchCount,
    },
  }
}

export function compareRealcostEpisodesToDashboard(rows: RealcostEpisode[], dashboard: RealcostDashboard): boolean {
  const calculated = analyzeRealcostEpisodes(rows)
  return calculated.episode_count === dashboard.episode_count
    && Math.abs(calculated.tarif_rs_total - dashboard.tarif_rs_total) < 1
    && Math.abs(calculated.tarif_inacbg_total - dashboard.tarif_inacbg_total) < 1
}
