import { normalizeExactHeader } from './excel-paste.ts'

/**
 * Finds source columns describing the combined BHP-and-linen availability
 * indicator. Both tokens must be present; separate BHP-only and linen-only
 * columns are not treated as the combined indicator.
 *
 * Map keys are normalized source headers. Multiple candidates are returned
 * so the interactive importer can request an explicit user choice.
 */
export function findIcuBhpLinenHeaderCandidates(
  columns: ReadonlyMap<string, readonly number[]>,
): string[] {
  return Array.from(columns.keys()).filter((header) => {
    const normalized = normalizeExactHeader(header)
    const tokens = normalized.split(/[^a-z0-9]+/).filter(Boolean)
    const hasBhp = tokens.includes('bhp') || normalized.includes('bahan habis pakai')
    return hasBhp && tokens.includes('linen')
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
