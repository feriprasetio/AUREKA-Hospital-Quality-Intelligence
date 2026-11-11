import { matchLogbookOption, type LogbookOption } from './complaint-logbook.ts'

export type ItIndicatorOption = LogbookOption & { review_required?: boolean }
export type ItResolvedOption = {
  answer: string
  code: number | null
  source_value: string
  source_option: boolean
  review_required: boolean
}
export type ItPreparedLogbookRow = {
  sourceRow: number
  sourceNo: number
  recordDateTime: string
  formFields: Record<string, string>
  response: ItResolvedOption
}
export type ItImportProfile = {
  id: string
  options_json?: ItIndicatorOption[]
}

const IT_SOURCE_KEY_PREFIX = 'excel-pmkp-informatika-teknologi-2026:no:'

function validDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  const value = new Date(Date.UTC(year, month - 1, day))
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day
}

function dateTimeParts(date: Date): string | null {
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 16)
}

/** Normalize Excel serials, Date values, ISO dates, and Indonesian D/M/YYYY values. */
export function normalizeItDateTime(value: unknown): string | null {
  if (value == null || String(value).trim() === '') return null
  if (value instanceof Date) return dateTimeParts(value)

  if (typeof value === 'number' || (/^\d+(?:[.,]\d+)?$/.test(String(value).trim()))) {
    const serial = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
    if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null
    return dateTimeParts(new Date(Date.UTC(1899, 11, 30) + serial * 86400000))
  }

  const raw = String(value).trim()
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  if (!iso && !dmy) return null

  const year = Number(iso?.[1] ?? dmy?.[3])
  const month = Number(iso?.[2] ?? dmy?.[2])
  const day = Number(iso?.[3] ?? dmy?.[1])
  const hour = Number(iso?.[4] ?? dmy?.[4] ?? 0)
  const minute = Number(iso?.[5] ?? dmy?.[5] ?? 0)
  const second = Number(iso?.[6] ?? dmy?.[6] ?? 0)
  if (!validDateParts(year, month, day) || hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null

  return String(year).padStart(4, '0') + '-' +
    String(month).padStart(2, '0') + '-' +
    String(day).padStart(2, '0') + 'T' +
    String(hour).padStart(2, '0') + ':' +
    String(minute).padStart(2, '0')
}

export function resolveItIndicatorOption(raw: unknown, options: ItIndicatorOption[]): ItResolvedOption | null {
  const sourceValue = String(raw ?? '').trim()
  if (!sourceValue) return null
  const matched = matchLogbookOption(sourceValue, options)
  if (matched) {
    return {
      answer: String(matched.label),
      code: matched.code == null ? null : Number(matched.code),
      source_value: sourceValue,
      source_option: false,
      review_required: matched.review_required === true || matched.code == null,
    }
  }

  // Excel-only values are retained verbatim and sent to review; no code is inferred.
  return {
    answer: sourceValue,
    code: null,
    source_value: sourceValue,
    source_option: true,
    review_required: true,
  }
}

export function createItSubjectKey(sourceNo: number | string): string {
  const normalized = String(sourceNo ?? '').trim()
  if (!/^[1-9]\d{0,8}$/.test(normalized)) {
    throw new Error('Nomor laporan sumber harus berupa bilangan bulat positif.')
  }
  return IT_SOURCE_KEY_PREFIX + normalized
}

export function buildItImportPayload(input: {
  row: ItPreparedLogbookRow
  fileName: string
  fileSha256: string
  profile: ItImportProfile
  userId: string
}): Record<string, unknown> {
  const { row, fileName, fileSha256, profile, userId } = input
  if (!/^[0-9a-f]{64}$/.test(fileSha256)) throw new Error('Hash workbook SHA-256 tidak valid.')
  if (!profile.id) throw new Error('Master indikator 2.1 belum tersedia.')
  const recordDate = row.recordDateTime.slice(0, 10)
  const sourceImport = {
    source_workbook: fileName,
    source_file_sha256: fileSha256,
    source_sheet: 'Logbook',
    source_excel_row: row.sourceRow,
    source_excel_no: row.sourceNo,
    source_import_type: 'workbook_batch_v1',
  }
  const responseValue = {
    answer: row.response.answer,
    code: row.response.code,
    source_value: row.response.source_value,
    source_label: row.response.source_value,
    source_option: row.response.source_option,
    review_required: row.response.review_required,
  }
  const core = {
    unit_name: 'Informatika dan Teknologi',
    room_id: 2,
    activity: row.formFields['Gangguan IT'],
    status: 'Ready for Review',
    workflow_status: 'Ready for Review',
    admission_at: row.recordDateTime,
    form_fields: row.formFields,
    indicator_values: { '2.1': responseValue },
    measurement_grain: 'activity',
    source_import: sourceImport,
  }
  return {
    payload: {
      room_id: 2,
      profile_year: 2026,
      measurement_grain: 'activity',
      record_date: recordDate,
      subject_key: createItSubjectKey(row.sourceNo),
      subject_json: { source_import: sourceImport },
      core_data: core,
      status: 'ready',
      review_required: row.response.review_required,
      entered_by: userId,
    },
    responses: [{
      indicator_id: profile.id,
      response_label: row.response.answer,
      response_code: row.response.code,
      raw_value: responseValue,
      other_text: row.response.source_option ? row.response.source_value : null,
      review_status: row.response.review_required ? 'pending' : 'not_required',
    }],
    attributions: [],
  }
}
