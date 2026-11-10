export type PatientEpisodeSource = {
  core_data?: Record<string, any> | null
  subject_json?: Record<string, any> | null
  measurement_grain?: string | null
  record_date?: string | null
  created_at?: string | null
  updated_at?: string | null
  room_id?: number | null
}

export type Icd10Match = {
  code: string | null
  label: string
  source: 'explicit-code' | 'candidate' | 'unmapped'
  confidence: 'high' | 'review-required' | 'not-available'
  needsReview: boolean
}

export type PatientEpisode = {
  name: string
  medicalRecordNo: string
  diagnosis: string
  icd10Code: string | null
  icd10Label: string
  icd10NeedsReview: boolean
  admissionDate: string | null
  dischargeDate: string | null
  lengthOfStayDays: number | null
  isCurrentlyAdmitted: boolean
  recordDate: string | null
  measurementGrain: string
  roomId: number | null
  lastUpdatedAt: string | null
}

const FIRST = (...values: unknown[]) => values.find(value => value != null && String(value).trim() !== '')

function dateOnly(value: unknown): string | null {
  const text = String(value ?? '').trim()
  if (!text) return null
  const match = /^(\\d{4}-\\d{2}-\\d{2})/.exec(text)
  if (match) return match[1]
  const parsed = new Date(text)
  return Number.isNaN(parsed.getTime()) ? null : [
    parsed.getFullYear(),
    String(parsed.getMonth() + 1).padStart(2, '0'),
    String(parsed.getDate()).padStart(2, '0'),
  ].join('-')
}

function daysBetween(start: string, end: string): number | null {
  const a = new Date(start + 'T00:00:00')
  const b = new Date(end + 'T00:00:00')
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime()) || b < a) return null
  return Math.floor((b.getTime() - a.getTime()) / 86400000) + 1
}

const CODE_PATTERN = /\\b([A-TV-Z][0-9]{2}(?:\\.[0-9A-Z]{1,4})?)\\b/i

// Small, deliberately conservative synonym index. These are candidate mappings,
// not a substitute for coding against the full WHO ICD-10 tabular list.
const ICD10_CANDIDATES: Array<{ code: string; label: string; terms: string[] }> = [
  { code: 'I10', label: 'Essential (primary) hypertension', terms: ['hipertensi esensial', 'hipertensi primer', 'essential hypertension'] },
  { code: 'E11.9', label: 'Type 2 diabetes mellitus without complications', terms: ['diabetes melitus tipe 2 tanpa komplikasi', 'dm tipe 2 tanpa komplikasi', 'type 2 diabetes mellitus without complications'] },
  { code: 'I63.9', label: 'Cerebral infarction, unspecified', terms: ['stroke iskemik', 'infark serebral', 'cerebral infarction'] },
  { code: 'I21.9', label: 'Acute myocardial infarction, unspecified', terms: ['infark miokard akut', 'acute myocardial infarction'] },
  { code: 'J18.9', label: 'Pneumonia, unspecified organism', terms: ['pneumonia tidak spesifik', 'pneumonia unspecified', 'pneumonia'] },
  { code: 'N39.0', label: 'Urinary tract infection, site not specified', terms: ['infeksi saluran kemih', 'isk', 'urinary tract infection'] },
  { code: 'A09', label: 'Other gastroenteritis and colitis of infectious and unspecified origin', terms: ['gastroenteritis akut', 'diare akut infeksi', 'acute gastroenteritis'] },
  { code: 'R50.9', label: 'Fever, unspecified', terms: ['demam tidak spesifik', 'fever unspecified'] },
  { code: 'K35.80', label: 'Unspecified acute appendicitis', terms: ['apendisitis akut', 'appendicitis akut', 'acute appendicitis'] },
  { code: 'O82', label: 'Single delivery by caesarean section', terms: ['persalinan sectio caesarea', 'seksio sesarea', 'sectio caesarea', 'caesarean section'] },
  { code: 'P07.1', label: 'Other low birth weight newborns', terms: ['berat badan lahir rendah', 'bblr', 'low birth weight'] },
]

export function resolveIcd10(diagnosis: unknown, explicitCode?: unknown): Icd10Match {
  const supplied = String(explicitCode ?? '').trim().toUpperCase()
  const embedded = CODE_PATTERN.exec(String(diagnosis ?? ''))?.[1]?.toUpperCase() ?? ''
  const code = supplied || embedded
  if (code && CODE_PATTERN.test(code)) {
    return { code, label: 'Kode ICD-10 tercatat; deskripsi perlu dicocokkan dengan indeks resmi', source: 'explicit-code', confidence: 'high', needsReview: false }
  }
  const normalized = String(diagnosis ?? '').normalize('NFKC').toLocaleLowerCase('id-ID').replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim()
  if (normalized) {
    const candidate = ICD10_CANDIDATES.find(item => item.terms.some(term => {
      const t = term.normalize('NFKC').toLocaleLowerCase('id-ID').replace(/[^\\p{L}\\p{N}]+/gu, ' ').trim()
      return normalized === t || normalized.includes(t)
    }))
    if (candidate) {
      return { code: candidate.code, label: candidate.label, source: 'candidate', confidence: 'review-required', needsReview: true }
    }
  }
  return { code: null, label: 'Belum terpetakan — perlu verifikasi koder', source: 'unmapped', confidence: 'not-available', needsReview: true }
}

export function normalizePatientEpisode(row: PatientEpisodeSource, today = new Date()): PatientEpisode {
  const core = row.core_data ?? row.subject_json ?? {}
  const fields = core.form_fields ?? core.form_data ?? {}
  const calculated = core.calculated_fields ?? {}
  const admissionDate = dateOnly(FIRST(core.admission_at, core.admit, fields['Tanggal Masuk'], fields['Tanggal Masuk RS'], fields['Tanggal Masuk Rumah Sakit']))
  const dischargeDate = dateOnly(FIRST(core.discharge_at, core.discharge, fields['Tanggal Keluar']))
  const diagnosis = String(FIRST(core.diagnosis, core.dx, fields['Diagnosa Tegak'], fields['Diagnosa'], fields['Diagnosa IGD'], fields['Diagnosa Pasien'], fields['Diagnosis Medis'], fields['Diagnosa Operasi']) ?? '')
  const explicitCode = FIRST(core.icd10_code, core.diagnosis_code, fields['Kode ICD-10'], fields['Kode ICD10'], fields['ICD-10'], fields['ICD10'], fields['Kode Diagnosis ICD-10'])
  const mapping = resolveIcd10(diagnosis, explicitCode)
  const storedLos = Number(FIRST(core.los_days, calculated['Length of Stay'], calculated['Lenght of Stay'], fields['Length of Stay'], fields['Lenght of Stay']))
  const todayText = dateOnly(today) ?? dateOnly(new Date())!
  const los = Number.isFinite(storedLos) && storedLos >= 0
    ? storedLos
    : admissionDate && dischargeDate
      ? daysBetween(admissionDate, dischargeDate)
      : admissionDate
        ? daysBetween(admissionDate, todayText)
        : null
  const isCurrentlyAdmitted = !!admissionDate && admissionDate <= todayText && (!dischargeDate || dischargeDate >= todayText)
  return {
    name: String(FIRST(core.patient_name, core.subject, fields['Nama Pasien']) ?? ''),
    medicalRecordNo: String(FIRST(core.medical_record_no, core.rm, fields['No. Rekam Medis'], fields['No. RM']) ?? ''),
    diagnosis,
    icd10Code: mapping.code,
    icd10Label: mapping.label,
    icd10NeedsReview: mapping.needsReview,
    admissionDate,
    dischargeDate,
    lengthOfStayDays: los,
    isCurrentlyAdmitted,
    recordDate: dateOnly(row.record_date ?? core.admission_at ?? core.admit) ?? null,
    measurementGrain: String(row.measurement_grain ?? core.measurement_grain ?? 'event'),
    roomId: Number.isFinite(Number(core.room_id ?? row.room_id)) ? Number(core.room_id ?? row.room_id) : null,
    lastUpdatedAt: String(FIRST(row.updated_at, row.created_at) ?? '') || null,
  }
}
