import { normalizeExactHeader } from './excel-paste.ts'

export type PonekIndicatorOption = {
  code?: number | null
  label: string
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}

export type PonekIndicatorProfile = {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  is_active?: boolean
  status?: string
  options_json?: PonekIndicatorOption[] | null
}

export type PonekSourceAnswer = {
  label: string
  code: number | null
  sourceLabel: string
  sourceCode: number | null
  reviewRequired: true
  mappingStatus: 'mapped_pending_classification' | 'not_in_master' | 'ambiguous_master' | 'source_code_conflict'
}

export const PONEK_SOURCE_INDICATORS = [
  { sourceSequence: 1, code: '33.1', header: 'Petugas', sourceHeader: 'Petugas' },
  { sourceSequence: 2, code: '33.2', header: 'Ruptur Perineum', sourceHeader: 'Ruptur Perineum' },
  { sourceSequence: 3, code: '33.3', header: 'Komunikasi Pra-Kedatangan', sourceHeader: 'Komunikasi Pra-Kedatangan' },
  { sourceSequence: 4, code: '33.4', header: 'Stabilisasi Pra-Merujuk', sourceHeader: 'Stabilisasi Pra-Merujuk' },
] as const

const FORMULA_ERRORS = new Set(['#VALUE!', '#NUM!', '#REF!', '#DIV/0!', '#N/A', '#NAME?'])

const CORE_HEADER_ALIASES: Record<string, string[]> = {
  sourceNo: ['No.', 'No'],
  patientName: ['Nama Pasien'],
  medicalRecordNo: ['No. Rekam Medis', 'No RM', 'No. RM.'],
  admissionDate: ['Tanggal Masuk'],
  patientCategory: ['Kategori Pasien'],
  diagnosis: ['Diagnosa', 'Diagnosis'],
  arrivalOrigin: ['Asal Kedatangan'],
  admissionCondition: ['Kondisi Masuk'],
}

export type PonekHeaderMap = {
  indexes: Record<string, number>
  missingHeaders: string[]
  duplicateHeaders: string[]
}

/** Resolve row-2 Logbook headers to stable importer keys (1-based worksheet columns). */
export function mapPonekLogbookHeaders(headerValues: unknown[]): PonekHeaderMap {
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
    const matches = [...new Set(aliases.flatMap(alias => columns.get(normalizeExactHeader(alias)) ?? [])]
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
  for (const item of PONEK_SOURCE_INDICATORS) resolve('indicator:' + item.code, [item.sourceHeader])

  return { indexes, missingHeaders, duplicateHeaders }
}

/** Do not mistake formula-filled No. cells below the dataset for patient episodes. */
export function hasPonekLogbookData(values: Record<string, unknown>): boolean {
  const keys = [
    'patientName', 'medicalRecordNo', 'admissionDate', 'patientCategory',
    'diagnosis', 'arrivalOrigin', 'admissionCondition',
    ...PONEK_SOURCE_INDICATORS.map(item => 'indicator:' + item.code),
  ]
  return keys.some(key => String(values[key] ?? '').trim() !== '')
}

function validDate(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return String(year).padStart(4, '0') + '-' +
    String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
}

/** Accept Excel serials, native Dates, ISO, Indonesian D/M/Y and English/Indonesian month names. */
export function normalizePonekDate(value: unknown): string | null {
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
  const raw = value
    .normalize('NFKC')
    .replace(/[\u00a0\u202f\u2007]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
  if (!raw) return null

  if (/^\d+(?:[.,]\d+)?$/.test(raw)) return normalizePonekDate(Number(raw.replace(',', '.')))

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/)
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/)
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])
    return validDate(year, Number(dmy[2]), Number(dmy[1]))
  }

  const monthNames: Record<string, number> = {
    jan: 1, january: 1, januari: 1,
    feb: 2, february: 2, februari: 2,
    mar: 3, march: 3, maret: 3,
    apr: 4, april: 4,
    may: 5, mei: 5,
    jun: 6, june: 6, juni: 6,
    jul: 7, july: 7, juli: 7,
    aug: 8, august: 8, agustus: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10, oktober: 10,
    nov: 11, november: 11,
    dec: 12, december: 12, desember: 12,
  }
  const named = raw.toLocaleLowerCase('en-US').match(/^(\d{1,2})\s+([a-z]+)\s+(\d{4})$/)
  if (named) {
    const month = monthNames[named[2]]
    if (month) return validDate(Number(named[3]), month, Number(named[1]))
  }

  return null
}

export function normalizePonekOptionLabel(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u00a0\u202f\u2007]/g, ' ')
    .replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('id-ID')
}

/** Source codes are retained as provenance; they are not numerator classifications. */
export function parsePonekSourceAnswer(
  raw: string,
  options: PonekIndicatorOption[] | null | undefined,
): PonekSourceAnswer | null {
  const sourceLabel = String(raw ?? '').normalize('NFKC').replace(/[\u00a0\u202f\u2007]/g, ' ').trim()
  if (!sourceLabel) return null

  const suffix = sourceLabel.match(/\(\s*code\s*(\d+)\s*\)\s*$/i)
  const sourceCode = suffix ? Number(suffix[1]) : null
  const label = sourceLabel.replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '').trim()
  const canonical = normalizePonekOptionLabel(label)
  const masterOptions = Array.isArray(options)
    ? options.filter(option => option && String(option.label ?? '').trim())
    : []

  if (!masterOptions.length) {
    return { label, code: null, sourceLabel, sourceCode, reviewRequired: true, mappingStatus: 'not_in_master' }
  }

  const matches = masterOptions.filter(option => normalizePonekOptionLabel(option.label) === canonical)
  if (!matches.length) {
    return { label, code: null, sourceLabel, sourceCode, reviewRequired: true, mappingStatus: 'not_in_master' }
  }
  if (matches.length > 1) {
    return { label, code: null, sourceLabel, sourceCode, reviewRequired: true, mappingStatus: 'ambiguous_master' }
  }

  const option = matches[0]
  const masterCode = option.code == null ? null : Number(option.code)
  if (sourceCode != null && (sourceCode < 1 || sourceCode > 3 || masterCode !== sourceCode)) {
    return {
      label: String(option.label), code: null, sourceLabel, sourceCode,
      reviewRequired: true, mappingStatus: 'source_code_conflict',
    }
  }

  return {
    label: String(option.label), code: masterCode, sourceLabel, sourceCode,
    reviewRequired: true, mappingStatus: 'mapped_pending_classification',
  }
}

export function makePonekSubjectKey(year: number, sourceExcelRow: number): string {
  if (year !== 2026) throw new Error('Tahun profil PONEK harus 2026.')
  if (!Number.isInteger(sourceExcelRow) || sourceExcelRow < 3 || sourceExcelRow > 5300) {
    throw new Error('Nomor baris Excel PONEK tidak valid.')
  }
  return 'excel-pmkp-ponek-2026:row:' + sourceExcelRow
}

export function isPonekFormulaError(value: unknown): boolean {
  return typeof value === 'string' && FORMULA_ERRORS.has(value.trim().toUpperCase())
}
