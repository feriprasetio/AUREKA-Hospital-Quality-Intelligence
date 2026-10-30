export type PharmacyServiceStream = 'Rawat Jalan' | 'Rawat Inap'

export type PharmacyRatioValue = {
  numerator?: number | null
  denominator?: number | null
  noncompliant?: number | null
}

export type PharmacyLogbookRow = {
  databaseStatus?: unknown
  formData?: Record<string, unknown>
  indicatorValues?: Record<string, PharmacyRatioValue | undefined>
}

export type PharmacyMetricAggregate = {
  numerator: number
  denominator: number
  noncompliant: number
  observations: number
  rate: number | null
}

/** Convert the workbook's High Alert non-compliance count to the master profile's compliance numerator. */
export function highAlertComplianceCounts(
  noncompliant: number | null | undefined,
  denominator: number | null | undefined,
): { numerator: number; denominator: number } | null {
  if (noncompliant == null || denominator == null) return null
  const bad = Number(noncompliant)
  const total = Number(denominator)
  if (!Number.isFinite(bad) || !Number.isFinite(total) || total <= 0 || bad < 0 || bad > total) return null
  return { numerator: total - bad, denominator: total }
}

/** Aggregate N and D first, then derive the percentage. Never average daily or stream percentages. */
export function aggregatePharmacyMetric(
  rows: PharmacyLogbookRow[],
  indicatorCode: string,
  serviceStream: PharmacyServiceStream,
): PharmacyMetricAggregate {
  let numerator = 0
  let denominator = 0
  let noncompliant = 0
  let observations = 0

  for (const row of rows) {
    const status = String(row.databaseStatus ?? '').toLowerCase()
    if (status !== 'ready' && status !== 'validated') continue
    if (String(row.formData?.['Alur layanan'] ?? '').trim() !== serviceStream) continue
    const value = row.indicatorValues?.[indicatorCode]
    if (!value || value.numerator == null || value.denominator == null) continue
    const n = Number(value.numerator)
    const d = Number(value.denominator)
    if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0 || n < 0 || n > d) continue

    numerator += n
    denominator += d
    const bad = indicatorCode === '5.3'
      ? (value.noncompliant == null ? d - n : Number(value.noncompliant))
      : 0
    if (Number.isFinite(bad) && bad >= 0 && bad <= d) noncompliant += bad
    observations += 1
  }

  return {
    numerator,
    denominator,
    noncompliant,
    observations,
    rate: denominator > 0 ? numerator / denominator * 100 : null,
  }
}

export function combinePharmacyMetric(
  outpatient: PharmacyMetricAggregate,
  inpatient: PharmacyMetricAggregate,
): PharmacyMetricAggregate {
  const numerator = outpatient.numerator + inpatient.numerator
  const denominator = outpatient.denominator + inpatient.denominator
  return {
    numerator,
    denominator,
    noncompliant: outpatient.noncompliant + inpatient.noncompliant,
    observations: outpatient.observations + inpatient.observations,
    rate: denominator > 0 ? numerator / denominator * 100 : null,
  }
}
