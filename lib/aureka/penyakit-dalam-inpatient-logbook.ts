import { normalizeExactHeader } from './excel-paste.ts'

export type InternalMedicineIndicatorOption = {
  code?: number | null
  label: string
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}

export type InternalMedicineIndicatorProfile = {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  is_active?: boolean
  status?: string
  options_json?: InternalMedicineIndicatorOption[] | null
}

export type InternalMedicineSourceAnswer = {
  label: string
  code: number | null
  numerator: boolean | null
  denominator: boolean
  sourceLabel: string
  sourceCode: number | null
  reviewRequired: boolean
  freeText?: string
  mappingStatus: 'mapped' | 'mapped_pending_classification' | 'mapped_existing_master' | 'not_in_master' | 'ambiguous_master' | 'source_code_conflict'
}

export const INTERNAL_MEDICINE_SOURCE_INDICATORS = [
  { code: '25.12', header: 'Visite Spesialis', sourceHeader: 'Visite Spesialis' },
  { code: '25.13', header: 'Clinical Pathway', sourceHeader: 'Clinical Pathway' },
  { code: '25.18', header: 'Validitas Asesmen Keperawatan', sourceHeader: 'Validitas Asesmen Keperawatan' },
  { code: '25.11', header: 'Transfer IGD', sourceHeader: 'Transfer IGD' },
  { code: '25.9', header: 'Kekosongan Linen', sourceHeader: 'Kekosongan Linen Hari Pertama' },
  { code: '25.10', header: 'Kekosongan Obat', sourceHeader: 'Kekosongan Obat Selama Dirawat' },
  { code: '25.5', header: 'Fungsi Ginjal/eGFR', sourceHeader: 'Fungsi Ginjal/eGFR' },
  { code: '25.6', header: 'USG Perawatan', sourceHeader: 'USG Perawatan' },
  { code: '25.7', header: 'Hemodialisis ≤48 Jam', sourceHeader: 'Hemodialisis ≤48 Jam' },
  { code: '25.14', header: 'Klinis PGTA', sourceHeader: 'Klinis PGTA' },
  { code: '25.15', header: 'Lab PGTA', sourceHeader: 'Lab PGTA' },
  { code: '25.17', header: 'Anemia', sourceHeader: 'Anemia' },
  { code: '25.1', header: 'Komponen Darah', sourceHeader: 'Komponen Darah' },
  { code: '25.2', header: 'Obat Vasoaktif', sourceHeader: 'Obat Vasoaktif' },
  { code: '25.3', header: 'Koagulasi Lengkap', sourceHeader: 'Koagulasi Lengkap' },
  { code: '25.4', header: 'EGD + Terapi', sourceHeader: 'EGD + Terapi' },
  { code: '25.8', header: 'HB Pulang >10', sourceHeader: 'HB Pulang >10' },
  { code: '25.16', header: 'Perdarahan Henti', sourceHeader: 'Perdarahan Henti' },
] as const

const CORE_HEADER_ALIASES: Record<string, string[]> = {
  sourceNo: ['No.', 'No'],
  patientName: ['Nama Pasien'],
  medicalRecordNo: ['No. Rekam Medis', 'Column1', 'No RM'],
  admissionDate: ['Tanggal Masuk'],
  dischargeDate: ['Tanggal Keluar'],
  diagnosis: ['Diagnosa Tegak', 'Diagnosis Tegak'],
  patientCategory: ['Kategori Pasien'],
  dischargeStatus: ['Status Pulang'],
  sourceLos: ['Lenght of Stay', 'Length of Stay'],
  receivingNurse: ['Perawat Penerima'],
  dpjp: ['DPJP'],
  diagnosisSearchKey: ['Dx'],
}

const SOURCE_LABEL_ALIASES: Record<string, Record<string, string>> = {
  '25.9': {
    'adanya kekosongan linen': 'Terjadi kekosongan linen',
    'tidak terjadi kekosongan linen': 'Tidak terjadi kekosongan linen',
  },
  '25.10': {
    'adanya kekosongan obat': 'Terjadi kekosongan obat',
    'tidak adanya kekosongan obat': 'Tidak terjadi kekosongan obat',
  },
}

const FORMULA_ERRORS = new Set(['#VALUE!', '#NUM!', '#REF!', '#DIV/0!', '#N/A', '#NAME?'])

export type InternalMedicineHeaderMap = {
  indexes: Record<string, number>
  missingHeaders: string[]
  duplicateHeaders: string[]
}

export function mapInternalMedicineLogbookHeaders(headerValues: unknown[]): InternalMedicineHeaderMap {
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

  const resolve = (key: string, aliases: string[], required = true) => {
    const matches = [...new Set(aliases.flatMap(alias => columns.get(normalizeExactHeader(alias)) ?? []))]
    if (matches.length > 1) {
      duplicateHeaders.push(aliases[0])
      return
    }
    if (matches.length === 1) {
      indexes[key] = matches[0]
      return
    }
    if (required) missingHeaders.push(aliases[0])
  }

  for (const [key, aliases] of Object.entries(CORE_HEADER_ALIASES)) {
    resolve(key, aliases, key !== 'diagnosisSearchKey')
  }
  for (const item of INTERNAL_MEDICINE_SOURCE_INDICATORS) {
    resolve('indicator:' + item.code, [item.sourceHeader])
  }
  return { indexes, missingHeaders, duplicateHeaders }
}

export function hasInternalMedicineLogbookData(values: Record<string, unknown>): boolean {
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

const MONTHS: Record<string, number> = {
  jan: 1, januari: 1, january: 1,
  feb: 2, februari: 2, february: 2,
  mar: 3, maret: 3, march: 3,
  apr: 4, april: 4,
  mei: 5, may: 5,
  jun: 6, juni: 6, june: 6,
  jul: 7, juli: 7, july: 7,
  agu: 8, agt: 8, agustus: 8, aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  okt: 10, oktober: 10, oct: 10, october: 10,
  nov: 11, november: 11,
  des: 12, desember: 12, dec: 12, december: 12,
}

/** Reads Excel serials, native Dates, ISO, Indonesian D/M/Y, and Indonesian/English month names. */
export function normalizeInternalMedicineDate(value: unknown): string | null {
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
  if (/^\d+(?:[.,]\d+)?$/.test(raw)) return normalizeInternalMedicineDate(Number(raw.replace(',', '.')))

  const iso = raw.match(/^(\d{4})[-\/](\d{1,2})[-\/](\d{1,2})(?:[T ].*)?$/)
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2}|\d{4})$/)
  if (dmy) {
    const year = dmy[3].length === 2 ? 2000 + Number(dmy[3]) : Number(dmy[3])
    return validDate(year, Number(dmy[2]), Number(dmy[1]))
  }

  const named = raw.toLocaleLowerCase('en-US')
    .replace(/[,]/g, ' ')
    .match(/^(\d{1,2})[\s-]+([a-z]+)[\s-]+(\d{2}|\d{4})$/)
  if (named) {
    const month = MONTHS[named[2]]
    const year = named[3].length === 2 ? 2000 + Number(named[3]) : Number(named[3])
    if (month) return validDate(year, month, Number(named[1]))
  }
  return null
}

export function normalizeInternalMedicineOptionLabel(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u00a0\u202f\u2007]/g, ' ')
    .replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('id-ID')
}

/** Match exact source labels/codes; only Linen and Medicine have explicit aliases to existing masters. */
export function parseInternalMedicineSourceAnswer(
  raw: string,
  options: InternalMedicineIndicatorOption[] | null | undefined,
  indicatorCode: string,
): InternalMedicineSourceAnswer | null {
  const sourceLabel = String(raw ?? '').normalize('NFKC').replace(/[\u00a0\u202f\u2007]/g, ' ').trim()
  const isMedicine = indicatorCode === '25.10'
  if (!sourceLabel && !isMedicine) return null
  const effectiveSource = sourceLabel || 'Tidak Adanya Kekosongan Obat (Code 1)'
  const suffix = effectiveSource.match(/\(\s*code\s*(\d+)\s*\)$/i)
  const sourceCode = suffix ? Number(suffix[1]) : null
  const unwrappedLabel = effectiveSource.replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '').trim()
  const normalizedSource = normalizeInternalMedicineOptionLabel(unwrappedLabel)
  const alias = SOURCE_LABEL_ALIASES[indicatorCode]?.[normalizedSource]
  const canonicalSource = alias ? normalizeInternalMedicineOptionLabel(alias) : normalizedSource
  const masterOptions = Array.isArray(options) ? options.filter(option => option && String(option.label ?? '').trim()) : []
  const pending = (status: InternalMedicineSourceAnswer['mappingStatus'], selectedLabel = unwrappedLabel): InternalMedicineSourceAnswer => ({
    label: selectedLabel, code: null, numerator: null, denominator: true,
    sourceLabel: effectiveSource, sourceCode, reviewRequired: true, mappingStatus: status,
  })
  if (!masterOptions.length) return pending('not_in_master')
  const matches = masterOptions.filter(option => normalizeInternalMedicineOptionLabel(option.label) === canonicalSource)
  if (matches.length > 1) return pending('ambiguous_master')
  if (matches.length === 1) {
    const option = matches[0]
    const masterCode = option.code == null ? null : Number(option.code)
    if (sourceCode != null && (sourceCode < 1 || sourceCode > 3 || masterCode !== sourceCode)) return pending('source_code_conflict', String(option.label))
    return {
      label: String(option.label), code: masterCode,
      numerator: typeof option.numerator === 'boolean' ? option.numerator : null,
      denominator: option.denominator !== false, sourceLabel: effectiveSource, sourceCode,
      reviewRequired: isMedicine ? false : true,
      freeText: isMedicine && sourceLabel && !alias ? sourceLabel : '',
      mappingStatus: isMedicine ? 'mapped_existing_master' : 'mapped_pending_classification',
    }
  }
  if (isMedicine) {
    const events = masterOptions.filter(option =>
      normalizeInternalMedicineOptionLabel(option.label) === normalizeInternalMedicineOptionLabel('Terjadi kekosongan obat')
      && Number(option.code) === 3 && option.denominator !== false && option.numerator === true,
    )
    if (events.length !== 1) return pending(events.length ? 'ambiguous_master' : 'not_in_master')
    if (sourceCode != null && sourceCode !== 3) return pending('source_code_conflict', String(events[0].label))
    return {
      label: String(events[0].label), code: 3, numerator: true, denominator: true,
      sourceLabel: effectiveSource, sourceCode: 3, reviewRequired: false,
      freeText: sourceLabel, mappingStatus: 'mapped_existing_master',
    }
  }
  return pending('not_in_master')
}
export function calculateInternalMedicineStayDays(admissionDate: string, dischargeDate: string | null): number | null {
  const admission = normalizeInternalMedicineDate(admissionDate)
  const discharge = dischargeDate ? normalizeInternalMedicineDate(dischargeDate) : null
  if (!admission || !discharge || discharge < admission) return null
  return Math.round((Date.parse(discharge + 'T00:00:00Z') - Date.parse(admission + 'T00:00:00Z')) / 86400000)
}

export function makeInternalMedicineSubjectKey(year: number, sourceExcelRow: number): string {
  if (year !== 2026) throw new Error('Tahun profil Rawat Inap Penyakit Dalam harus 2026.')
  if (!Number.isInteger(sourceExcelRow) || sourceExcelRow < 3 || sourceExcelRow > 5002) {
    throw new Error('Nomor baris Excel Rawat Inap Penyakit Dalam tidak valid.')
  }
  return 'excel-pmkp-rawat-inap-penyakit-dalam-2026:row:' + sourceExcelRow
}

export function isInternalMedicineFormulaError(value: unknown): boolean {
  return typeof value === 'string' && FORMULA_ERRORS.has(value.trim().toUpperCase())
}
