import {
  compareToTarget,
  isWithinVisitWindow,
  resolveMeasurementKind,
  type MeasurementKind,
} from './indicator-engine.ts'

export type ResultRecord = {
  id?: string
  room_id?: number | null
  record_date?: string | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  core_data?: Record<string, any> | null
}

export type IndicatorProfileForResults = Record<string, any> & {
  id?: string
  room_id?: number
  code?: string
  title?: string
  target_text?: string | null
  target_operator?: string | null
  target_value?: number | string | null
  unit_of_measure?: string | null
  measurement_grain?: string | null
  schema_json?: Record<string, any> | null
  options_json?: Array<Record<string, any>>
}

export type MonthlyIndicatorResult = {
  month: number
  numerator: number
  denominator: number
  rate: number | null
  mean: number | null
  targetAttainment: number | null
  observations: number
  readyRecords: number
  validatedRecords: number
}

export type IndicatorResult = {
  profile: IndicatorProfileForResults
  kind: MeasurementKind
  continuous: boolean
  unit: string
  monthly: MonthlyIndicatorResult[]
  annualNumerator: number
  annualDenominator: number
  annualRate: number | null
  annualMean: number | null
  annualTargetAttainment: number | null
  monthlyMeanRate: number | null
  observations: number
  readyRecords: number
  validatedRecords: number
  latestInputAt: string | null
  targetMet: boolean | null
}

type MeasurementObservation = {
  month: number
  numerator: number
  denominator: number
  value: number | null
  targetMet: boolean | null
  inputAt: string | null
}

function finiteNumber(value: unknown): number | null {
  if (value == null || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'))
  return Number.isFinite(parsed) ? parsed : null
}

function round2(value: number | null): number | null {
  return value == null ? null : Math.round(value * 100) / 100
}

function safeDate(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text
  if (/^\d{4}-\d{2}-\d{2}T/.test(text)) return text.slice(0, 10)
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10)
}

function recordDate(row: ResultRecord): string | null {
  const core = row.core_data ?? {}
  const form = core.form_fields ?? core.form_data ?? {}
  const candidates = [
    row.record_date,
    core.record_date,
    core.admission_at,
    form['Tanggal pengamatan'],
    form['Tanggal Masuk'],
    form['Tanggal Audit'],
    form['Tanggal Aduan'],
    form['Tanggal Dilayani'],
    form['Tanggal Permintaan'],
  ]
  for (const value of candidates) {
    const parsed = safeDate(value)
    if (parsed) return parsed
  }
  return null
}

function clockMinutes(value: unknown): number | null {
  const match = String(value ?? '').trim().match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hours = Number(match[1])
  const minutes = Number(match[2])
  return hours >= 0 && hours < 24 && minutes >= 0 && minutes < 60 ? hours * 60 + minutes : null
}

function durationBetween(start: unknown, end: unknown): number | null {
  const a = clockMinutes(start)
  const b = clockMinutes(end)
  if (a == null || b == null) return null
  return b >= a ? b - a : b + 1440 - a
}

function findOption(profile: IndicatorProfileForResults, response: Record<string, any>): Record<string, any> | null {
  const options = Array.isArray(profile.options_json) ? profile.options_json : []
  if (!options.length) return null
  const answer = String(response.answer ?? '').trim()
  if (answer) {
    const exact = options.find((option) => String(option.label ?? '').trim() === answer)
    if (exact) return exact
  }
  const code = finiteNumber(response.code)
  if (code == null) return null
  const matching = options.filter((option) => finiteNumber(option.code) === code)
  return matching.length === 1 ? matching[0] : null
}

function extractObservation(
  profile: IndicatorProfileForResults,
  row: ResultRecord,
  month: number,
): MeasurementObservation | null {
  const core = row.core_data ?? {}
  const values = core.indicator_values ?? {}
  const response = values[String(profile.code ?? '')] ?? values[String(profile.id ?? '')]
  if (!response || typeof response !== 'object') return null

  const kind = resolveMeasurementKind(profile)
  const inputAt = row.created_at ?? row.updated_at ?? null
  const numerator = finiteNumber(response.numerator)
  const denominator = finiteNumber(response.denominator)

  if (kind === 'ratio') {
    if (numerator == null || denominator == null || denominator <= 0 || numerator < 0 || numerator > denominator) return null
    return { month, numerator, denominator, value: null, targetMet: null, inputAt }
  }

  if (kind === 'visit') {
    const time = String(response.time ?? '')
    const within = isWithinVisitWindow(profile, time)
    if (within == null) return null
    return { month, numerator: within ? 1 : 0, denominator: 1, value: null, targetMet: within, inputAt }
  }

  if (kind === 'door') {
    const duration = durationBetween(response.start, response.end)
    if (duration == null) return null
    return { month, numerator: 0, denominator: 1, value: duration, targetMet: compareToTarget(profile, duration, '<='), inputAt }
  }

  if (kind === 'minutes') {
    const duration = finiteNumber(response.minutes)
    if (duration == null || duration < 0) return null
    return { month, numerator: 0, denominator: 1, value: duration, targetMet: compareToTarget(profile, duration, '<='), inputAt }
  }

  if (kind === 'numeric') {
    const value = finiteNumber(response.value)
    if (value == null) return null
    return { month, numerator: 0, denominator: 1, value, targetMet: compareToTarget(profile, value), inputAt }
  }

  const option = findOption(profile, response)
  if (option) {
    if (option.denominator === false || typeof option.numerator !== 'boolean') return null
    return { month, numerator: option.numerator ? 1 : 0, denominator: 1, value: null, targetMet: null, inputAt }
  }

  if (kind === 'occurrence') {
    const occurrence = String(response.occurrence ?? '').trim().toLowerCase()
    if (occurrence === 'terjadi' || occurrence === 'ya' || occurrence === 'ada') {
      return { month, numerator: 1, denominator: 1, value: null, targetMet: null, inputAt }
    }
    if (occurrence === 'tidak terjadi' || occurrence === 'tidak' || occurrence === 'nihil' || occurrence === 'tidak ada') {
      return { month, numerator: 0, denominator: 1, value: null, targetMet: null, inputAt }
    }
  }

  return null
}

function emptyMonthly(month: number): MonthlyIndicatorResult {
  return { month, numerator: 0, denominator: 0, rate: null, mean: null, targetAttainment: null, observations: 0, readyRecords: 0, validatedRecords: 0 }
}

export function calculateIndicatorResult(
  profile: IndicatorProfileForResults,
  rows: ResultRecord[],
  year: number,
): IndicatorResult {
  const kind = resolveMeasurementKind(profile)
  const continuous = kind === 'door' || kind === 'minutes' || kind === 'numeric'
  const accumulators = Array.from({ length: 12 }, (_, index) => ({
    month: index + 1,
    numerator: 0,
    denominator: 0,
    values: [] as number[],
    targetMet: 0,
    targetDenominator: 0,
    observations: 0,
    readyRecords: 0,
    validatedRecords: 0,
  }))
  let readyRecords = 0
  let validatedRecords = 0
  let latestInputAt: string | null = null

  for (const row of rows) {
    const status = String(row.status ?? '').toLowerCase()
    if (status !== 'ready' && status !== 'validated') continue
    const date = recordDate(row)
    if (!date || Number(date.slice(0, 4)) !== year) continue
    const observation = extractObservation(profile, row, Number(date.slice(5, 7)))
    if (!observation) continue
    const bucket = accumulators[observation.month - 1]
    bucket.observations += 1
    if (status === 'validated' || status === 'ready') {
      bucket.validatedRecords += 1
      validatedRecords += 1
      bucket.numerator += observation.numerator
      bucket.denominator += observation.denominator
      if (observation.value != null) bucket.values.push(observation.value)
      if (observation.targetMet != null) {
        bucket.targetDenominator += 1
        if (observation.targetMet) bucket.targetMet += 1
      }
    } else {
      bucket.readyRecords += 1
      readyRecords += 1
    }
    if (observation.inputAt && (!latestInputAt || observation.inputAt > latestInputAt)) latestInputAt = observation.inputAt
  }

  const monthly = accumulators.map((bucket) => {
    const mean = bucket.values.length ? bucket.values.reduce((sum, value) => sum + value, 0) / bucket.values.length : null
    const targetAttainment = bucket.targetDenominator ? (bucket.targetMet / bucket.targetDenominator) * 100 : null
    const rate = continuous
      ? targetAttainment
      : bucket.denominator > 0 ? (bucket.numerator / bucket.denominator) * 100 : null
    return {
      month: bucket.month,
      numerator: bucket.numerator,
      denominator: bucket.denominator,
      rate: round2(rate),
      mean: round2(mean),
      targetAttainment: round2(targetAttainment),
      observations: bucket.observations,
      readyRecords: bucket.readyRecords,
      validatedRecords: bucket.validatedRecords,
    }
  })

  const allObservations = accumulators.flatMap((bucket) => bucket.values)
  const annualNumerator = accumulators.reduce((sum, bucket) => sum + bucket.numerator, 0)
  const annualDenominator = accumulators.reduce((sum, bucket) => sum + bucket.denominator, 0)
  const targetCount = accumulators.reduce((sum, bucket) => sum + bucket.targetMet, 0)
  const targetDenominator = accumulators.reduce((sum, bucket) => sum + bucket.targetDenominator, 0)
  const annualMean = allObservations.length
    ? allObservations.reduce((sum, value) => sum + value, 0) / allObservations.length
    : null
  const annualRate = continuous
    ? (targetDenominator ? (targetCount / targetDenominator) * 100 : null)
    : (annualDenominator ? (annualNumerator / annualDenominator) * 100 : null)
  const assessedValue = continuous ? annualMean : annualRate

  return {
    profile,
    kind,
    continuous,
    unit: String(profile.unit_of_measure ?? ''),
    monthly,
    annualNumerator,
    annualDenominator,
    annualRate: round2(annualRate),
    annualMean: round2(annualMean),
    annualTargetAttainment: targetDenominator ? round2((targetCount / targetDenominator) * 100) : null,
    monthlyMeanRate: (() => {
      const rates = monthly.map((item) => item.rate).filter((value): value is number => value != null)
      return rates.length ? round2(rates.reduce((sum, value) => sum + value, 0) / rates.length) : null
    })(),
    observations: accumulators.reduce((sum, bucket) => sum + bucket.observations, 0),
    readyRecords,
    validatedRecords,
    latestInputAt,
    targetMet: assessedValue == null ? null : compareToTarget(profile, assessedValue, kind === 'door' || kind === 'minutes' ? '<=' : '='),
  }
}

function numericFrom(source: any, fallback: number | null = null): number | null {
  const value = finiteNumber(source)
  return value == null ? fallback : value
}

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

function quantileNearestRank(values: number[], probability: number): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.max(0, Math.min(sorted.length - 1, Math.ceil(probability * sorted.length) - 1))
  return sorted[index]
}

export type ClinicalPathwayRow = {
  room_id?: number | null
  admission_date?: string | null
  created_at?: string | null
  updated_at?: string | null
  status?: string | null
  template_code?: string | null
  template_name?: string | null
  template_snapshot?: Record<string, any> | null
  selected_items_json?: Record<string, boolean> | null
  additional_phases_json?: string[] | null
  inclusion_json?: Record<string, any> | null
  answers_json?: Record<string, any> | null
  variations_json?: Record<string, any> | null
  calculation_json?: Record<string, any> | null
}

export type PathwayAuditMetrics = {
  expected: number
  filled: number
  done: number
  notDone: number
  notApplicable: number
  evaluation: number
  completionPct: number | null
  compliancePct: number | null
  inclusionReady: boolean
  included: boolean
  sectionDPass: boolean
  variationCount: number
  targetPct: number
  completionThresholdPct: number
  targetMet: boolean | null
}

export function calculatePathwayAuditMetrics(row: ClinicalPathwayRow): PathwayAuditMetrics {
  const template = row.template_snapshot ?? {}
  const items = Array.isArray(template.items) ? template.items : []
  const selected = row.selected_items_json ?? {}
  const answers = row.answers_json ?? {}
  const activePhases = new Set(Array.isArray(row.additional_phases_json) ? row.additional_phases_json : [])
  let expected = 0
  let filled = 0
  let done = 0
  let notDone = 0
  let notApplicable = 0

  for (const item of items) {
    if (selected[item.id] !== true) continue
    const scheduled = Array.isArray(item.schedule) ? item.schedule : []
    const cells = scheduled
      .filter((schedule: any) => schedule.policy !== 'not_scheduled')
      .map((schedule: any) => schedule.day)
    for (const day of cells) {
      expected += 1
      const status = answers[item.id]?.[day]?.status
      if (status === 'done' || status === 'not_done' || status === 'not_applicable') {
        filled += 1
        if (status === 'done') done += 1
        else if (status === 'not_done') notDone += 1
        else notApplicable += 1
      }
    }
    for (const phase of activePhases) {
      expected += 1
      const status = answers[item.id]?.[phase]?.status
      if (status === 'done' || status === 'not_done' || status === 'not_applicable') {
        filled += 1
        if (status === 'done') done += 1
        else if (status === 'not_done') notDone += 1
        else notApplicable += 1
      }
    }
  }

  const evaluation = done + notDone
  const scoring = template.scoring_rules ?? {}
  const criteria = Array.isArray(scoring.inclusion_criteria) ? scoring.inclusion_criteria : []
  const inclusion = row.inclusion_json ?? {}
  const inclusionReady = criteria.every((criterion: any) => typeof inclusion[criterion.id] === 'boolean')
  const included = inclusionReady && criteria.every(
    (criterion: any) => inclusion[criterion.id] === (criterion.expected !== false),
  )
  const variations = Array.isArray(row.variations_json?.items) ? row.variations_json.items : []
  const variationsReviewed = row.variations_json?.reviewed === true
  const variationRequired = scoring.variation_required !== false
  const variationComplete = !variationRequired || (
    variationsReviewed && variations.every((variation: any) =>
      !!variation.date && !!String(variation.variation ?? '').trim() &&
      !!String(variation.reason ?? '').trim() && !!String(variation.justification ?? '').trim(),
    )
  )
  const completionThresholdPct = numericFrom(scoring.completion_threshold_pct, 85) ?? 85
  const targetPct = numericFrom(scoring.compliance_target_pct, 100) ?? 100
  const completionPct = expected ? (filled / expected) * 100 : null
  const compliancePct = evaluation ? (done / evaluation) * 100 : null
  const completionPass = completionPct != null && completionPct >= completionThresholdPct
  const compliancePass = compliancePct != null && compliancePct >= targetPct
  const sectionDPass = inclusionReady && included && completionPass && compliancePass && variationComplete
  return {
    expected, filled, done, notDone, notApplicable, evaluation,
    completionPct: round2(completionPct), compliancePct: round2(compliancePct),
    inclusionReady, included, sectionDPass, variationCount: variations.length,
    targetPct, completionThresholdPct,
    targetMet: compliancePct == null ? null : compliancePct >= targetPct,
  }
}

export type ClinicalPathwayAggregate = {
  totalRecords: number
  validatedRecords: number
  readyRecords: number
  draftRecords: number
  reopenedRecords: number
  completionPct: number | null
  compliancePct: number | null
  episodeTargetMetPct: number | null
  sectionDPassPct: number | null
  meanEpisodeCompliancePct: number | null
  expected: number
  filled: number
  done: number
  notDone: number
  targetMetRecords: number
  assessedRecords: number
}

export function aggregateClinicalPathwayRows(rows: ClinicalPathwayRow[]) {
  const statusCounts = { validated: 0, submitted: 0, ready: 0, draft: 0, reopened: 0, other: 0 }
  const validated: Array<{ row: ClinicalPathwayRow; metrics: PathwayAuditMetrics }> = []
  for (const row of rows) {
    const status = String(row.status ?? '').toLowerCase()
    if (status === 'archived') continue
    if (status in statusCounts) statusCounts[status as keyof typeof statusCounts] += 1
    else statusCounts.other += 1
    if (status === 'validated' || status === 'submitted' || status === 'ready') validated.push({ row, metrics: calculatePathwayAuditMetrics(row) })
  }

  const expected = validated.reduce((sum, item) => sum + item.metrics.expected, 0)
  const filled = validated.reduce((sum, item) => sum + item.metrics.filled, 0)
  const done = validated.reduce((sum, item) => sum + item.metrics.done, 0)
  const notDone = validated.reduce((sum, item) => sum + item.metrics.notDone, 0)
  const targetMetRecords = validated.filter((item) => item.metrics.targetMet === true).length
  const assessedRecords = validated.filter((item) => item.metrics.targetMet != null).length
  const sectionDPassRecords = validated.filter((item) => item.metrics.sectionDPass).length
  const complianceValues = validated.map((item) => item.metrics.compliancePct).filter((value): value is number => value != null)

  return {
    statusCounts,
    overall: {
      totalRecords: rows.filter((row) => String(row.status ?? '').toLowerCase() !== 'archived').length,
      validatedRecords: validated.length,
      readyRecords: statusCounts.ready + statusCounts.submitted,
      draftRecords: statusCounts.draft,
      reopenedRecords: statusCounts.reopened,
      completionPct: expected ? round2((filled / expected) * 100) : null,
      compliancePct: (done + notDone) ? round2((done / (done + notDone)) * 100) : null,
      episodeTargetMetPct: assessedRecords ? round2((targetMetRecords / assessedRecords) * 100) : null,
      sectionDPassPct: validated.length ? round2((sectionDPassRecords / validated.length) * 100) : null,
      meanEpisodeCompliancePct: complianceValues.length ? round2(complianceValues.reduce((sum, value) => sum + value, 0) / complianceValues.length) : null,
      expected, filled, done, notDone, targetMetRecords, assessedRecords,
    } as ClinicalPathwayAggregate,
    validatedRows: validated,
  }
}

export type ClinicalPathwayMonthly = {
  month: number
  cases: number
  expected: number
  filled: number
  done: number
  notDone: number
  compliancePct: number | null
  completionPct: number | null
}

export function aggregatePathwayByMonth(rows: ClinicalPathwayRow[], year: number): ClinicalPathwayMonthly[] {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const selected = rows.filter((row) => {
      const date = safeDate(row.admission_date)
      const status = String(row.status ?? '').toLowerCase()
      return (status === 'validated' || status === 'submitted' || status === 'ready') && date != null &&
        Number(date.slice(0, 4)) === year && Number(date.slice(5, 7)) === month
    }).map(calculatePathwayAuditMetrics)
    const expected = selected.reduce((sum, item) => sum + item.expected, 0)
    const filled = selected.reduce((sum, item) => sum + item.filled, 0)
    const done = selected.reduce((sum, item) => sum + item.done, 0)
    const notDone = selected.reduce((sum, item) => sum + item.notDone, 0)
    return {
      month, cases: selected.length, expected, filled, done, notDone,
      compliancePct: done + notDone ? round2((done / (done + notDone)) * 100) : null,
      completionPct: expected ? round2((filled / expected) * 100) : null,
    }
  })
}

export type ClinicalDeathAuditResultRow = {
  room_id?: number | null
  audit_type?: 'clinical' | 'death' | string
  review_period?: string | null
  review_json?: Record<string, any> | null
  review_phases?: Record<string, any> | null
  review_recommended_actions?: string | null
  review_learning_points?: string | null
  overall_care_score?: number | null
  care_issue_identified?: string | null
  contribution_to_outcome?: string | null
  avoidability_score?: number | null
  status?: string | null
  created_at?: string | null
  updated_at?: string | null
  validated_at?: string | null
}

export type OrdinalSummary = {
  n: number
  median: number | null
  q1: number | null
  q3: number | null
  distribution: Record<number, number>
}

export function summarizeOrdinal(values: number[], minimum: number, maximum: number): OrdinalSummary {
  const valid = values.filter((value) => Number.isFinite(value) && value >= minimum && value <= maximum)
  const distribution: Record<number, number> = {}
  for (let value = minimum; value <= maximum; value += 1) {
    distribution[value] = valid.filter((item) => item === value).length
  }
  return {
    n: valid.length,
    median: median(valid),
    q1: quantileNearestRank(valid, 0.25),
    q3: quantileNearestRank(valid, 0.75),
    distribution,
  }
}

export function aggregateClinicalDeathAudits(rows: ClinicalDeathAuditResultRow[], auditType: 'clinical' | 'death') {
  const scoped = rows.filter((row) =>
    String(row.audit_type ?? '') === auditType && String(row.status ?? '').toLowerCase() !== 'archived',
  )
  const statusCounts = { validated: 0, submitted: 0, draft: 0, reopened: 0, other: 0 }
  scoped.forEach((row) => {
    const status = String(row.status ?? '').toLowerCase()
    if (status === 'validated' || status === 'submitted' || status === 'draft' || status === 'reopened') statusCounts[status] += 1
    else statusCounts.other += 1
  })
  const validated = scoped.filter((row) => ['validated','submitted','ready'].includes(String(row.status ?? '').toLowerCase()))
  const phaseIds = ['admission', 'ongoing', 'procedure', 'perioperative', 'end_of_life']
  const phaseLabels = ['Admisi dan perawatan awal', 'Perawatan lanjutan', 'Perawatan selama prosedur', 'Perioperatif / perawatan prosedural', 'Akhir hayat / pemulangan']
  const phases = phaseIds.map((id, index) => {
    const values = validated.map((row) => row.review_json?.phases?.[id]).filter((item) =>
      item && item.notApplicable !== true && finiteNumber(item.score) != null,
    ).map((item) => Number(item.score))
    return { id, label: phaseLabels[index], summary: summarizeOrdinal(values, 1, 5) }
  })
  const overallScores = validated.map((row) => finiteNumber(row.overall_care_score)).filter((value): value is number => value != null)
  const careIssue = { yes: 0, no: 0, uncertain: 0, missing: 0 }
  validated.forEach((row) => {
    const value = String(row.care_issue_identified ?? '')
    if (value === 'yes' || value === 'no' || value === 'uncertain') careIssue[value] += 1
    else careIssue.missing += 1
  })
  const contribution = { yes: 0, no: 0, uncertain: 0, missing: 0 }
  const avoidabilityScores: number[] = []
  if (auditType === 'death') {
    validated.forEach((row) => {
      const value = String(row.contribution_to_outcome ?? '')
      if (value === 'yes' || value === 'no' || value === 'uncertain') contribution[value] += 1
      else contribution.missing += 1
      const score = finiteNumber(row.avoidability_score)
      if (score != null) avoidabilityScores.push(score)
    })
  }
  const createdActions = validated.filter((row) => String(row.review_json?.recommended_actions ?? '').trim().length >= 10).length
  const learningDocumented = validated.filter((row) => String(row.review_json?.learning_points ?? '').trim().length >= 10).length
  return {
    totalRecords: scoped.length,
    validatedRecords: validated.length,
    statusCounts,
    overallScore: summarizeOrdinal(overallScores, 1, 5),
    careIssue,
    contribution,
    avoidability: summarizeOrdinal(avoidabilityScores, 1, 6),
    phases,
    createdActions,
    learningDocumented,
    latestInputAt: scoped.map((row) => row.created_at ?? row.updated_at ?? '').filter(Boolean).sort().at(-1) ?? null,
  }
}

export function aggregateClinicalDeathByValidationMonth(rows: ClinicalDeathAuditResultRow[], auditType: 'clinical' | 'death', year: number) {
  return Array.from({ length: 12 }, (_, index) => {
    const month = index + 1
    const selected = rows.filter((row) => {
      if (String(row.audit_type ?? '') !== auditType || !['validated','submitted','ready'].includes(String(row.status ?? '').toLowerCase())) return false
      const date = safeDate(row.validated_at ?? row.created_at)
      return date != null && Number(date.slice(0, 4)) === year && Number(date.slice(5, 7)) === month
    })
    return { month, validated: selected.length }
  })
}
