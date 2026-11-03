import { normalizeExactHeader } from './excel-paste.ts'

export type SurgicalIndicatorOption = {
  code?: number | null
  label: string
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}

export type SurgicalIndicatorProfile = {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  is_active?: boolean
  status?: string
  options_json?: SurgicalIndicatorOption[] | null
}

export type SurgicalSourceAnswer = {
  label: string
  code: number | null
  numerator: boolean | null
  denominator: boolean
  sourceLabel: string
  sourceCode: number | null
  reviewRequired: true
  mappingStatus: 'mapped_pending_classification' | 'mapped_existing_master' | 'not_in_master' | 'ambiguous_master' | 'source_code_conflict'
}

export const SURGICAL_SOURCE_INDICATORS = [
  { code: '23.5', header: 'Visite Spesialis', sourceHeader: 'Visite Spesialis' },
  { code: '23.7', header: 'Validitas Asesmen Keperawatan', sourceHeader: 'Validitas Asesmen Keperawatan' },
  { code: '23.4', header: 'Transfer IGD', sourceHeader: 'Transfer IGD' },
  { code: '23.1', header: 'Batal Operasi', sourceHeader: 'Batal Operasi' },
  { code: '23.6', header: 'Nyeri Terkontrol', sourceHeader: 'Nyeri Terkontrol' },
  { code: '23.2', header: 'Kekosongan Linen', sourceHeader: 'Kekosongan Linen' },
  { code: '23.3', header: 'Kekosongan Obat', sourceHeader: 'Kekosongan Obat' },
] as const

const CORE_HEADER_ALIASES: Record<string, string[]> = {
  sourceNo: ['No.', 'No'],
  patientName: ['Nama Pasien'],
  medicalRecordNo: ['Column1', 'No. Rekam Medis', 'No RM'],
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
  '23.2': {
    'adanya kekosongan linen': 'Terjadi kekosongan linen',
    'tidak terjadi kekosongan linen': 'Tidak terjadi kekosongan linen',
  },
  '23.3': {
    'adanya kekosongan obat': 'Terjadi kekosongan obat',
    'tidak adanya kekosongan obat': 'Tidak terjadi kekosongan obat',
  },
}

const FORMULA_ERRORS = new Set(['#VALUE!', '#NUM!', '#REF!', '#DIV/0!', '#N/A', '#NAME?'])

export type SurgicalHeaderMap = {
  indexes: Record<string, number>
  missingHeaders: string[]
  duplicateHeaders: string[]
}

/** Maps row-2 headings to stable keys, including the source's generic Column1 MRN header. */
export function mapSurgicalLogbookHeaders(headerValues: unknown[]): SurgicalHeaderMap {
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
    missingHeaders.push(aliases[0])
  }

  for (const [key, aliases] of Object.entries(CORE_HEADER_ALIASES)) resolve(key, aliases)
  for (const item of SURGICAL_SOURCE_INDICATORS) resolve('indicator:' + item.code, [item.sourceHeader])
  return { indexes, missingHeaders, duplicateHeaders }
}

/** Ignores preformatted worksheet rows unless patient identity or admission date exists. */
export function hasSurgicalLogbookData(values: Record<string, unknown>): boolean {
  return ['patientName', 'medicalRecordNo', 'admissionDate'].some(
    key => String(values[key] ?? '').trim() !== '',
  )
}

function validDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return String(year).padStart(4, '0') + '-' +
    String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
}

/** Reads Excel serials, native Dates, ISO strings, and Indonesian D/M/YYYY strings without guessing malformed values. */
export function normalizeSurgicalDate(value: unknown): string | null {
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
  const raw = value.normalize('NFKC').replace(/[\u00a0\u202f\u2007]/g, ' ').trim().replace(/\s+/g, ' ')
  if (!raw) return null
  if (/^\d+(?:[.,]\d+)?$/.test(raw)) return normalizeSurgicalDate(Number(raw.replace(',', '.')))

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/)
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dmy = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (dmy) return validDate(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))
  return null
}

export function normalizeSurgicalOptionLabel(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u00a0\u202f\u2007]/g, ' ')
    .replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('id-ID')
}

/** Exact source label/code matching, with explicit aliases for the two pre-classified linen/medicine masters. */
export function parseSurgicalSourceAnswer(
  raw: string,
  options: SurgicalIndicatorOption[] | null | undefined,
  indicatorCode: string,
): SurgicalSourceAnswer | null {
  const sourceLabel = String(raw ?? '').normalize('NFKC').replace(/[\u00a0\u202f\u2007]/g, ' ').trim()
  if (!sourceLabel) return null

  const suffix = sourceLabel.match(/\(\s*code\s*(\d+)\s*\)\s*$/i)
  const sourceCode = suffix ? Number(suffix[1]) : null
  const unwrappedLabel = sourceLabel.replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '').trim()
  const normalizedSource = normalizeSurgicalOptionLabel(unwrappedLabel)
  const alias = SOURCE_LABEL_ALIASES[indicatorCode]?.[normalizedSource]
  const canonicalSource = alias ? normalizeSurgicalOptionLabel(alias) : normalizedSource
  const masterOptions = Array.isArray(options)
    ? options.filter(option => option && String(option.label ?? '').trim())
    : []

  if (!masterOptions.length) {
    return {
      label: unwrappedLabel, code: null, numerator: null, denominator: true,
      sourceLabel, sourceCode, reviewRequired: true, mappingStatus: 'not_in_master',
    }
  }

  const matches = masterOptions.filter(option => normalizeSurgicalOptionLabel(option.label) === canonicalSource)
  if (!matches.length) {
    return {
      label: unwrappedLabel, code: null, numerator: null, denominator: true,
      sourceLabel, sourceCode, reviewRequired: true, mappingStatus: 'not_in_master',
    }
  }
  if (matches.length > 1) {
    return {
      label: String(matches[0].label), code: null, numerator: null, denominator: true,
      sourceLabel, sourceCode, reviewRequired: true, mappingStatus: 'ambiguous_master',
    }
  }

  const option = matches[0]
  const masterCode = option.code == null ? null : Number(option.code)
  if (sourceCode != null && (sourceCode < 1 || sourceCode > 3 || masterCode !== sourceCode)) {
    return {
      label: String(option.label), code: null, numerator: null, denominator: true,
      sourceLabel, sourceCode, reviewRequired: true, mappingStatus: 'source_code_conflict',
    }
  }

  return {
    label: String(option.label),
    code: masterCode,
    numerator: typeof option.numerator === 'boolean' ? option.numerator : null,
    denominator: option.denominator !== false,
    sourceLabel,
    sourceCode,
    reviewRequired: true,
    mappingStatus: indicatorCode === '23.2' || indicatorCode === '23.3'
      ? 'mapped_existing_master'
      : 'mapped_pending_classification',
  }
}

export function calculateSurgicalStayDays(admissionDate: string, dischargeDate: string | null): number | null {
  const admission = normalizeSurgicalDate(admissionDate)
  const discharge = dischargeDate ? normalizeSurgicalDate(dischargeDate) : null
  if (!admission || !discharge || discharge < admission) return null
  return Math.round((Date.parse(discharge + 'T00:00:00Z') - Date.parse(admission + 'T00:00:00Z')) / 86400000)
}

export function makeSurgicalSubjectKey(year: number, sourceExcelRow: number): string {
  if (year !== 2026) throw new Error('Tahun profil Rawat Inap Bedah harus 2026.')
  if (!Number.isInteger(sourceExcelRow) || sourceExcelRow < 3 || sourceExcelRow > 5002) {
    throw new Error('Nomor baris Excel Rawat Inap Bedah tidak valid.')
  }
  return 'excel-pmkp-rawat-inap-bedah-2026:row:' + sourceExcelRow
}

export function isSurgicalFormulaError(value: unknown): boolean {
  return typeof value === 'string' && FORMULA_ERRORS.has(value.trim().toUpperCase())
}
