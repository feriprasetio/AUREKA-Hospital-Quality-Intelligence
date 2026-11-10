export type IgdIndicatorCode = '6.1' | '6.2' | '6.3' | '6.4' | '6.5' | '6.6' | '6.7'

export type IgdIndicatorOption = {
  label: string
  code?: number | null
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}

export const IGD_INDICATORS: Array<{ code: IgdIndicatorCode; header: string; profileTitleHint: string }> = [
  { code: '6.1', header: 'Kematian IGD ≤8h', profileTitleHint: 'Angka Kematian di IGD' },
  { code: '6.2', header: 'Door-to-Decision', profileTitleHint: 'Door-to-Decision' },
  { code: '6.3', header: 'Response Time DPJP', profileTitleHint: 'DPJP On-Call Response Time' },
  { code: '6.4', header: 'Antrian Rawat Inap', profileTitleHint: 'Kejadian Antrian Pasien Rawat Inap' },
  { code: '6.5', header: 'Kelengkapan Assessment Keperawatan', profileTitleHint: 'Kelengkapan Data Asesmen Awal Keperawatan' },
  { code: '6.6', header: 'Overcrowding Index', profileTitleHint: 'Ketidaksediaan Bed Karena Overcrowding' },
  { code: '6.7', header: 'Response Triage', profileTitleHint: 'Waktu Tanggap Pelayanan Dokter di Gawat Darurat' },
] as const

export type IgdEncounterCandidate = {
  subjectKey: string
  medicalRecordNo: unknown
  patientName: unknown
  recordDate: unknown
}

export type IgdConsultationMatchStatus =
  | 'matched_unique'
  | 'ambiguous_rm_date'
  | 'date_mismatch'
  | 'rm_not_found'
  | 'missing_mrn'
  | 'missing_date'

export type IgdConsultationMatch = {
  status: IgdConsultationMatchStatus
  subjectKey: string | null
  candidateCount: number
  note: string
}

function cleanText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
}

function dateParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
): string | null {
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

/** Parse Excel serials and explicit ISO/Indonesian date-time strings without guessing ambiguous two-digit years. */
export function normalizeIgdDateTime(value: unknown): string | null {
  if (value == null || cleanText(value) === '') return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const rounded = new Date(Math.round(value.getTime() / 1000) * 1000)
    return dateParts(
      rounded.getUTCFullYear(), rounded.getUTCMonth() + 1, rounded.getUTCDate(),
      rounded.getUTCHours(), rounded.getUTCMinutes(), rounded.getUTCSeconds(),
    )
  }

  if (typeof value === 'number' || /^\d{5,6}(?:\.\d+)?$/.test(cleanText(value))) {
    const serial = Number(value)
    if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null
    const timestamp = Date.UTC(1899, 11, 30) + serial * 86400000
    const date = new Date(Math.round(timestamp / 1000) * 1000)
    if (Number.isNaN(date.getTime())) return null
    return dateParts(
      date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate(),
      date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds(),
    )
  }

  const source = cleanText(value)
  const iso = source.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d{1,9})?)?)?$/)
  if (iso) return dateParts(
    Number(iso[1]), Number(iso[2]), Number(iso[3]),
    Number(iso[4] ?? 0), Number(iso[5] ?? 0), Number(iso[6] ?? 0),
  )

  const dmy = source.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[, ]+)?(?:([01]?\d|2[0-3]):([0-5]\d)(?::([0-5]\d)(?:\.\d{1,9})?)?)?$/)
  if (dmy) return dateParts(
    Number(dmy[3]), Number(dmy[2]), Number(dmy[1]),
    Number(dmy[4] ?? 0), Number(dmy[5] ?? 0), Number(dmy[6] ?? 0),
  )

  return null
}

export function igdDateOnly(value: unknown): string | null {
  const normalized = normalizeIgdDateTime(value)
  return normalized ? normalized.slice(0, 10) : null
}

export function calculateIgdElapsedMinutes(startValue: unknown, endValue: unknown): number | null {
  const start = normalizeIgdDateTime(startValue)
  const end = normalizeIgdDateTime(endValue)
  if (!start || !end) return null
  const difference = Date.parse(end + 'Z') - Date.parse(start + 'Z')
  if (!Number.isFinite(difference) || difference < 0) return null
  return Math.round((difference / 60000) * 100) / 100
}

/** Exact normalized comparison; separators and leading zeroes are deliberately preserved. */
export function normalizeIgdMedicalRecord(value: unknown): string {
  return cleanText(value).toLocaleUpperCase('id-ID')
}

export function normalizeIgdPatientName(value: unknown): string {
  return cleanText(value).toLocaleLowerCase('id-ID')
}

export function matchIgdSourceOption<T extends IgdIndicatorOption>(rawValue: unknown, options: T[]): T | null {
  const raw = cleanText(rawValue)
  if (!raw) return null
  const suffix = raw.match(/\s*\(code\s*(\d+)\)\s*$/i)
  const sourceCode = suffix ? Number(suffix[1]) : null
  const sourceLabel = cleanText(raw.replace(/\s*\(code\s*\d+\)\s*$/i, '')).toLocaleLowerCase('id-ID')
  const matches = options.filter(option =>
    cleanText(option.label).toLocaleLowerCase('id-ID') === sourceLabel &&
    (sourceCode == null || (option.code != null && Number(option.code) === sourceCode))
  )
  return matches.length === 1 ? matches[0] : null
}

/** Link only on exact normalized MRN plus calendar date. A patient-name tie-break is allowed only when unique. */
export function matchIgdConsultationToEncounter(
  medicalRecordNo: unknown,
  registrationAt: unknown,
  _patientName: unknown,
  encounters: IgdEncounterCandidate[],
): IgdConsultationMatch {
  const mrn = normalizeIgdMedicalRecord(medicalRecordNo)
  if (!mrn) return { status: 'missing_mrn', subjectKey: null, candidateCount: 0, note: 'No. RM kosong; tidak dicocokkan.' }
  const date = igdDateOnly(registrationAt)
  if (!date) return { status: 'missing_date', subjectKey: null, candidateCount: 0, note: 'Tanggal registrasi tidak valid; tidak dicocokkan.' }

  const sameMrn = encounters.filter(item => normalizeIgdMedicalRecord(item.medicalRecordNo) === mrn)
  if (sameMrn.length === 0) return { status: 'rm_not_found', subjectKey: null, candidateCount: 0, note: 'No. RM tidak ditemukan pada logbook utama.' }

  const sameDate = sameMrn.filter(item => igdDateOnly(item.recordDate) === date)
  if (sameDate.length === 0) return { status: 'date_mismatch', subjectKey: null, candidateCount: sameMrn.length, note: 'No. RM ditemukan, tetapi tidak pada tanggal registrasi yang sama.' }
  if (sameDate.length === 1) return { status: 'matched_unique', subjectKey: sameDate[0].subjectKey, candidateCount: 1, note: 'Kecocokan unik berdasarkan No. RM dan tanggal.' }

  return { status: 'ambiguous_rm_date', subjectKey: null, candidateCount: sameDate.length, note: 'Beberapa episode memiliki No. RM dan tanggal yang sama; relasi tidak dipaksakan meskipun nama pasien tampak cocok.' }
}

export function summarizeIgdMatches(matches: IgdConsultationMatch[]): Record<IgdConsultationMatchStatus, number> {
  const summary: Record<IgdConsultationMatchStatus, number> = {
    matched_unique: 0, ambiguous_rm_date: 0, date_mismatch: 0, rm_not_found: 0, missing_mrn: 0, missing_date: 0,
  }
  for (const match of matches) summary[match.status] += 1
  return summary
}

export function parseIgdMonthFromFilename(fileName: string): number | null {
  const source = cleanText(fileName).toLocaleLowerCase('id-ID')
  const months = [
    ['januari', 1], ['februari', 2], ['maret', 3], ['april', 4], ['mei', 5], ['juni', 6],
    ['juli', 7], ['agustus', 8], ['september', 9], ['oktober', 10], ['november', 11], ['desember', 12],
  ] as const
  for (const [name, month] of months) if (source.includes(name)) return month
  return null
}

export function igdSourceWarnings(input: {
  patientName?: unknown
  medicalRecordNo?: unknown
  admissionAt?: unknown
  transferAt?: unknown
}): string[] {
  const warnings: string[] = []
  if (!cleanText(input.patientName)) warnings.push('Nama pasien kosong.')
  if (!cleanText(input.medicalRecordNo)) warnings.push('No. RM kosong; verifikasi identitas sebelum validasi.')
  if (!normalizeIgdDateTime(input.admissionAt)) warnings.push('Waktu masuk tidak valid; baris tidak dapat menjadi episode tahun 2026.')
  if (cleanText(input.transferAt) && !normalizeIgdDateTime(input.transferAt)) warnings.push('Waktu transfer tidak dapat diparse; nilai sumber tetap dipertahankan.')
  return warnings
}

export function maskIgdPatientName(value: unknown): string {
  const source = cleanText(value)
  if (!source) return '—'
  if (source.length <= 2) return '•••'
  return source.slice(0, 1) + '•••' + source.slice(-1)
}

export function maskIgdMedicalRecord(value: unknown): string {
  const source = cleanText(value)
  if (!source) return '—'
  if (source.length <= 4) return '••••'
  return source.slice(0, 2) + '••••' + source.slice(-2)
}
