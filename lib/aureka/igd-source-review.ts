import { IGD_INDICATORS, type IgdIndicatorOption } from './igd-logbook.ts'

/**
 * Per-workbook IGD source option reconciliation.
 *
 * This is a preview-only audit, never a replacement for the clinical indicator
 * master. Numeric Code 1/2/3 must not be inferred from a column header.
 */
const normalize = (value: unknown) =>
  String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('id-ID')

export function igdSourceReviewKey(code: string, sourceValue: unknown): string {
  return code + '\u001f' + normalize(sourceValue)
}

export function igdSourceCode(sourceValue: unknown): number | null {
  const match = String(sourceValue ?? '').trim().match(/\(code\s*(\d+)\)\s*$/i)
  return match ? Number(match[1]) : null
}

/**
 * Header labels copied into data cells are not evidence of a patient outcome.
 * Never offer a one-to-many mapping for such placeholders.
 */
export function isIgdHeaderPlaceholder(code: string, sourceValue: unknown): boolean {
  const header = IGD_INDICATORS.find(indicator => indicator.code === code)?.header
  if (!header) return false
  const raw = normalize(String(sourceValue ?? '').replace(/\s*\(code\s*\d+\)\s*$/i, ''))
  return !!raw && raw === normalize(header)
}

export type IgdUnmatchedOption = {
  key: string
  code: string
  header: string
  sourceValue: string
  count: number
  placeholder: boolean
  explicitCode: number | null
}

export type IgdRowOptions = {
  rawIndicators: Record<string, string>
  matchedIndicators: Record<string, IgdIndicatorOption | null>
}

export function summarizeIgdUnmatchedOptions(rows: readonly IgdRowOptions[]): IgdUnmatchedOption[] {
  const groups = new Map<string, IgdUnmatchedOption>()
  for (const row of rows) {
    for (const indicator of IGD_INDICATORS) {
      const raw = row.rawIndicators[indicator.code]?.trim() ?? ''
      if (!raw || row.matchedIndicators[indicator.code]) continue
      const key = igdSourceReviewKey(indicator.code, raw)
      const previous = groups.get(key)
      if (previous) { previous.count++; continue }
      groups.set(key, {
        key, code: indicator.code, header: indicator.header,
        sourceValue: raw, count: 1,
        placeholder: isIgdHeaderPlaceholder(indicator.code, raw),
        explicitCode: igdSourceCode(raw),
      })
    }
  }
  return [...groups.values()].sort((a, b) => b.count - a.count || a.code.localeCompare(b.code, 'id-ID', { numeric: true }))
}

export type IgdManualSourceChoice = {
  profileId: string
  sourceValue: string
  optionLabel: string
  optionCode: number | null
}

export function approvedIgdSourceChoice<T extends IgdIndicatorOption>(
  code: string,
  raw: string,
  profileId: string,
  options: readonly T[],
  choice: IgdManualSourceChoice | undefined,
): T | null {
  if (!choice || !profileId || choice.profileId !== profileId ||
      igdSourceReviewKey(code, choice.sourceValue) !== igdSourceReviewKey(code, raw) ||
      isIgdHeaderPlaceholder(code, raw)) return null
  const explicit = igdSourceCode(raw)
  const matching = options.filter(option =>
    option.label === choice.optionLabel &&
    (option.code == null ? null : Number(option.code)) === choice.optionCode &&
    (explicit == null || (option.code != null && Number(option.code) === explicit))
  )
  return matching.length === 1 ? matching[0] : null
}
