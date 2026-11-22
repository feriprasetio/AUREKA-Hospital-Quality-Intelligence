/**
 * Workbooks frequently prefill thousands of rows with formulas, sequential
 * numbers, and cached #VALUE!/ #REF! results even though no episode exists.
 * Only configured source fields may establish a clinical row; a formula error
 * by itself must neither create an episode nor conceal an actual populated one.
 */
export function isExcelSourceError(value: unknown): boolean {
  return typeof value === 'string' &&
    /^#(?:REF!|VALUE!|NUM!|NAME\?|DIV\/0!|N\/A|NULL!|SPILL!|CALC!)(?:\s|$)/i.test(value.trim())
}

export function isMaterialWorkbookSourceRow(
  values: Readonly<Record<string, unknown>>,
  fieldKeys: readonly string[],
  observationKeys: readonly string[],
): boolean {
  const keys = new Set([...fieldKeys, ...observationKeys].filter(Boolean))
  for (const key of keys) {
    const value = values[key]
    if (value == null || isExcelSourceError(value)) continue
    if (value instanceof Date && Number.isFinite(value.getTime())) return true
    if (typeof value === 'number' && Number.isFinite(value)) return true // measured zero counts
    if (typeof value === 'boolean') return true
    if (typeof value === 'string' && value.trim()) return true
  }
  return false
}
