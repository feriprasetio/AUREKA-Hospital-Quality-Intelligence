export type IbsIndicatorOption = {
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

/** Convert a genuine Excel date/serial or an unambiguous ISO/Indonesian date to YYYY-MM-DD. */
export function normalizeIbsDate(value: unknown): string | null {
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

  const iso = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) return validDateParts(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  const dmy = source.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)
  if (dmy) return validDateParts(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))

  return null
}

function cleanIbsLabel(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*\(code\s*\d+\)\s*$/i, '')
    .toLocaleLowerCase('id-ID')
}

/** Match a source dropdown by label and, when supplied, its explicit Code N suffix. */
export function matchIbsOption<T extends IbsIndicatorOption>(raw: unknown, options: T[]): T | null {
  const source = String(raw ?? '').trim()
  if (!source) return null
  const suffix = source.match(/\s*\(code\s*(\d+)\)\s*$/i)
  const sourceCode = suffix ? Number(suffix[1]) : null
  const cleanLabel = cleanIbsLabel(source)
  const matches = options.filter(option =>
    cleanIbsLabel(option.label) === cleanLabel &&
    (sourceCode == null || (option.code != null && Number(option.code) === sourceCode))
  )
  return matches.length === 1 ? matches[0] : null
}

export function maskIbsPatientName(value: unknown): string {
  const source = String(value ?? '').trim()
  if (!source) return '—'
  if (source.length <= 2) return '•••'
  return source.slice(0, 1) + '•••' + source.slice(-1)
}

export function maskIbsMedicalRecord(value: unknown): string {
  const source = String(value ?? '').trim()
  if (!source) return '—'
  if (source.length <= 4) return '••••'
  return source.slice(0, 2) + '••••' + source.slice(-2)
}

export type IbsSourceWarningInput = {
  patientName?: unknown
  medicalRecordNo?: unknown
  diagnosis?: unknown
  procedure?: unknown
  dpjp?: unknown
  date?: unknown
}

export function ibsSourceWarnings(input: IbsSourceWarningInput): string[] {
  const warnings: string[] = []
  const checks: Array<[unknown, string]> = [
    [input.patientName, 'Nama pasien kosong; cocokkan dengan dokumen sumber.'],
    [input.medicalRecordNo, 'No. Rekam Medis kosong; lengkapi dari sumber resmi sebelum validasi.'],
    [input.diagnosis, 'Diagnosa operasi kosong; verifikasi pada dokumen sumber.'],
    [input.procedure, 'Jenis tindakan kosong; verifikasi pada dokumen sumber.'],
    [input.dpjp, 'DPJP kosong; verifikasi pada dokumen sumber.'],
  ]
  for (const [value, message] of checks) {
    if (value == null || String(value).trim() === '') warnings.push(message)
  }
  const normalizedDate = normalizeIbsDate(input.date)
  if (normalizedDate && normalizedDate.slice(0, 4) !== '2026') {
    warnings.push('Tanggal berasal dari tahun ' + normalizedDate.slice(0, 4) + '; dipertahankan sebagai catatan historis dan tidak masuk denominator 2026.')
  }
  return warnings
}
