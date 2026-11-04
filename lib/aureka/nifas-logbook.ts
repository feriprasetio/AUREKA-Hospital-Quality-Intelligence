import { normalizeExactHeader } from './excel-paste.ts'

export type NifasIndicatorOption = {
  code?: number | null
  label: string
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}

export type NifasIndicatorProfile = {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  is_active?: boolean
  status?: string
  options_json?: NifasIndicatorOption[] | null
}

export type NifasSourceAnswer = {
  label: string
  code: number | null
  sourceLabel: string
  sourceCode: number | null
  reviewRequired: true
  mappingStatus: 'mapped_pending_classification' | 'not_in_master' | 'ambiguous_master' | 'source_code_conflict'
}

export const NIFAS_SOURCE_INDICATORS = [
  { sourceSequence: 1, code: '19.8', header: 'Visite Spesialis', sourceHeader: 'Visite Spesialis' },
  { sourceSequence: 2, code: '19.9', header: 'Validitas Asesmen Kebidanan', sourceHeader: 'Validitas Asesmen Kebidanan' },
  { sourceSequence: 3, code: '19.7', header: 'Transfer IGD', sourceHeader: 'Transfer IGD' },
  { sourceSequence: 5, code: '19.1', header: 'Antibiotik Profilaksis', sourceHeader: 'Antibiotik Profilaksis' },
  { sourceSequence: 6, code: '19.2', header: 'IMD', sourceHeader: 'IMD' },
  { sourceSequence: 7, code: '19.3', header: 'Anestesi Regional', sourceHeader: 'Anestesi Regional' },
  { sourceSequence: 8, code: '19.4', header: 'Hemostasis', sourceHeader: 'Hemostasis' },
  { sourceSequence: 9, code: '19.5', header: 'Indikasi SC POGI', sourceHeader: 'Indikasi SC POGI' },
  { sourceSequence: 10, code: '19.10', header: 'LOS Post SC <3', sourceHeader: 'LOS Post SC <3' },
] as const

export const NIFAS_UNMAPPED_SOURCE_HEADER = 'Kekosongan BHP/Linen'

const FORMULA_ERRORS = new Set(['#VALUE!', '#NUM!', '#REF!', '#DIV/0!', '#N/A', '#NAME?'])

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
  receivingBidan: ['Bidan Penerima'],
  dpjp: ['DPJP'],
  unmappedBhpLinen: [NIFAS_UNMAPPED_SOURCE_HEADER],
}

export type NifasHeaderMap = {
  indexes: Record<string, number>
  missingHeaders: string[]
  duplicateHeaders: string[]
}

/** Resolve the actual workbook header row to stable importer keys (1-based columns). */
export function mapNifasLogbookHeaders(headerValues: unknown[]): NifasHeaderMap {
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
  for (const item of NIFAS_SOURCE_INDICATORS) resolve('indicator:' + item.code, [item.sourceHeader])

  return { indexes, missingHeaders, duplicateHeaders }
}

/** Empty preformatted rows (often with sequence/LOS formulas) are not patient episodes. */
export function hasNifasLogbookData(values: Record<string, unknown>): boolean {
  const keys = [
    'patientName', 'medicalRecordNo', 'admissionDate', 'dischargeDate', 'diagnosis',
    'patientCategory', 'dischargeStatus', 'receivingBidan', 'dpjp', 'unmappedBhpLinen',
    ...NIFAS_SOURCE_INDICATORS.map(item => 'indicator:' + item.code),
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

/** Accept Excel serials, native ExcelJS Dates, ISO, Indonesian D/M/Y and English D Mon Y text. */
export function normalizeNifasDate(value: unknown): string | null {
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

  if (/^\d+(?:[.,]\d+)?$/.test(raw)) return normalizeNifasDate(Number(raw.replace(',', '.')))

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

export function normalizeNifasOptionLabel(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u00a0\u202f\u2007]/g, ' ')
    .replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('id-ID')
}

/** Source codes are retained, but never interpreted as numerator/denominator flags. */
export function parseNifasSourceAnswer(
  raw: string,
  options: NifasIndicatorOption[] | null | undefined,
): NifasSourceAnswer | null {
  const sourceLabel = String(raw ?? '').normalize('NFKC').replace(/[\u00a0\u202f\u2007]/g, ' ').trim()
  if (!sourceLabel) return null

  const suffix = sourceLabel.match(/\(\s*code\s*(\d+)\s*\)\s*$/i)
  const sourceCode = suffix ? Number(suffix[1]) : null
  const label = sourceLabel.replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '').trim()
  const canonical = normalizeNifasOptionLabel(label)
  const masterOptions = Array.isArray(options)
    ? options.filter(option => option && String(option.label ?? '').trim())
    : []

  if (!masterOptions.length) {
    return { label, code: null, sourceLabel, sourceCode, reviewRequired: true, mappingStatus: 'not_in_master' }
  }

  const matches = masterOptions.filter(option => normalizeNifasOptionLabel(option.label) === canonical)
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
      label: String(option.label),
      code: null,
      sourceLabel,
      sourceCode,
      reviewRequired: true,
      mappingStatus: 'source_code_conflict',
    }
  }

  return {
    label: String(option.label),
    code: masterCode,
    sourceLabel,
    sourceCode,
    reviewRequired: true,
    mappingStatus: 'mapped_pending_classification',
  }
}

export function calculateNifasStayDays(admissionDate: string, dischargeDate: string | null): number | null {
  const admission = normalizeNifasDate(admissionDate)
  const discharge = dischargeDate ? normalizeNifasDate(dischargeDate) : null
  if (!admission || !discharge) return null
  const start = Date.parse(admission + 'T00:00:00Z')
  const end = Date.parse(discharge + 'T00:00:00Z')
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return Math.round((end - start) / 86400000)
}

export function makeNifasSubjectKey(year: number, sourceExcelRow: number): string {
  if (!Number.isInteger(year) || year < 2026 || year > 2100) throw new Error('Tahun profil Nifas tidak valid.')
  if (!Number.isInteger(sourceExcelRow) || sourceExcelRow < 3 || sourceExcelRow > 5010) {
    throw new Error('Nomor baris Excel Nifas tidak valid.')
  }
  return 'excel-pmkp-nifas-' + year + ':row:' + sourceExcelRow
}

export function isNifasFormulaError(value: unknown): boolean {
  return typeof value === 'string' && FORMULA_ERRORS.has(value.trim().toUpperCase())
}
