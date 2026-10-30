export type LaboratoryIndicatorOption = {
  label: string
  code?: number | null
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}

export const LABORATORY_INDICATORS = [
  { code: '9.1', header: 'Darah Terbuang' },
  { code: '9.2', header: 'Unordered Specimen' },
  { code: '9.3', header: 'Delay Sampling' },
  { code: '9.4', header: 'Lapor Tes Kritis' },
  { code: '9.5', header: 'Histopatologi' },
] as const

export type LaboratoryIndicatorCode = typeof LABORATORY_INDICATORS[number]['code']

function dateParts(year: number, month: number, day: number, hour: number, minute: number, second: number): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2200 ||
      !Number.isInteger(month) || month < 1 || month > 12 ||
      !Number.isInteger(day) || day < 1 || day > 31 ||
      !Number.isInteger(hour) || hour < 0 || hour > 23 ||
      !Number.isInteger(minute) || minute < 0 || minute > 59 ||
      !Number.isInteger(second) || second < 0 || second > 59) return null
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  const pad = (value: number) => String(value).padStart(2, '0')
  return String(year).padStart(4, '0') + '-' + pad(month) + '-' + pad(day) + 'T' +
    pad(hour) + ':' + pad(minute) + ':' + pad(second)
}

/** Convert Excel serials and explicit date-time strings without applying the browser's local timezone. */
export function normalizeLaboratoryDateTime(value: unknown): string | null {
  if (value == null || String(value).trim() === '') return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return dateParts(
      value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate(),
      value.getUTCHours(), value.getUTCMinutes(), value.getUTCSeconds(),
    )
  }

  if (typeof value === 'number' || /^\d{5,6}(?:\.\d+)?$/.test(String(value).trim())) {
    const serial = Number(value)
    if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(serial * 86400000))
    if (Number.isNaN(date.getTime())) return null
    return dateParts(
      date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
      date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(),
    )
  }

  const source = String(value).trim()
  const iso = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (iso) return dateParts(
    Number(iso[1]), Number(iso[2]), Number(iso[3]),
    Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0),
  )

  // Excel export may separate the date and time with a comma or whitespace.
  const dmy = source.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})(?:[, ]+)?(?:([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d))?)?$/)
  if (dmy) return dateParts(
    Number(dmy[3]), Number(dmy[2]), Number(dmy[1]),
    Number(dmy[4] ?? 0), Number(dmy[5] ?? 0), Number(dmy[6] ?? 0),
  )

  return null
}

export function calculateLaboratoryWaitMinutes(requestedAt: unknown, completedAt: unknown): number | null {
  const start = normalizeLaboratoryDateTime(requestedAt)
  const end = normalizeLaboratoryDateTime(completedAt)
  if (!start || !end) return null
  const difference = Date.parse(end + 'Z') - Date.parse(start + 'Z')
  if (!Number.isFinite(difference) || difference < 0) return null
  return Math.round((difference / 60000) * 100) / 100
}

function cleanChoice(value: unknown): string {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('id-ID')
}

/** Exact option matching only; a source Code suffix must agree with the master. */
export function matchLaboratoryOption<T extends LaboratoryIndicatorOption>(raw: unknown, options: T[]): T | null {
  const source = String(raw ?? '').trim()
  if (!source) return null
  const suffix = source.match(/\s*\(code\s*(\d+)\)\s*$/i)
  const sourceCode = suffix ? Number(suffix[1]) : null
  const sourceLabel = cleanChoice(source.replace(/\s*\(code\s*\d+\)\s*$/i, ''))
  const matches = options.filter(option =>
    cleanChoice(option.label) === sourceLabel &&
    (sourceCode == null || (option.code != null && Number(option.code) === sourceCode))
  )
  return matches.length === 1 ? matches[0] : null
}

export function maskLaboratoryPatientName(value: unknown): string {
  const source = String(value ?? '').trim()
  if (!source) return '—'
  if (source.length <= 2) return '•••'
  return source.slice(0, 1) + '•••' + source.slice(-1)
}

export function maskLaboratoryMedicalRecord(value: unknown): string {
  const source = String(value ?? '').trim()
  if (!source) return '—'
  if (source.length <= 4) return '••••'
  return source.slice(0, 2) + '••••' + source.slice(-2)
}

export type LaboratorySourceWarningInput = {
  patientName?: unknown
  medicalRecordNo?: unknown
  requestedAt?: unknown
  completedAt?: unknown
  origin?: unknown
  orderingDoctor?: unknown
  activity?: unknown
  receivingAnalyst?: unknown
}

export function laboratorySourceWarnings(input: LaboratorySourceWarningInput): string[] {
  const warnings: string[] = []
  const checks: Array<[unknown, string]> = [
    [input.patientName, 'Nama pasien kosong; cocokkan dengan dokumen sumber.'],
    [input.medicalRecordNo, 'No. Rekam Medis kosong; verifikasi dari sumber resmi sebelum validasi.'],
    [input.origin, 'Asal ruangan kosong; verifikasi pada logbook sumber.'],
    [input.orderingDoctor, 'Dokter pengirim kosong; verifikasi pada sumber resmi.'],
    [input.activity, 'Tindakan pemeriksaan kosong; verifikasi pada logbook sumber.'],
    [input.receivingAnalyst, 'Analis penerima kosong; verifikasi pada logbook sumber.'],
  ]
  for (const [value, message] of checks) {
    if (value == null || String(value).trim() === '') warnings.push(message)
  }
  if (!input.completedAt || !normalizeLaboratoryDateTime(input.completedAt)) {
    warnings.push('Waktu Selesai kosong/tidak valid; durasi layanan tidak dihitung.')
  } else if (input.requestedAt && normalizeLaboratoryDateTime(input.requestedAt) &&
             Date.parse(String(normalizeLaboratoryDateTime(input.completedAt)) + 'Z') <
             Date.parse(String(normalizeLaboratoryDateTime(input.requestedAt)) + 'Z')) {
    warnings.push('Waktu Selesai lebih awal daripada Waktu Permintaan; durasi layanan tidak dihitung.')
  }
  return warnings
}

export type LaboratoryDuplicateSummary = {
  distinctValues: number
  repeatedValues: number
  extraRows: number
}

/** QA only: repeated MRNs stay as separate source events and are never deduplicated. */
export function summarizeLaboratoryDuplicates(values: unknown[]): LaboratoryDuplicateSummary {
  const counts = new Map<string, number>()
  for (const value of values) {
    const key = String(value ?? '').normalize('NFKC').trim()
    if (!key) continue
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  let repeatedValues = 0
  let extraRows = 0
  for (const count of counts.values()) {
    if (count > 1) {
      repeatedValues += 1
      extraRows += count - 1
    }
  }
  return { distinctValues: counts.size, repeatedValues, extraRows }
}
