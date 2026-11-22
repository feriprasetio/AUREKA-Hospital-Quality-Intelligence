export type SpmCalculationConfig = {
  method?: 'ratio' | 'time_average' | 'score_to_percent' | 'manual_value' | 'no_event_rate'
  multiplier?: number
  scale_max?: number
  aggregation?: 'weighted_ratio' | 'weighted_mean' | 'monthly_average' | 'derived_ratio'
  result_unit?: string
}

export type SpmIndicator = {
  source_mode?: 'standalone' | 'quality_linked' | 'quality_denominator_linked'
  calculation_config?: SpmCalculationConfig | null
  target_operator?: string | null
  target_value?: number | string | null
  unit_of_measure?: string | null
}

export type SpmSourceSummary = {
  visite?: Array<{ month: number; numerator: number; denominator: number }>
  falls?: Array<{ month: number; denominator: number }>
}

export type SpmMonthlyResult = {
  month: number
  numerator: number | null
  denominator: number | null
  value: number | null
  target_met: boolean | null
  status: 'no_data' | 'invalid' | 'unassessed' | 'met' | 'not_met'
  source: 'manual' | 'quality'
  input: Record<string, unknown>
}

function finite(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null
  const normalized = typeof value === 'string' ? value.trim().replace(',', '.') : value
  const result = Number(normalized)
  return Number.isFinite(result) ? result : null
}

export function compareSpmTarget(value: number | null, operator: string | null | undefined, target: unknown): boolean | null {
  const threshold = finite(target)
  if (value == null || threshold == null) return null
  const op = operator || '='
  if (op === '≥' || op === '>=') return value >= threshold
  if (op === '>' ) return value > threshold
  if (op === '≤' || op === '<=') return value <= threshold
  if (op === '<') return value < threshold
  return Math.abs(value - threshold) < 1e-9
}

function result(
  indicator: SpmIndicator,
  month: number,
  input: Record<string, unknown>,
  numerator: number | null,
  denominator: number | null,
  value: number | null,
  source: 'manual' | 'quality',
  invalid = false,
): SpmMonthlyResult {
  const targetMet = compareSpmTarget(value, indicator.target_operator, indicator.target_value)
  const status: SpmMonthlyResult['status'] =
    invalid ? 'invalid' : value == null ? 'no_data' : targetMet == null ? 'unassessed' : targetMet ? 'met' : 'not_met'
  return { month, numerator, denominator, value, target_met: targetMet, status, source, input }
}

/** Calculate one SPM month. All calculations are deterministic and use a governed method, never eval(). */
export function calculateSpmMonthly(
  indicator: SpmIndicator,
  input: Record<string, unknown> | null | undefined,
  sourceSummary: SpmSourceSummary | null | undefined,
  month: number,
): SpmMonthlyResult {
  const values = input && typeof input === 'object' ? input : {}
  const config = indicator.calculation_config ?? {}
  const method = config.method ?? 'ratio'
  const multiplier = finite(config.multiplier) ?? 1

  if (indicator.source_mode === 'quality_linked') {
    const source = sourceSummary?.visite?.find(item => Number(item.month) === month)
    const denominator = finite(source?.denominator)
    const numerator = finite(source?.numerator)
    if (numerator == null || denominator == null) return result(indicator, month, values, numerator, denominator, null, 'quality')
    const invalid = numerator < 0 || denominator < 0 || numerator > denominator
    const value = !invalid && denominator > 0 ? numerator / denominator * multiplier : null
    return result(indicator, month, values, numerator, denominator, value, 'quality', invalid)
  }

  if (indicator.source_mode === 'quality_denominator_linked') {
    const source = sourceSummary?.falls?.find(item => Number(item.month) === month)
    const denominator = finite(source?.denominator)
    const numerator = finite(values.numerator)
    if (denominator == null || denominator <= 0 || numerator == null) {
      return result(indicator, month, values, null, denominator, null, 'quality')
    }
    if (numerator < 0 || numerator > denominator) {
      return result(indicator, month, values, null, denominator, null, 'quality', true)
    }
    return result(indicator, month, values, numerator, denominator, numerator / denominator * multiplier, 'quality')
  }

  if (method === 'no_event_rate') {
    const numerator = finite(values.numerator)
    const denominator = finite(values.denominator)
    if (numerator == null || denominator == null || denominator <= 0 || numerator < 0 || numerator > denominator) {
      return result(indicator, month, values, numerator, denominator, null, 'manual', numerator != null && denominator != null && numerator > denominator)
    }
    return result(indicator, month, values, numerator, denominator, numerator / denominator * multiplier, 'manual')
  }

  if (method === 'score_to_percent') {
    const score = finite(values.score_mean)
    const respondents = finite(values.respondents)
    const scaleMax = finite(config.scale_max) ?? 4
    if (score == null || respondents == null || respondents <= 0 || scaleMax <= 0 || score < 0 || score > scaleMax) {
      return result(indicator, month, values, null, respondents, null, 'manual', score != null && scaleMax > 0 && score > scaleMax)
    }
    const numerator = score * respondents
    const denominator = scaleMax * respondents
    return result(indicator, month, values, numerator, denominator, numerator / denominator * 100, 'manual')
  }

  if (method === 'manual_value') {
    const value = finite(values.value)
    return result(indicator, month, values, value, value == null ? null : 1, value, 'manual')
  }

  const numerator = finite(values.numerator)
  const denominator = finite(values.denominator)
  if (numerator == null || denominator == null || denominator <= 0 || numerator < 0) {
    return result(indicator, month, values, numerator, denominator, null, 'manual')
  }
  return result(indicator, month, values, numerator, denominator, numerator / denominator * multiplier, 'manual')
}

/** Pool numerator/denominator across months; never take an unweighted mean of monthly percentages. */
export function aggregateSpmMonths(
  indicator: SpmIndicator,
  monthly: SpmMonthlyResult[],
): Omit<SpmMonthlyResult, 'month' | 'input' | 'source'> {
  const valid = monthly.filter(item => item.value != null && item.status !== 'invalid')
  if (!valid.length) return {
    numerator: null, denominator: null, value: null, target_met: null,
    status: monthly.some(item => item.status === 'invalid') ? 'invalid' : 'no_data',
  }

  const config = indicator.calculation_config ?? {}
  const method = indicator.source_mode === 'quality_denominator_linked' ? 'no_event_rate' : config.method ?? 'ratio'
  let numerator: number | null = null
  let denominator: number | null = null
  let value: number | null = null

  const aggregation = config.aggregation ?? (method === 'manual_value' ? 'monthly_average' : 'weighted_ratio')
  if (aggregation === 'monthly_average' || method === 'manual_value') {
    value = valid.reduce((sum, item) => sum + (item.value ?? 0), 0) / valid.length
    numerator = value
    denominator = valid.length
  } else {
    const numeratorValues = valid.map(item => item.numerator).filter((n): n is number => n != null)
    const denominatorValues = valid.map(item => item.denominator).filter((n): n is number => n != null)
    numerator = numeratorValues.reduce((sum, n) => sum + n, 0)
    denominator = denominatorValues.reduce((sum, n) => sum + n, 0)
    if (denominator > 0) {
      const multiplier = method === 'score_to_percent' ? 100 : finite(config.multiplier) ?? 1
      value = numerator / denominator * multiplier
    }
  }

  const targetMet = compareSpmTarget(value, indicator.target_operator, indicator.target_value)
  return {
    numerator,
    denominator,
    value,
    target_met: targetMet,
    status: value == null ? 'no_data' : targetMet == null ? 'unassessed' : targetMet ? 'met' : 'not_met',
  }
}
