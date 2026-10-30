export type GiziIndicatorOption = {
  label: string
  code?: number | null
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function validDateParts(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null
  return String(year) + '-' + pad2(month) + '-' + pad2(day)
}

/** Accept only explicit Excel serials, ISO dates, or unambiguous day-first dates. */
export function normalizeGiziDate(value: unknown): string | null {
  if (value == null || String(value).trim() === '') return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return validDateParts(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 20000 || value > 120000) return null
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
    return validDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
  }

  const source = String(value).trim()
  if (/^\d{5,6}(?:\.\d+)?$/.test(source)) {
    const serial = Number(source)
    if (serial >= 20000 && serial <= 120000) {
      const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
      return validDateParts(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate())
    }
  }

  const iso = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:T.*)?$/)
  if (iso) return validDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dmy = source.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/)
  if (dmy) return validDateParts(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))

  return null
}

function cleanGiziLabel(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*\(code\s*\d+\)\s*$/i, '')
    .toLocaleLowerCase('id-ID')
}

/** Match a source choice by its full label and verify an explicit Code N suffix. */
export function matchGiziOption<T extends GiziIndicatorOption>(raw: unknown, options: T[]): T | null {
  const source = String(raw ?? '').trim()
  if (!source) return null
  const suffix = source.match(/\s*\(code\s*(\d+)\)\s*$/i)
  const sourceCode = suffix ? Number(suffix[1]) : null
  const label = cleanGiziLabel(source)
  const matches = options.filter(option =>
    cleanGiziLabel(option.label) === label &&
    (sourceCode == null || (option.code != null && Number(option.code) === sourceCode))
  )
  return matches.length === 1 ? matches[0] : null
}

export function maskGiziPatientName(value: unknown): string {
  const source = String(value ?? '').trim()
  if (!source) return '—'
  if (source.length <= 2) return '•••'
  return source.slice(0, 1) + '•••' + source.slice(-1)
}

export function maskGiziMedicalRecord(value: unknown): string {
  const source = String(value ?? '').trim()
  if (!source) return '—'
  if (source.length <= 4) return '••••'
  return source.slice(0, 2) + '••••' + source.slice(-2)
}

export type GiziSourceWarningInput = {
  patientName?: unknown
  medicalRecordNo?: unknown
  admissionType?: unknown
  dietitian?: unknown
  dpjp?: unknown
  assessment?: unknown
  prescription?: unknown
}

export function giziSourceWarnings(input: GiziSourceWarningInput): string[] {
  const warnings: string[] = []
  const checks: Array<[unknown, string]> = [
    [input.patientName, 'Nama pasien kosong; cocokkan dengan dokumen sumber.'],
    [input.medicalRecordNo, 'No. Rekam Medis kosong; verifikasi dari sumber resmi sebelum validasi.'],
    [input.admissionType, 'Informasi Rawat Inap kosong; verifikasi pada logbook sumber.'],
    [input.dietitian, 'Nama nutrisionis kosong; verifikasi pada logbook sumber.'],
    [input.dpjp, 'DPJP utama kosong; verifikasi pada rekam medis.'],
    [input.assessment, 'Respons Assessment 7.1 kosong; tidak diisi otomatis dan perlu ditinjau.'],
    [input.prescription, 'Respons Instruksi DPJP 7.2 kosong; tidak diisi otomatis dan perlu ditinjau.'],
  ]
  for (const [value, message] of checks) {
    if (value == null || String(value).trim() === '') warnings.push(message)
  }
  return warnings
}

export type DuplicateSummary = {
  distinctValues: number
  repeatedValues: number
  extraRows: number
}

/** Count duplicate values for QA without treating them as an import identity. */
export function summarizeDuplicateValues(values: unknown[]): DuplicateSummary {
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
