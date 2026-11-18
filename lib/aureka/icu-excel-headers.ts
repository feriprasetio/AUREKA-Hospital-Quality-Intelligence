import { normalizeExactHeader } from './excel-paste.ts'

/**
 * Finds source columns that describe the combined BHP-and-linen availability
 * indicator. Both tokens must be present; separate BHP-only and linen-only
 * columns are never silently treated as the combined indicator.
 *
 * The map keys are normalized source headers and values are physical Excel
 * column indexes. Multiple candidates are returned for explicit user choice.
 */
export function findIcuBhpLinenHeaderCandidates(
  columns: ReadonlyMap<string, readonly number[]>,
): string[] {
  return Array.from(columns.keys()).filter((header) => {
    const normalized = normalizeExactHeader(header)
    const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean)
    return tokens.includes('bhp') && tokens.includes('linen')
  })
}

export function findIcuBhpLinenHeaderColumns(
  columns: ReadonlyMap<string, readonly number[]>,
): number[] {
  return Array.from(new Set(
    findIcuBhpLinenHeaderCandidates(columns)
      .flatMap((header) => [...(columns.get(header) ?? [])])
      .map(Number)
      .filter((column) => Number.isInteger(column) && column > 0),
  )).sort((left, right) => left - right)
}
