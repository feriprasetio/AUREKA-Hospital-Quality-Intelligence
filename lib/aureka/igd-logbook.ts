export type IgdIndicatorCode = '6.1' | '6.2' | '6.3' | '6.4' | '6.5' | '6.6' | '6.7'

export type IgdIndicatorSource = {
  code: IgdIndicatorCode
  header: string
  field: string
}

export const IGD_INDICATORS: IgdIndicatorSource[] = [
  { code: '6.1', header: 'Kematian IGD ≤8h', field: 'Kematian IGD ≤8h' },
  { code: '6.2', header: 'Door-to-Decision', field: 'Door-to-Decision' },
  { code: '6.3', header: 'Response Time DPJP', field: 'Response Time DPJP' },
  { code: '6.4', header: 'Antrian Rawat Inap', field: 'Antrian Rawat Inap' },
  { code: '6.5', header: 'Kelengkapan Assessment Keperawatan', field: 'Kelengkapan Assessment Keperawatan' },
  { code: '6.6', header: 'Overcrowding Index', field: 'Overcrowding Index' },
  { code: '6.7', header: 'Response Triage', field: 'Response Triage' },
]

export type ParsedSourceChoice = {
  raw: string
  label: string
  code: number | null
}

export type IgdMainMatchRow = {
  sourceRow: number
  medicalRecordNo: string
  admissionAt: string
}

export type IgdConsultationMatch = {
  status: 'matched' | 'ambiguous' | 'unmatched'
  sourceRow: number | null
  candidateRows: number[]
  deltaSeconds: number | null
}

export type IgdConsultationForMatch = {
  medicalRecordNo: string
  registeredAt: string | null
}

export type IgdConsultationReviewFlag =
  | 'missing_registration_time'
  | 'missing_consultation_time'
  | 'negative_registration_to_consultation'
  | 'source_formula_duration_mismatch'
  | 'source_formula_duration_unreadable'
  | 'door_to_decision_threshold_mismatch'
  | 'attainment_reason_code_mismatch'
  | 'missing_reason_code'
  | 'source_month_crosses_registration_month'

export function normalizeIgdText(value: unknown): string {
  return String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
}

export function normalizeIgdMrn(value: unknown): string {
  // Do not strip punctuation or leading zeroes: they may be part of the source identifier.
  return normalizeIgdText(value)
}

export function parseIgdSourceChoice(value: unknown): ParsedSourceChoice {
  const raw = normalizeIgdText(value)
  const match = raw.match(/\s*\(code\s*(\d+)\)\s*$/i)
  const code = match ? Number(match[1]) : null
  return { raw, label: match ? raw.slice(0, match.index).trim() : raw, code: code === 1 || code === 2 || code === 3 ? code : null }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function formatLocalDateTime(parts: { year: number; month: number; day: number; hour: number; minute: number; second: number }): string | null {
  const { year, month, day, hour, minute, second } = parts
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31 ||
      hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null
  const test = new Date(Date.UTC(year, month - 1, day))
  if (test.getUTCFullYear() !== year || test.getUTCMonth() + 1 !== month || test.getUTCDate() !== day) return null
  return year + '-' + pad2(month) + '-' + pad2(day) + 'T' + pad2(hour) + ':' + pad2(minute) + ':' + pad2(second) + '+07:00'
}

/** Converts Excel calendar/time values to an explicit Pontianak wall-clock timestamp. */
export function normalizeIgdDateTime(value: unknown): string | null {
  if (value == null || String(value).trim() === '') return null
  if (value instanceof Date) {
    if (!Number.isFinite(value.getTime())) return null
    return formatLocalDateTime({
      year: value.getUTCFullYear(), month: value.getUTCMonth() + 1, day: value.getUTCDate(),
      hour: value.getUTCHours(), minute: value.getUTCMinutes(), second: value.getUTCSeconds(),
    })
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 20000 || value > 120000) return null
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000))
    return normalizeIgdDateTime(date)
  }
  const raw = normalizeIgdText(value)
  const match = raw.match(/^(\d{1,4})[\/.-](\d{1,2})[\/.-](\d{2,4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (match) {
    let year = Number(match[3])
    if (match[3].length < 4) year += year >= 70 ? 1900 : 2000
    return formatLocalDateTime({
      day: Number(match[1]), month: Number(match[2]), year,
      hour: Number(match[4] ?? 0), minute: Number(match[5] ?? 0), second: Number(match[6] ?? 0),
    })
  }
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/)
  if (iso) {
    return formatLocalDateTime({
      year: Number(iso[1]), month: Number(iso[2]), day: Number(iso[3]),
      hour: Number(iso[4] ?? 0), minute: Number(iso[5] ?? 0), second: Number(iso[6] ?? 0),
    })
  }
  // Timezone-qualified strings are converted to the hospital's local timezone.
  if (/^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/i.test(raw)) {
    const date = new Date(raw)
    if (!Number.isFinite(date.getTime())) return null
    const local = new Date(date.getTime() + 7 * 60 * 60 * 1000)
    return formatLocalDateTime({
      year: local.getUTCFullYear(), month: local.getUTCMonth() + 1, day: local.getUTCDate(),
      hour: local.getUTCHours(), minute: local.getUTCMinutes(), second: local.getUTCSeconds(),
    })
  }
  return null
}

export function igdLocalDate(value: string | null | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}T/.test(value) ? value.slice(0, 10) : null
}

export function calculateIgdElapsedMinutes(start: string | null | undefined, end: string | null | undefined): number | null {
  if (!start || !end) return null
  const a = Date.parse(start)
  const b = Date.parse(end)
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return null
  return Math.round((b - a) / 60000)
}

export function reconcileIgdConsultation(
  consultation: IgdConsultationForMatch,
  mainRows: IgdMainMatchRow[],
  toleranceSeconds = 60,
): IgdConsultationMatch {
  const mrn = normalizeIgdMrn(consultation.medicalRecordNo)
  const day = igdLocalDate(consultation.registeredAt)
  if (!mrn || !day || !consultation.registeredAt) {
    return { status: 'unmatched', sourceRow: null, candidateRows: [], deltaSeconds: null }
  }
  const registeredMs = Date.parse(consultation.registeredAt)
  const sameDay = mainRows.filter(row =>
    normalizeIgdMrn(row.medicalRecordNo) === mrn &&
    igdLocalDate(row.admissionAt) === day
  )
  const candidates = sameDay
    .map(row => ({ row, delta: Math.abs(Date.parse(row.admissionAt) - registeredMs) / 1000 }))
    .filter(item => Number.isFinite(item.delta) && item.delta <= toleranceSeconds)
    .sort((a, b) => a.delta - b.delta || a.row.sourceRow - b.row.sourceRow)
  if (candidates.length === 1) {
    return { status: 'matched', sourceRow: candidates[0].row.sourceRow, candidateRows: [candidates[0].row.sourceRow], deltaSeconds: candidates[0].delta }
  }
  if (candidates.length > 1) {
    return { status: 'ambiguous', sourceRow: null, candidateRows: candidates.map(item => item.row.sourceRow), deltaSeconds: candidates[0].delta }
  }
  return { status: 'unmatched', sourceRow: null, candidateRows: [], deltaSeconds: null }
}

export function assessIgdConsultationFlags(input: {
  registeredAt: string | null
  consultationAt: string | null
  sourceDurationMinutes?: unknown
  derivedDurationMinutes: number | null
  doorDecisionLabel?: unknown
  attainment?: unknown
  dpjpReasonCode: number | null
}): IgdConsultationReviewFlag[] {
  const flags: IgdConsultationReviewFlag[] = []
  if (!input.registeredAt) flags.push('missing_registration_time')
  if (!input.consultationAt) flags.push('missing_consultation_time')
  if (input.registeredAt && input.consultationAt && input.derivedDurationMinutes == null) {
    flags.push('negative_registration_to_consultation')
  }
  const sourceDurationRaw = String(input.sourceDurationMinutes ?? '').trim()
  const sourceDuration = Number(sourceDurationRaw.replace(',', '.'))
  if (sourceDurationRaw && !Number.isFinite(sourceDuration)) {
    flags.push('source_formula_duration_unreadable')
  } else if (sourceDurationRaw && input.derivedDurationMinutes != null &&
      Math.abs(sourceDuration - input.derivedDurationMinutes) > 1) {
    flags.push('source_formula_duration_mismatch')
  }
  const doorLabel = normalizeIgdText(input.doorDecisionLabel)
  if (/\b4\s*jam\b/i.test(doorLabel) || /≤\s*4/i.test(doorLabel)) flags.push('door_to_decision_threshold_mismatch')
  const status = normalizeIgdText(input.attainment).toLocaleLowerCase('id-ID')
  if (!input.dpjpReasonCode) {
    if (status) flags.push('missing_reason_code')
  } else if ((status === 'ya' && input.dpjpReasonCode !== 1) || (status === 'tidak' && input.dpjpReasonCode === 1)) {
    flags.push('attainment_reason_code_mismatch')
  }
  if (input.registeredAt && input.consultationAt &&
      igdLocalDate(input.registeredAt)?.slice(0, 7) !== igdLocalDate(input.consultationAt)?.slice(0, 7)) {
    flags.push('source_month_crosses_registration_month')
  }
  return [...new Set(flags)]
}

export function isValidIgdIndicatorCode(value: unknown): value is 1 | 2 | 3 | null {
  if (value == null || value === '') return true
  const code = Number(value)
  return code === 1 || code === 2 || code === 3
}
