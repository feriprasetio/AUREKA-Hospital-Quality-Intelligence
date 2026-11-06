import { normalizeExactHeader } from './excel-paste.ts'

export type SarafIndicatorOption = {
  code?: number | null
  label: string
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}

export type SarafIndicatorProfile = {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  is_active?: boolean
  status?: string
  options_json?: SarafIndicatorOption[] | null
}

export type SarafSourceAnswer = {
  label: string
  code: number | null
  numerator: boolean | null
  denominator: boolean
  sourceLabel: string
  sourceCode: number | null
  reviewRequired: true
  mappingStatus: 'mapped_pending_classification' | 'mapped_existing_master' | 'not_in_master' | 'ambiguous_master' | 'source_code_conflict'
}

export const SARAF_SOURCE_INDICATORS = [
  { code: '26.7', header: 'Visite Spesialis', sourceHeader: 'Visite Spesialis' },
  { code: '26.16', header: 'Validitas Asesmen Keperawatan', sourceHeader: 'Validitas Asesmen Keperawatan' },
  { code: '26.6', header: 'Transfer IGD', sourceHeader: 'Transfer IGD' },
  { code: '26.4', header: 'Kekosongan Linen', sourceHeader: 'Kekosongan Linen' },
  { code: '26.5', header: 'Kekosongan Obat', sourceHeader: 'Kekosongan Obat' },
  { code: '26.1', header: '(STEMI) EKG di IGD', sourceHeader: '(STEMI) EKG di IGD' },
  { code: '26.2', header: '(STEMI) Killip Stratifikasi2', sourceHeader: '(STEMI) Killip Stratifikasi2' },
  { code: '26.3', header: '(STEMI) Door-to-Balloon ≤90 Menit', sourceHeader: '(STEMI) Door-to-Balloon ≤90 Menit' },
  { code: '26.15', header: '(STEMI) Revaskularisasi', sourceHeader: '(STEMI) Revaskularisasi' },
  { code: '26.8', header: '(STEMI) LOS <5 Hari', sourceHeader: '(STEMI) LOS <5 Hari' },
  { code: '26.14', header: '(STEMI) Survival RS', sourceHeader: '(STEMI) Survival RS' },
  { code: '26.10', header: '(SNH) rTPA <4,5h', sourceHeader: '(SNH) rTPA <4,5h' },
  { code: '26.11', header: '(SNH) CT Scan ≤30’', sourceHeader: '(SNH) CT Scan ≤30’' },
  { code: '26.12', header: '(SNH) Antiplatelet/Antikoagulan', sourceHeader: '(SNH) Antiplatelet/Antikoagulan' },
  { code: '26.13', header: '(SNH) Pulang Hidup', sourceHeader: '(SNH) Pulang Hidup' },
  { code: '26.9', header: '(SNH) LOS <7', sourceHeader: '(SNH) LOS <7' },
] as const

const CORE_HEADER_ALIASES: Record<string, string[]> = {
  sourceNo: ['No.', 'No'],
  patientName: ['Nama Pasien'],
  medicalRecordNo: ['No. Rekam Medis', 'No RM', 'No. RM.'],
  admissionDate: ['Tanggal Masuk'],
  dischargeDate: ['Tanggal Keluar'],
  diagnosis: ['Diagnosa Tegak', 'Diagnosis Tegak'],
  patientCategory: ['Kategori Pasien'],
  dischargeStatus: ['Status Pulang'],
  sourceLos: ['Lenght of Stay', 'Length of Stay'],
  receivingNurse: ['Perawat Penerima'],
  dpjp: ['DPJP'],
}

const SOURCE_LABEL_ALIASES: Record<string, Record<string, string>> = {
  '26.4': {
    'adanya kekosongan linen': 'Terjadi kekosongan linen',
  },
  '26.5': {
    'adanya kekosongan obat': 'Terjadi kekosongan obat',
    'tidak adanya kekosongan obat': 'Tidak terjadi kekosongan obat',
  },
}

const FORMULA_ERRORS = new Set(['#VALUE!', '#NUM!', '#REF!', '#DIV/0!', '#N/A', '#NAME?'])

export type SarafHeaderMap = {
  indexes: Record<string, number>
  missingHeaders: string[]
  duplicateHeaders: string[]
}

export function mapSarafLogbookHeaders(headerValues: unknown[]): SarafHeaderMap {
  const columns = new Map<string, number[]>()
  headerValues.forEach((value, index) => {
    const key = normalizeExactHeader(value)
    if (!key) return
    const matches = columns.get(key) ?? []
    matches.push(index + 1)
    columns.set(key, matches)
  })

  const indexes: Record<string, number> = {}
  const missingHeaders: string[] = []
  const duplicateHeaders: string[] = []
  const optional = new Set([
    'sourceNo', 'patientCategory', 'dischargeStatus', 'sourceLos',
    'receivingNurse', 'dpjp',
  ])

  const resolve = (key: string, aliases: string[]) => {
    const matches = [...new Set(aliases.flatMap(alias => columns.get(normalizeExactHeader(alias)) ?? []))]
    if (matches.length > 1) {
      duplicateHeaders.push(aliases[0])
      return
    }
    if (matches.length === 1) {
      indexes[key] = matches[0]
      return
    }
    if (!optional.has(key)) missingHeaders.push(aliases[0])
  }

  for (const [key, aliases] of Object.entries(CORE_HEADER_ALIASES)) resolve(key, aliases)
  for (const item of SARAF_SOURCE_INDICATORS) {
    resolve('indicator:' + item.code, [item.sourceHeader])
  }
  return { indexes, missingHeaders, duplicateHeaders }
}

export function hasSarafLogbookData(values: Record<string, unknown>): boolean {
  return ['patientName', 'medicalRecordNo', 'admissionDate'].some(
    key => String(values[key] ?? '').trim() !== '',
  )
}

function validDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null
  return String(year).padStart(4, '0') + '-' +
    String(month).padStart(2, '0') + '-' +
    String(day).padStart(2, '0')
}

/** Normalizes Excel serials, native Dates, ISO dates and Indonesian D/M/YYYY strings. */
export function normalizeSarafDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return validDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 20000 || value > 80000) return null
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString().slice(0, 10)
  }

  if (typeof value !== 'string') return null
  const raw = value.normalize('NFKC')
    .replace(/[\u00a0\u202f\u2007]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
  if (!raw) return null
  if (/^\d+(?:[.,]\d+)?$/.test(raw)) {
    return normalizeSarafDate(Number(raw.replace(',', '.')))
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/)
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/)
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])
    return validDate(year, Number(dmy[2]), Number(dmy[1]))
  }
  return null
}

export function normalizeSarafOptionLabel(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u00a0\u202f\u2007]/g, ' ')
    .replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('id-ID')
}

/**
 * Matches source labels to the published room-26 master only.
 * The STEMI LOS <5 source labels are not the same as the currently published
 * 26.8 options (which are Door-to-Balloon labels); these are deliberately
 * retained as not_in_master pending correction by the indicator owner.
 * Profiles 26.15 and 26.16 also have no published choices.
 */
export function parseSarafSourceAnswer(
  raw: string,
  options: SarafIndicatorOption[] | null | undefined,
  indicatorCode: string,
): SarafSourceAnswer | null {
  const sourceLabel = String(raw ?? '')
    .normalize('NFKC')
    .replace(/[\u00a0\u202f\u2007]/g, ' ')
    .trim()
  if (!sourceLabel) return null

  const suffix = sourceLabel.match(/\(\s*code\s*(\d+)\s*\)\s*$/i)
  const sourceCode = suffix ? Number(suffix[1]) : null
  const unwrappedLabel = sourceLabel.replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '').trim()
  const normalizedSource = normalizeSarafOptionLabel(unwrappedLabel)
  const alias = SOURCE_LABEL_ALIASES[indicatorCode]?.[normalizedSource]
  const canonicalSource = alias ? normalizeSarafOptionLabel(alias) : normalizedSource
  const masterOptions = Array.isArray(options)
    ? options.filter(option => option && String(option.label ?? '').trim())
    : []

  const pending = (
    label: string,
    mappingStatus: SarafSourceAnswer['mappingStatus'],
  ): SarafSourceAnswer => ({
    label,
    code: null,
    numerator: null,
    denominator: true,
    sourceLabel,
    sourceCode,
    reviewRequired: true,
    mappingStatus,
  })

  if (!masterOptions.length) return pending(unwrappedLabel, 'not_in_master')

  const matches = masterOptions.filter(
    option => normalizeSarafOptionLabel(option.label) === canonicalSource,
  )
  if (!matches.length) return pending(unwrappedLabel, 'not_in_master')
  if (matches.length > 1) return pending(String(matches[0].label), 'ambiguous_master')

  const option = matches[0]
  const masterCode = option.code == null ? null : Number(option.code)
  if (
    sourceCode != null &&
    (sourceCode < 1 || sourceCode > 3 || masterCode !== sourceCode)
  ) {
    return pending(String(option.label), 'source_code_conflict')
  }

  const classified = typeof option.numerator === 'boolean' &&
    option.denominator !== false &&
    option.review_required !== true

  return {
    label: String(option.label),
    code: masterCode,
    numerator: typeof option.numerator === 'boolean' ? option.numerator : null,
    denominator: option.denominator !== false,
    sourceLabel,
    sourceCode,
    reviewRequired: true,
    mappingStatus: classified ? 'mapped_existing_master' : 'mapped_pending_classification',
  }
}

export function calculateSarafStayDays(
  admissionDate: string,
  dischargeDate: string | null,
): number | null {
  const admission = normalizeSarafDate(admissionDate)
  const discharge = dischargeDate ? normalizeSarafDate(dischargeDate) : null
  if (!admission || !discharge || discharge < admission) return null
  return Math.round((
    Date.parse(discharge + 'T00:00:00Z') -
    Date.parse(admission + 'T00:00:00Z')
  ) / 86400000)
}

export function makeSarafSubjectKey(year: number, sourceExcelRow: number): string {
  if (year !== 2026) throw new Error('Tahun profil Rawat Inap Saraf harus 2026.')
  if (!Number.isInteger(sourceExcelRow) || sourceExcelRow < 3 || sourceExcelRow > 5102) {
    throw new Error('Nomor baris Excel Rawat Inap Saraf harus berada di rentang 3–5102.')
  }
  return 'excel-pmkp-rawat-inap-saraf-2026:row:' + sourceExcelRow
}

export function isSarafFormulaError(value: unknown): boolean {
  return typeof value === 'string' && FORMULA_ERRORS.has(value.trim().toUpperCase())
}
