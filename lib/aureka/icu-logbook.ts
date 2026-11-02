export type IcuIndicatorOption = {
  code?: number | null
  label: string
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}

export type IcuIndicatorProfile = {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  is_active?: boolean
  status?: string
  options_json?: IcuIndicatorOption[]
}

export type IcuSourceAnswer = {
  label: string
  code: number | null
  sourceLabel: string
  sourceCode: number | null
  reviewRequired: boolean
  mappingStatus: 'mapped' | 'master_pending' | 'source_master_conflict' | 'not_in_master' | 'ambiguous_master'
}

const FORMULA_ERRORS = new Set(['#VALUE!', '#NUM!', '#REF!', '#DIV/0!', '#N/A', '#NAME?'])

export function normalizeIcuDate(value: unknown): string | null {
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
    return normalizeIcuDate(Number(raw.replace(',', '.')))
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/)
  if (iso) return valid(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s+.*)?$/)
  if (dmy) return valid(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))

  return null
}

export function normalizeIcuOptionLabel(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('id-ID')
}

export function parseIcuSourceAnswer(
  raw: string,
  options: IcuIndicatorOption[],
): IcuSourceAnswer | null {
  const sourceLabel = String(raw ?? '').trim()
  if (!sourceLabel) return null

  const suffix = sourceLabel.match(/\(\s*code\s*(\d+)\s*\)\s*$/i)
  const sourceCode = suffix ? Number(suffix[1]) : null
  const label = sourceLabel.replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '').trim()
  const canonical = normalizeIcuOptionLabel(label)

  if (!Array.isArray(options) || options.length === 0) {
    return {
      label,
      code: null,
      sourceLabel,
      sourceCode,
      reviewRequired: true,
      mappingStatus: 'not_in_master',
    }
  }

  const matches = options.filter(option => normalizeIcuOptionLabel(option.label) === canonical)
  if (matches.length === 0) {
    return {
      label,
      code: null,
      sourceLabel,
      sourceCode,
      reviewRequired: true,
      mappingStatus: 'not_in_master',
    }
  }

  if (matches.length !== 1) {
    return {
      label,
      code: null,
      sourceLabel,
      sourceCode,
      reviewRequired: true,
      mappingStatus: 'ambiguous_master',
    }
  }

  const match = matches[0]
  const masterCode = match.code == null ? null : Number(match.code)
  if (sourceCode != null && (sourceCode < 1 || sourceCode > 3 || masterCode !== sourceCode)) {
    return {
      label,
      code: null,
      sourceLabel,
      sourceCode,
      reviewRequired: true,
      mappingStatus: 'source_master_conflict',
    }
  }

  if (masterCode == null || match.review_required === true ||
      typeof match.numerator !== 'boolean' || typeof match.denominator !== 'boolean') {
    return {
      label: match.label,
      code: null,
      sourceLabel,
      sourceCode,
      reviewRequired: true,
      mappingStatus: 'master_pending',
    }
  }

  if (masterCode < 1 || masterCode > 3) {
    return {
      label,
      code: null,
      sourceLabel,
      sourceCode,
      reviewRequired: true,
      mappingStatus: 'source_master_conflict',
    }
  }

  return {
    label: match.label,
    code: masterCode,
    sourceLabel,
    sourceCode,
    reviewRequired: false,
    mappingStatus: 'mapped',
  }
}

export function calculateIcuStayDays(admissionDate: string, dischargeDate: string): number | null {
  const admission = normalizeIcuDate(admissionDate)
  const discharge = normalizeIcuDate(dischargeDate)
  if (!admission || !discharge) return null
  const start = Date.parse(admission + 'T00:00:00Z')
  const end = Date.parse(discharge + 'T00:00:00Z')
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return Math.round((end - start) / 86400000)
}

export function makeIcuSubjectKey(year: number, sourceExcelRow: number): string {
  if (!Number.isInteger(year) || year < 2026 || year > 2100) {
    throw new Error('Tahun profil ICU tidak valid.')
  }
  if (!Number.isInteger(sourceExcelRow) || sourceExcelRow < 3 || sourceExcelRow > 5003) {
    throw new Error('Nomor baris Excel ICU tidak valid.')
  }
  return 'excel-pmkp-icu-' + year + ':row:' + sourceExcelRow
}

export function isIcuFormulaError(value: unknown): boolean {
  return typeof value === 'string' && FORMULA_ERRORS.has(value.trim().toUpperCase())
}
