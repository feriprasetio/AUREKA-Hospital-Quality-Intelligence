import { resolveMeasurementKind, type IndicatorProfile } from './indicator-engine.ts'

export type IndicatorDropdownMasterOption = {
  label: string
  code?: number | null
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}

export type IndicatorDropdownOption = {
  key: string
  label: string
  answer: string
  code: number | null
  source_only: boolean
  review_required: boolean
  source_label: string
}

export type IndicatorDropdownProfile = IndicatorProfile & {
  options_json?: IndicatorDropdownMasterOption[] | null
}

function normalizeChoice(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('id-ID')
}

function splitSourceCode(value: string): { label: string; code: number | null } {
  const match = value.match(/\s*\(code\s*(\d+)\)\s*$/i)
  return {
    label: match ? value.slice(0, match.index).trim() : value.trim(),
    code: match ? Number(match[1]) : null,
  }
}

/** Categorical indicators with master choices should render a dropdown.
 * Quantitative/time indicators keep their numeric or time input even if
 * their profile happens to carry a placeholder "Lainnya" option.
 */
export function shouldUseIndicatorDropdown(profile: IndicatorDropdownProfile): boolean {
  const options = Array.isArray(profile.options_json)
    ? profile.options_json.filter(option => option && String(option.label ?? '').trim())
    : []
  if (options.length < 2) return false
  return !['ratio', 'visit', 'door', 'minutes', 'numeric'].includes(resolveMeasurementKind(profile))
}

/** Build a safe dropdown from the published master and, when present, source
 * Excel validation labels. Exact matches retain the canonical master code.
 * Excel-only labels remain selectable but are flagged for manual review and
 * are never assigned a guessed master code.
 */
export function buildIndicatorDropdownOptions(
  profile: IndicatorDropdownProfile,
  sourceLabels: string[] = [],
): IndicatorDropdownOption[] {
  const master = Array.isArray(profile.options_json)
    ? profile.options_json.filter(option => option && String(option.label ?? '').trim())
    : []
  const output: IndicatorDropdownOption[] = []
  const sourceKeys = new Set<string>()

  for (const [index, rawLabel] of sourceLabels.entries()) {
    const sourceLabel = String(rawLabel ?? '').trim()
    if (!sourceLabel) continue
    const parts = splitSourceCode(sourceLabel)
    const sourceKey = normalizeChoice(sourceLabel)
    if (sourceKeys.has(sourceKey)) continue
    sourceKeys.add(sourceKey)

    const matches = master.filter(option =>
      normalizeChoice(option.label) === normalizeChoice(parts.label) &&
      (parts.code == null || (option.code != null && Number(option.code) === parts.code))
    )
    const matched = matches.length === 1 ? matches[0] : null
    output.push({
      key: 'excel-' + index,
      label: sourceLabel,
      answer: matched ? String(matched.label) : sourceLabel,
      code: matched?.code == null ? null : Number(matched.code),
      source_only: !matched,
      review_required: !matched || matched.review_required === true,
      source_label: sourceLabel,
    })
  }

  for (const [index, option] of master.entries()) {
    const alreadyRepresented = output.some(item =>
      !item.source_only &&
      item.answer === String(option.label) &&
      (item.code == null || option.code == null || Number(item.code) === Number(option.code))
    )
    if (alreadyRepresented) continue
    output.push({
      key: 'master-' + index,
      label: String(option.label),
      answer: String(option.label),
      code: option.code == null ? null : Number(option.code),
      source_only: false,
      review_required: option.review_required === true,
      source_label: String(option.label),
    })
  }

  return output
}

export function findIndicatorDropdownSelection(
  options: IndicatorDropdownOption[],
  response: Record<string, unknown> | undefined,
): number {
  if (!response) return -1
  const answer = String(response.answer ?? '').trim()
  const code = response.code == null || response.code === '' ? null : Number(response.code)
  const sourceValue = String(response.source_value ?? response.source_label ?? '').trim()
  const sourceOnly = response.source_option === true

  if (answer) {
    const exact = options.findIndex(option =>
      option.answer === answer &&
      (code == null || option.code == null || Number(option.code) === code) &&
      (sourceOnly ? option.source_only : !option.source_only)
    )
    if (exact >= 0) return exact
  }

  if (sourceValue) {
    const sourceMatch = options.findIndex(option =>
      normalizeChoice(option.source_label) === normalizeChoice(sourceValue)
    )
    if (sourceMatch >= 0) return sourceMatch
  }

  return -1
}
