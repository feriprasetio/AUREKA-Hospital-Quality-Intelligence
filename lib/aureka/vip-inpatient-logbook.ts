import { normalizeExactHeader } from './excel-paste.ts'

export type VipIndicatorOption = {
  code?: number | null
  label: string
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}

export type VipIndicatorProfile = {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  is_active?: boolean
  status?: string
  options_json?: VipIndicatorOption[] | null
}

export type VipSourceAnswer = {
  label: string
  code: number | null
  numerator: boolean | null
  denominator: boolean
  sourceLabel: string
  sourceCode: number | null
  reviewRequired: true
  sourceProfileMatch: boolean
  mappingStatus: 'mapped_pending_classification' | 'mapped_existing_master' | 'not_in_master' | 'ambiguous_master' | 'source_code_conflict'
}

export const VIP_SOURCE_INDICATORS = [
  { code: '27.9', header: 'Visite Spesialis', sourceHeader: 'Visite Spesialis', profileRow: 3 },
  { code: '27.12', header: 'Validitas Asesmen', sourceHeader: 'Validitas Asesmen Keperawatan', profileRow: 4 },
  { code: '27.8', header: 'Transfer IGD', sourceHeader: 'Transfer IGD', profileRow: 5 },
  { code: '27.10', header: 'Pengkajian IGD', sourceHeader: 'Pengkajian IGD', profileRow: 6 },
  { code: '27.6', header: 'Kekosongan BHP/Linen', sourceHeader: 'Kekosongan Linen', profileRow: 7 },
  { code: '27.7', header: 'Kekosongan Obat', sourceHeader: 'Kekosongan Obat', profileRow: 8 },
  { code: '27.2', header: 'Perawatan Kaki', sourceHeader: 'Perawatan Kaki', profileRow: 9 },
  { code: '27.3', header: 'Kontrol Metabolik', sourceHeader: 'Kontrol Metabolik', profileRow: 10 },
  { code: '27.4', header: 'ABI', sourceHeader: 'ABI', profileRow: 11 },
  { code: '27.5', header: 'PEDIS', sourceHeader: 'PEDIS', profileRow: 12 },
  { code: '27.11', header: 'Tanpa Amputasi', sourceHeader: 'Tanpa Amputasi', profileRow: 13 },
  { code: '27.1', header: 'Hifema', sourceHeader: 'Hifema', profileRow: 14 },
] as const

const CORE_HEADER_ALIASES: Record<string, string[]> = {
  sourceNo: ['No.', 'No'],
  patientName: ['Nama Pasien'],
  medicalRecordNo: ['No. Rekam Medis', 'No RM', 'No. RM.'],
  admissionDate: ['Tanggal Masuk', 'Pelayanan di Ruangan'],
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
  '27.6': {
    'pasien dirawat tanpa kendala': 'Tidak terjadi kekosongan linen',
    'pasien dirawat dengan kekosongan linen': 'Terjadi kekosongan linen',
  },
  '27.7': {
    'tidak ada obat kosong selama perawatan': 'Tidak terjadi kekosongan obat',
    'ada obat yang kosong selama perawatan': 'Terjadi kekosongan obat',
  },
}

const FORMULA_ERRORS = new Set(['#VALUE!', '#NUM!', '#REF!', '#DIV/0!', '#N/A', '#NAME?'])

export type VipHeaderMap = {
  indexes: Record<string, number>
  missingHeaders: string[]
  duplicateHeaders: string[]
}

export function mapVipLogbookHeaders(headerValues: unknown[]): VipHeaderMap {
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
  for (const item of VIP_SOURCE_INDICATORS) resolve('indicator:' + item.code, [item.sourceHeader])
  return { indexes, missingHeaders, duplicateHeaders }
}

export function hasVipLogbookData(values: Record<string, unknown>): boolean {
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
export function normalizeVipDate(value: unknown): string | null {
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
  if (/^\d+(?:[.,]\d+)?$/.test(raw)) return normalizeVipDate(Number(raw.replace(',', '.')))

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ].*)?$/)
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/)
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])
    return validDate(year, Number(dmy[2]), Number(dmy[1]))
  }
  return null
}

export function normalizeVipOptionLabel(value: string): string {
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
 * Ten VIP indicators have no published choices; only Linen and Medicine use the two
 * currently published master option sets. Source-profile mismatch prevents classification.
 */
export function parseVipSourceAnswer(
  raw: string,
  options: VipIndicatorOption[] | null | undefined,
  indicatorCode: string,
  sourceProfileOptions: string[] = [],
): VipSourceAnswer | null {
  const sourceLabel = String(raw ?? '').normalize('NFKC').replace(/[\\u00a0\\u202f\\u2007]/g, ' ').trim()
  if (!sourceLabel) return null

  const suffix = sourceLabel.match(/\\(\\s*code\\s*(\\d+)\\s*\\)\\s*$/i)
  const sourceCode = suffix ? Number(suffix[1]) : null
  const unwrappedLabel = sourceLabel.replace(/\\s*\\(\\s*code\\s*\\d+\\s*\\)?\\s*$/i, '').trim()
  const normalizedSource = normalizeVipOptionLabel(unwrappedLabel)
  const alias = SOURCE_LABEL_ALIASES[indicatorCode]?.[normalizedSource]
  const canonicalSource = alias ? normalizeVipOptionLabel(alias) : normalizedSource
  const masterOptions = Array.isArray(options)
    ? options.filter(option => option && String(option.label ?? '').trim())
    : []
  const sourceProfileMatch = sourceProfileOptions.length === 0
    ? true
    : sourceProfileOptions.some(option => normalizeVipOptionLabel(option) === normalizeVipOptionLabel(sourceLabel))

  if (!sourceProfileMatch) {
    return {
      label: unwrappedLabel, code: null, numerator: null, denominator: true,
      sourceLabel, sourceCode, sourceProfileMatch, reviewRequired: true, mappingStatus: 'not_in_master',
    }
  }

  if (!masterOptions.length) {
    return {
      label: unwrappedLabel, code: null, numerator: null, denominator: true,
      sourceLabel, sourceCode, sourceProfileMatch, reviewRequired: true, mappingStatus: 'not_in_master',
    }
  }

  const matches = masterOptions.filter(option => normalizeVipOptionLabel(option.label) === canonicalSource)
  if (!matches.length) {
    return {
      label: unwrappedLabel, code: null, numerator: null, denominator: true,
      sourceLabel, sourceCode, sourceProfileMatch, reviewRequired: true, mappingStatus: 'not_in_master',
    }
  }
  if (matches.length > 1) {
    return {
      label: String(matches[0].label), code: null, numerator: null, denominator: true,
      sourceLabel, sourceCode, sourceProfileMatch, reviewRequired: true, mappingStatus: 'ambiguous_master',
    }
  }

  const option = matches[0]
  const masterCode = option.code == null ? null : Number(option.code)
  if (sourceCode != null && (sourceCode < 1 || sourceCode > 3 || masterCode !== sourceCode)) {
    return {
      label: String(option.label), code: null, numerator: null, denominator: true,
      sourceLabel, sourceCode, sourceProfileMatch, reviewRequired: true, mappingStatus: 'source_code_conflict',
    }
  }

  return {
    label: String(option.label),
    code: masterCode,
    numerator: typeof option.numerator === 'boolean' ? option.numerator : null,
    denominator: option.denominator !== false,
    sourceLabel,
    sourceCode,
    sourceProfileMatch,
    reviewRequired: true,
    mappingStatus: 'mapped_existing_master',
  }
}

export function calculateVipStayDays(admissionDate: string, dischargeDate: string | null): number | null {
  const admission = normalizeVipDate(admissionDate)
  const discharge = dischargeDate ? normalizeVipDate(dischargeDate) : null
  if (!admission || !discharge || discharge < admission) return null
  return Math.round((Date.parse(discharge + 'T00:00:00Z') - Date.parse(admission + 'T00:00:00Z')) / 86400000)
}

export function makeVipSubjectKey(year: number, sourceExcelRow: number): string {
  if (year !== 2026) throw new Error('Tahun profil Rawat Inap VIP harus 2026.')
  if (!Number.isInteger(sourceExcelRow) || sourceExcelRow < 3 || sourceExcelRow > 5102) {
    throw new Error('Nomor baris Excel Rawat Inap VIP harus berada di rentang 3–5102.')
  }
  return 'excel-pmkp-rawat-inap-vip-2026:row:' + sourceExcelRow
}

export function isVipFormulaError(value: unknown): boolean {
  return typeof value === 'string' && FORMULA_ERRORS.has(value.trim().toUpperCase())
}
