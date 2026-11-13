export type RekamMedisIndicatorOption = {
  label: string
  code: number | null
  review_required?: boolean
  [key: string]: unknown
}
export type RekamMedisResolvedOption = {
  answer: string
  code: number | null
  source_value: string
  source_option: boolean
  review_required: boolean
}
export type RekamMedisIndicatorProfile = {
  id: string
  code: string
  options_json?: RekamMedisIndicatorOption[]
}
export type RekamMedisPreparedRow = {
  sourceRow: number
  sourceNo: number
  patientName: string
  medicalRecordNo: string
  admissionDate: string
  sep: string
  dpjp: string
  claim: string
  klpcm: string
  claimResponse: RekamMedisResolvedOption
  klpcmResponse: RekamMedisResolvedOption
}

const SOURCE_KEY_PREFIX = 'excel-pmkp-rekam-medis-2026:row:'

function validDateParts(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false
  const value = new Date(Date.UTC(year, month - 1, day))
  return value.getUTCFullYear() === year && value.getUTCMonth() === month - 1 && value.getUTCDate() === day
}

/** Normalize Excel serials, Date values, ISO dates, and Indonesian D/M/YYYY values. */
export function normalizeRekamMedisDate(value: unknown): string | null {
  if (value == null || String(value).trim() === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return value.toISOString().slice(0, 10)
  }

  if (typeof value === 'number' || (/^\d+(?:[.,]\d+)?$/.test(String(value).trim()))) {
    const serial = typeof value === 'number' ? value : Number(String(value).replace(',', '.'))
    if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null
    return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  }

  const raw = String(value).trim()
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)
  if (!iso && !dmy) return null
  const year = Number(iso?.[1] ?? dmy?.[3])
  const month = Number(iso?.[2] ?? dmy?.[2])
  const day = Number(iso?.[3] ?? dmy?.[1])
  if (!validDateParts(year, month, day)) return null
  return String(year).padStart(4, '0') + '-' +
    String(month).padStart(2, '0') + '-' +
    String(day).padStart(2, '0')
}

function normalizeOptionLabel(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/\s*\(code\s*[1-3]\)\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('id-ID')
}

/** Exact label matching only; source-only options are retained for explicit validator review. */
export function resolveRekamMedisIndicatorOption(
  raw: unknown,
  options: RekamMedisIndicatorOption[],
): RekamMedisResolvedOption | null {
  const sourceValue = String(raw ?? '').trim()
  if (!sourceValue) return null
  const key = normalizeOptionLabel(sourceValue)
  const matched = options.find(option => normalizeOptionLabel(String(option.label ?? '')) === key)
  if (matched) {
    return {
      answer: String(matched.label),
      code: matched.code == null ? null : Number(matched.code),
      source_value: sourceValue,
      source_option: false,
      review_required: matched.review_required === true || matched.code == null,
    }
  }
  return {
    answer: sourceValue,
    code: null,
    source_value: sourceValue,
    source_option: true,
    review_required: true,
  }
}

export function createRekamMedisSubjectKey(sourceRow: number | string): string {
  const normalized = String(sourceRow ?? '').trim()
  if (!/^[1-9]\d{0,3}$/.test(normalized) || Number(normalized) < 3 || Number(normalized) > 5003) {
    throw new Error('Nomor baris sumber Excel harus berada pada rentang 3–5003.')
  }
  return SOURCE_KEY_PREFIX + normalized
}

export function buildRekamMedisImportPayload(input: {
  row: RekamMedisPreparedRow
  fileName: string
  fileSha256: string
  profiles: RekamMedisIndicatorProfile[]
  userId: string
}): Record<string, unknown> {
  const { row, fileName, fileSha256, profiles, userId } = input
  if (!/^[0-9a-f]{64}$/.test(fileSha256)) throw new Error('Hash workbook SHA-256 tidak valid.')
  const profileByCode = new Map(profiles.map(profile => [String(profile.code), profile]))
  const claimProfile = profileByCode.get('13.1')
  const klpcmProfile = profileByCode.get('13.2')
  if (!claimProfile?.id || !klpcmProfile?.id) {
    throw new Error('Master indikator aktif 13.1 dan 13.2 belum lengkap.')
  }

  const sourceImport = {
    source_workbook: fileName,
    source_file_sha256: fileSha256,
    source_sheet: 'Logbook',
    source_excel_row: row.sourceRow,
    source_excel_no: row.sourceNo,
    source_import_type: 'workbook_batch_v1',
    idempotency_basis: 'room_year_source_excel_row',
  }
  const responseValue = (answer: RekamMedisResolvedOption) => ({
    answer: answer.answer,
    code: answer.code,
    source_value: answer.source_value,
    source_label: answer.source_value,
    source_option: answer.source_option,
    review_required: answer.review_required,
  })
  const claimValue = responseValue(row.claimResponse)
  const klpcmValue = responseValue(row.klpcmResponse)
  const needsReview = row.claimResponse.review_required || row.klpcmResponse.review_required
  const formFields = {
    'No.': String(row.sourceNo),
    'Nama Pasien': row.patientName,
    'No. Rekam Medis': row.medicalRecordNo,
    'Tanggal Masuk': row.admissionDate,
    'SEP': row.sep,
    'DPJP': row.dpjp,
    'Klaim': row.claim,
    'KLPCM': row.klpcm,
  }
  const core = {
    unit_name: 'Instalasi Rekam Medis',
    room_id: 13,
    patient_name: row.patientName,
    medical_record_no: row.medicalRecordNo,
    admission_at: row.admissionDate + 'T00:00:00',
    status: 'Ready for Review',
    workflow_status: 'Ready for Review',
    form_fields: formFields,
    indicator_values: { '13.1': claimValue, '13.2': klpcmValue },
    measurement_grain: 'event',
    source_import: sourceImport,
  }

  return {
    payload: {
      room_id: 13,
      profile_year: 2026,
      measurement_grain: 'event',
      record_date: row.admissionDate,
      subject_key: createRekamMedisSubjectKey(row.sourceRow),
      subject_json: { source_import: sourceImport },
      core_data: core,
      status: 'ready',
      review_required: needsReview,
      entered_by: userId,
    },
    responses: [
      {
        indicator_id: claimProfile.id,
        response_label: row.claimResponse.answer,
        response_code: row.claimResponse.code,
        raw_value: claimValue,
        other_text: row.claimResponse.source_option ? row.claimResponse.source_value : null,
        review_status: row.claimResponse.review_required ? 'pending' : 'not_required',
      },
      {
        indicator_id: klpcmProfile.id,
        response_label: row.klpcmResponse.answer,
        response_code: row.klpcmResponse.code,
        raw_value: klpcmValue,
        other_text: row.klpcmResponse.source_option ? row.klpcmResponse.source_value : null,
        review_status: row.klpcmResponse.review_required ? 'pending' : 'not_required',
      },
    ],
    attributions: [],
  }
}
