export type SafetyCultureResponseInput = {
  survey_period: string
  unit_name: string
  answers?: Record<string, unknown> | null
}

export type SafetyCultureAggregate = {
  period: string
  unit: string
  respondentCount: number | null
  meanSafetyRating: number | null
  suppressed: boolean
}

/**
 * Returns only period/unit aggregates. It deliberately does not return response IDs,
 * timestamps, staff IDs, submitter IDs, or row-level answers.
 */
export function aggregateSafetyCultureResponses(
  rows: SafetyCultureResponseInput[],
  minimumCellSize = 5,
): SafetyCultureAggregate[] {
  if (!Number.isInteger(minimumCellSize) || minimumCellSize < 2) {
    throw new RangeError('Minimum cell size must be an integer of at least 2.')
  }

  const groups = new Map<string, { period: string; unit: string; ratings: number[]; count: number }>()
  for (const row of rows) {
    const period = String(row.survey_period ?? '').trim()
    const unit = String(row.unit_name ?? '').trim()
    if (!period || !unit) continue

    const key = period + '\u0000' + unit
    const group = groups.get(key) ?? { period, unit, ratings: [], count: 0 }
    group.count += 1

    const rating = Number(row.answers?.E1)
    if (Number.isFinite(rating) && rating >= 1 && rating <= 5) group.ratings.push(rating)
    groups.set(key, group)
  }

  return Array.from(groups.values())
    .sort((a, b) => a.period.localeCompare(b.period, 'id-ID') || a.unit.localeCompare(b.unit, 'id-ID'))
    .map((group) => {
      const suppressed = group.count < minimumCellSize || group.ratings.length < minimumCellSize
      const mean = group.ratings.length
        ? Math.round((group.ratings.reduce((sum, value) => sum + value, 0) / group.ratings.length) * 100) / 100
        : null
      return {
        period: group.period,
        unit: group.unit,
        respondentCount: suppressed ? null : group.count,
        meanSafetyRating: suppressed ? null : mean,
        suppressed,
      }
    })
}
