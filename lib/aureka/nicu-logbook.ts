export type NicuIndicatorOption = {
  code: number | null
  label: string
  numerator?: boolean | null
  denominator?: boolean
  review_required?: boolean
}

export type NicuIndicatorProfile = {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  is_active?: boolean
  status?: string
  options_json?: NicuIndicatorOption[]
}

export type NicuSourceAnswer = {
  label: string
  code: number | null
  sourceLabel: string
  sourceCode: number | null
  reviewRequired: true
  mappingStatus: 'mapped_pending_classification' | 'not_in_master' | 'ambiguous_master' | 'source_code_conflict'
}

export const NICU_SOURCE_INDICATORS = [
  { sourceSequence: 1, code: '18.4', header: 'Visite Spesialis', sourceHeader: 'Visite Spesialis' },
  { sourceSequence: 2, code: '18.5', header: 'Validitas Asesmen Keperawatan', sourceHeader: 'Validitas Asesmen Keperawatan' },
  { sourceSequence: 3, code: '18.3', header: 'Transfer IGD', sourceHeader: 'Transfer IGD' },
  { sourceSequence: 4, code: '18.1', header: 'Unplanned Extubation', sourceHeader: 'Unplanned Extubation' },
  { sourceSequence: 5, code: '18.6', header: 'LOS NICU Panjang', sourceHeader: 'LOS NICU Panjang' },
] as const

const FORMULA_ERRORS = new Set(['#VALUE!', '#NUM!', '#REF!', '#DIV/0!', '#N/A', '#NAME?'])

export function hasNicuEpisodeData(values: readonly unknown[]): boolean {
  return values.some(value => value instanceof Date
    ? !Number.isNaN(value.getTime())
    : value != null && String(value).trim() !== '')
}

export function normalizeNicuDate(value: unknown): string | null {
  const valid = (year: number, month: number, day: number): string | null => {
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
      : null
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return valid(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 20000 || value > 80000) return null
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
  }

  if (typeof value !== 'string') return null
  const raw = value.trim()
  if (!raw) return null

  if (/^\d+(?:[.,]\d+)?$/.test(raw)) {
    return normalizeNicuDate(Number(raw.replace(',', '.')))
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/)
  if (iso) return valid(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s+.*)?$/)
  if (dmy) return valid(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))

  return null
}

export function normalizeNicuOptionLabel(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s*\(\s*code\s*[1-3]\s*\)\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('id-ID')
}

export function parseNicuSourceAnswer(
  raw: string,
  options: NicuIndicatorOption[],
): NicuSourceAnswer | null {
  const sourceLabel = String(raw ?? '').trim()
  if (!sourceLabel) return null

  const suffix = sourceLabel.match(/\(\s*code\s*(\d+)\s*\)\s*$/i)
  const sourceCode = suffix ? Number(suffix[1]) : null
  const label = sourceLabel.replace(/\s*\(\s*code\s*[1-3]\s*\)\s*$/i, '').trim()
  const canonical = normalizeNicuOptionLabel(label)

  if (!Array.isArray(options) || options.length === 0) {
    return {
      label, code: null, sourceLabel, sourceCode,
      reviewRequired: true, mappingStatus: 'not_in_master',
    }
  }

  const matches = options.filter(option => normalizeNicuOptionLabel(option.label) === canonical)
  if (matches.length === 0) {
    return {
      label, code: null, sourceLabel, sourceCode,
      reviewRequired: true, mappingStatus: 'not_in_master',
    }
  }

  if (matches.length !== 1) {
    return {
      label, code: null, sourceLabel, sourceCode,
      reviewRequired: true, mappingStatus: 'ambiguous_master',
    }
  }

  const option = matches[0]
  const masterCode = option.code == null ? null : Number(option.code)
  if (sourceCode != null && (sourceCode < 1 || sourceCode > 3 || masterCode !== sourceCode)) {
    return {
      label: option.label, code: null, sourceLabel, sourceCode,
      reviewRequired: true, mappingStatus: 'source_code_conflict',
    }
  }

  return {
    label: option.label,
    code: masterCode,
    sourceLabel,
    sourceCode,
    reviewRequired: true,
    mappingStatus: 'mapped_pending_classification',
  }
}

export function calculateNicuStayDays(admissionDate: string, dischargeDate: string | null): number | null {
  const admission = normalizeNicuDate(admissionDate)
  const discharge = dischargeDate ? normalizeNicuDate(dischargeDate) : null
  if (!admission || !discharge) return null
  const start = Date.parse(admission + 'T00:00:00Z')
  const end = Date.parse(discharge + 'T00:00:00Z')
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return Math.round((end - start) / 86400000)
}

export function makeNicuSubjectKey(year: number, sourceExcelRow: number): string {
  if (!Number.isInteger(year) || year !== 2026) {
    throw new Error('Tahun profil NICU harus 2026.')
  }
  if (!Number.isInteger(sourceExcelRow) || sourceExcelRow < 3 || sourceExcelRow > 5010) {
    throw new Error('Nomor baris Excel NICU tidak valid.')
  }
  return 'excel-pmkp-nicu-' + year + ':row:' + sourceExcelRow
}

export function isNicuFormulaError(value: unknown): boolean {
  return typeof value === 'string' && FORMULA_ERRORS.has(value.trim().toUpperCase())
}
