import { normalizeExactHeader } from './excel-paste.ts'

export type PediatricIndicatorOption = {
  code?: number | null
  label: string
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}

export type PediatricIndicatorProfile = {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  is_active?: boolean
  status?: string
  options_json?: PediatricIndicatorOption[] | null
  schema_json?: Record<string, any> | null
}

export type PediatricSourceAnswer = {
  label: string
  code: number | null
  numerator: boolean | null
  denominator: boolean
  sourceLabel: string
  sourceCode: number | null
  reviewRequired: boolean
  mappingStatus: 'mapped' | 'mapped_pending_classification' | 'not_in_master' | 'ambiguous_master' | 'source_code_conflict'
}

export const PEDIATRIC_SOURCE_INDICATORS = [
  { sourceSequence: 1, code: '22.7', header: 'Visite Spesialis', sourceHeader: 'Visite Spesialis' },
  { sourceSequence: 2, code: '22.8', header: 'Validitas Asesmen Keperawatan', sourceHeader: 'Validitas Asesmen Keperawatan' },
  { sourceSequence: 3, code: '22.6', header: 'Transfer IGD', sourceHeader: 'Transfer IGD' },
  { sourceSequence: 4, code: '22.3', header: 'Infus Vena Perifer', sourceHeader: 'Infus Vena Perifer' },
  { sourceSequence: 5, code: '22.2', header: 'Ketenangan Pasien', sourceHeader: 'Ketenangan Pasien' },
  { sourceSequence: 8, code: '22.1', header: 'Assessment Stunting Wasting2', sourceHeader: 'Assessment Stunting Wasting2' },
] as const

export const PEDIATRIC_SOURCE_ONLY_FIELDS = [
  {
    key: '22.4_source_only',
    code: '22.4',
    header: 'Kekosongan Linen',
    mappingStatus: 'source_semantics_not_mapped',
    reason: 'Pilihan sumber (Menggunakan Linen/Stick Laken/Kekosongan) tidak sama dengan pilihan master 22.4; sumber dipertahankan untuk review tanpa konversi otomatis.',
  },
  {
    key: '22.5_source_only',
    code: '22.5',
    header: 'Kekosongan Obat',
    mappingStatus: 'free_text_source_not_mapped',
    reason: 'Kolom workbook berisi nama obat dalam teks bebas, bukan pilihan kategori yang dapat dipetakan secara valid ke master 22.5.',
  },
  {
    key: '22.9_source_only',
    code: '22.9',
    header: 'Demam 2–7H + Trombositopenia + ↑Ht',
    mappingStatus: 'clinical_definition_pending_source_only',
    reason: 'Profil 22.9 masih draf dan belum memiliki definisi N/D, arah, tipe ukur, serta target yang disahkan. Nilai sumber dipertahankan untuk review; tidak dipetakan atau dihitung sebagai capaian.',
  },
  {
    key: '22.10_source_only',
    code: '22.10',
    header: 'DR ≥1×/Hari',
    mappingStatus: 'clinical_definition_pending_source_only',
    reason: 'Profil 22.10 masih draf dan belum memiliki definisi N/D, arah, tipe ukur, serta target yang disahkan. Nilai sumber dipertahankan untuk review; tidak dipetakan atau dihitung sebagai capaian.',
  },
  {
    key: '22.11_source_only',
    code: '22.11',
    header: 'Kristaloid ≥500 cc/8J',
    mappingStatus: 'clinical_definition_pending_source_only',
    reason: 'Profil 22.11 masih draf dan belum memiliki definisi N/D, arah, tipe ukur, serta target yang disahkan. Nilai sumber dipertahankan untuk review; tidak dipetakan atau dihitung sebagai capaian.',
  },
  {
    key: '22.12_source_only',
    code: '22.12',
    header: 'Tidak DSS',
    mappingStatus: 'clinical_definition_pending_source_only',
    reason: 'Profil 22.12 masih draf dan belum memiliki definisi N/D, arah, tipe ukur, serta target yang disahkan. Nilai sumber dipertahankan untuk review; tidak dipetakan atau dihitung sebagai capaian.',
  },
] as const

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
  weight: ['Berat Badan'],
  height: ['Tinggi Badan'],
  birthDate: ['Tanggal Lahir'],
  ageText: ['Umur (Rumus)'],
  sourceLos: ['Lenght of Stay', 'Length of Stay'],
  receivingNurse: ['Perawat Penerima'],
  dpjp: ['DPJP'],
}

export type PediatricHeaderMap = {
  indexes: Record<string, number>
  missingHeaders: string[]
  duplicateHeaders: string[]
}

/** Resolve row-2 Logbook headers to stable importer keys (1-based worksheet columns). */
export function mapPediatricLogbookHeaders(headerValues: unknown[]): PediatricHeaderMap {
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

  for (const [key, aliases] of Object.entries(CORE_HEADER_ALIASES)) resolve(key, aliases)
  for (const item of PEDIATRIC_SOURCE_INDICATORS) resolve('indicator:' + item.code, [item.sourceHeader])
  for (const item of PEDIATRIC_SOURCE_ONLY_FIELDS) resolve(item.key, [item.header], false)

  return { indexes, missingHeaders, duplicateHeaders }
}

/** Ignore preformatted/formula-only rows; require patient identity evidence or admission date. */
export function hasPediatricLogbookData(values: Record<string, unknown>): boolean {
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

/** Accept Excel serials, native Dates, ISO, Indonesian D/M/Y and named months. */
export function normalizePediatricDate(value: unknown): string | null {
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

  if (/^\d+(?:[.,]\d+)?$/.test(raw)) return normalizePediatricDate(Number(raw.replace(',', '.')))

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

export function normalizePediatricOptionLabel(value: string): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u00a0\u202f\u2007]/g, ' ')
    .replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('id-ID')
}

/** Match source label/code to master option, but always leave N/D classification pending. */
export function parsePediatricSourceAnswer(
  raw: string,
  options: PediatricIndicatorOption[] | null | undefined,
  direction?: 'positive' | 'negative' | string | null,
): PediatricSourceAnswer | null {
  const sourceLabel = String(raw ?? '').normalize('NFKC').replace(/[\u00a0\u202f\u2007]/g, ' ').trim()
  if (!sourceLabel) return null

  const suffix = sourceLabel.match(/\(\s*code\s*(\d+)\s*\)$/i)
  const sourceCode = suffix ? Number(suffix[1]) : null
  const label = sourceLabel.replace(/\s*\(\s*code\s*\d+\s*\)\s*$/i, '').trim()
  const canonical = normalizePediatricOptionLabel(label)
  const masterOptions = Array.isArray(options)
    ? options.filter(option => option && String(option.label ?? '').trim())
    : []
  const pending = (status: PediatricSourceAnswer['mappingStatus'], selectedLabel = label): PediatricSourceAnswer => ({
    label: selectedLabel, code: null, numerator: null, denominator: true,
    sourceLabel, sourceCode, reviewRequired: true, mappingStatus: status,
  })

  if (!masterOptions.length) return pending('not_in_master')
  const matches = masterOptions.filter(option => normalizePediatricOptionLabel(option.label) === canonical)
  if (!matches.length) return pending('not_in_master')
  if (matches.length > 1) return pending('ambiguous_master')

  const option = matches[0]
  let masterCode = option.code == null ? null : Number(option.code)
  if (masterCode == null && label === 'Pasien Berusia Diatas 5 Tahun Tidak Dilakukan Screening') masterCode = 2
  if (masterCode == null && label === 'Pemasangan Infus dari IGD Bertahan Sampai Pasien Pulang') masterCode = 1
  if (masterCode == null && ['Visite Hari Libur','Divisitekan Spesialis Lain/Dokter Jaga Ruangan','Pasien APS Tidak Sempat Visite'].includes(label)) masterCode = 2

  if (sourceCode != null && (sourceCode < 1 || sourceCode > 3 || masterCode !== sourceCode)) {
    return pending('source_code_conflict', String(option.label))
  }
  if (masterCode == null || ![1,2,3].includes(masterCode) || !direction) {
    return pending('mapped_pending_classification', String(option.label))
  }

  return {
    label: String(option.label),
    code: masterCode,
    numerator: direction === 'negative' ? masterCode !== 1 : masterCode === 1,
    denominator: true,
    sourceLabel,
    sourceCode,
    reviewRequired: false,
    mappingStatus: 'mapped',
  }
}
export function calculatePediatricStayDays(admissionDate: string, dischargeDate: string | null): number | null {
  const admission = normalizePediatricDate(admissionDate)
  const discharge = dischargeDate ? normalizePediatricDate(dischargeDate) : null
  if (!admission || !discharge) return null
  const start = Date.parse(admission + 'T00:00:00Z')
  const end = Date.parse(discharge + 'T00:00:00Z')
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null
  return Math.round((end - start) / 86400000)
}

export function makePediatricSubjectKey(year: number, sourceExcelRow: number): string {
  if (year !== 2026) throw new Error('Tahun profil Rawat Inap Anak harus 2026.')
  if (!Number.isInteger(sourceExcelRow) || sourceExcelRow < 3 || sourceExcelRow > 5002) {
    throw new Error('Nomor baris Excel Rawat Inap Anak tidak valid.')
  }
  return 'excel-pmkp-rawat-inap-anak-2026:row:' + sourceExcelRow
}

export function isPediatricFormulaError(value: unknown): boolean {
  return typeof value === 'string' && FORMULA_ERRORS.has(value.trim().toUpperCase())
}
