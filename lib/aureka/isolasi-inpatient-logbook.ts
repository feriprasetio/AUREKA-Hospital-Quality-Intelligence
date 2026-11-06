import { normalizeExactHeader } from './excel-paste.ts'

export type IsolasiIndicatorOption = {
  code?: number | null
  label: string
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}

export type IsolasiIndicatorProfile = {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  is_active?: boolean
  status?: string
  options_json?: IsolasiIndicatorOption[] | null
}

export type IsolasiSourceAnswer = {
  label: string
  code: number | null
  numerator: boolean | null
  denominator: boolean
  sourceLabel: string
  sourceCode: number | null
  reviewRequired: true
  mappingStatus: 'mapped_pending_classification' | 'mapped_existing_master' | 'not_in_master' | 'ambiguous_master' | 'source_code_conflict'
}

export const ISOLASI_SOURCE_INDICATORS = [
  { code: '24.8', header: 'Visite Spesialis', sourceHeader: 'Visite Spesialis' },
  { code: '24.10', header: 'Validitas Asesmen Keperawatan', sourceHeader: 'Validitas Asesmen Keperawatan' },
  { code: '24.9', header: 'Oksigen Transfer IGD', sourceHeader: 'Oksigen Transfer IGD' },
  { code: '24.6', header: 'Kekosongan Obat', sourceHeader: 'Kekosongan Obat' },
  { code: '24.5', header: 'Kekosongan Linen', sourceHeader: 'Kekosongan Linen' },
  { code: '24.1', header: 'Terapi OAT', sourceHeader: 'Terapi OAT' },
  { code: '24.2', header: 'Sputum/TCM', sourceHeader: 'Sputum/TCM' },
  { code: '24.3', header: 'SITB Pencatatan', sourceHeader: 'SITB Pencatatan' },
  { code: '24.4', header: 'Gejala TB Hilang', sourceHeader: 'Gejala TB Hilang' },
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
  // The workbook has an old, formula-derived diagnosis helper in column AG.
  // It is optional and never used as the source of the diagnosis.
  diagnosisSearchKey: ['Dx'],
}

const SOURCE_LABEL_ALIASES: Record<string, Record<string, string>> = {
  '24.5': {
    'adanya kekosongan linen': 'Terjadi kekosongan linen',
    'tidak terjadi kekosongan linen': 'Tidak terjadi kekosongan linen',
  },
  '24.6': {
    'adanya kekosongan obat': 'Terjadi kekosongan obat',
    'tidak adanya kekosongan obat': 'Tidak terjadi kekosongan obat',
  },
}

const FORMULA_ERRORS = new Set(['#VALUE!', '#NUM!', '#REF!', '#DIV/0!', '#N/A', '#NAME?'])

export type IsolasiHeaderMap = {
  indexes: Record<string, number>
  missingHeaders: string[]
  duplicateHeaders: string[]
}

export function mapIsolasiLogbookHeaders(headerValues: unknown[]): IsolasiHeaderMap {
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

  const optional = new Set(['patientCategory', 'dischargeStatus', 'sourceLos', 'receivingNurse', 'dpjp', 'diagnosisSearchKey'])
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
  for (const item of ISOLASI_SOURCE_INDICATORS) resolve('indicator:' + item.code, [item.sourceHeader])
  return { indexes, missingHeaders, duplicateHeaders }
}

export function hasIsolasiLogbookData(values: Record<string, unknown>): boolean {
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

/** Reads Excel serials, native Date values, ISO dates and Indonesian D/M/YYYY strings without guessing malformed values. */
export function normalizeIsolasiDate(value: unknown): string | null {
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
  if (/^\d+(?:[.,]\d+)?$/.test(raw)) return normalizeIsolasiDate(Number(raw.replace(',', '.')))

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/)
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/)
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])
    return validDate(year, Number(dmy[2]), Number(dmy[1]))
  }
  return null
}

export function normalizeIsolasiOptionLabel(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u00a0\u202f\u2007]/g, ' ')
    .replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('id-ID')
}

/**
 * Match source answers to existing master options only.
 * Seven Isolasi indicators have no published choices at present; their source values
 * remain not_in_master and review-required rather than being assigned invented codes.
 */
export function parseIsolasiSourceAnswer(
  raw: string,
  options: IsolasiIndicatorOption[] | null | undefined,
  indicatorCode: string,
): IsolasiSourceAnswer | null {
  const sourceLabel = String(raw ?? '').normalize('NFKC').replace(/[\u00a0\u202f\u2007]/g, ' ').trim()
  if (!sourceLabel) return null

  const suffix = sourceLabel.match(/\(\s*code\s*(\d+)\s*\)\s*$/i)
  const sourceCode = suffix ? Number(suffix[1]) : null
  const unwrappedLabel = sourceLabel.replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '').trim()
  const normalizedSource = normalizeIsolasiOptionLabel(unwrappedLabel)
  const alias = SOURCE_LABEL_ALIASES[indicatorCode]?.[normalizedSource]
  const canonicalSource = alias ? normalizeIsolasiOptionLabel(alias) : normalizedSource
  const masterOptions = Array.isArray(options)
    ? options.filter(option => option && String(option.label ?? '').trim())
    : []

  if (!masterOptions.length) {
    return {
      label: unwrappedLabel, code: null, numerator: null, denominator: true,
      sourceLabel, sourceCode, reviewRequired: true, mappingStatus: 'not_in_master',
    }
  }

  const matches = masterOptions.filter(option => normalizeIsolasiOptionLabel(option.label) === canonicalSource)
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
    mappingStatus: indicatorCode === '24.5' || indicatorCode === '24.6'
      ? 'mapped_existing_master'
      : 'mapped_pending_classification',
  }
}

export function calculateIsolasiStayDays(admissionDate: string, dischargeDate: string | null): number | null {
  const admission = normalizeIsolasiDate(admissionDate)
  const discharge = dischargeDate ? normalizeIsolasiDate(dischargeDate) : null
  if (!admission || !discharge || discharge < admission) return null
  return Math.round((Date.parse(discharge + 'T00:00:00Z') - Date.parse(admission + 'T00:00:00Z')) / 86400000)
}

export function makeIsolasiSubjectKey(year: number, sourceExcelRow: number): string {
  if (year !== 2026) throw new Error('Tahun profil Rawat Inap Isolasi harus 2026.')
  if (!Number.isInteger(sourceExcelRow) || sourceExcelRow < 3 || sourceExcelRow > 5002) {
    throw new Error('Nomor baris Excel Rawat Inap Isolasi tidak valid.')
  }
  return 'excel-pmkp-rawat-inap-isolasi-2026:row:' + sourceExcelRow
}

export function isIsolasiFormulaError(value: unknown): boolean {
  return typeof value === 'string' && FORMULA_ERRORS.has(value.trim().toUpperCase())
}
