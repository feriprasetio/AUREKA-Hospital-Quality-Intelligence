export type PatientRecordAnalytics = {
  year: number
  scope_room_id: number | null
  episodes: number
  unique_patients: number
  inpatient_episodes: number
  discharged_inpatients: number
  active_inpatients: number
  valid_mrn: number
  invalid_mrn: number
  diagnosis_available: number
  diagnosis_missing: number
  icd10_coded: number
  diagnosis_uncoded: number
  los_count: number
  average_los: number | null
  monthly: { month: number; count: number }[]
  top_icd10: { code: string; diagnosis: string; count: number }[]
  los_bands: { label: string; count: number }[]
  units: { unit: string; episodes: number; inpatient: number; active: number; average_los: number | null; los_count: number }[]
}

const COUNTS = [
  'episodes', 'unique_patients', 'inpatient_episodes', 'discharged_inpatients',
  'active_inpatients', 'valid_mrn', 'invalid_mrn', 'diagnosis_available',
  'diagnosis_missing', 'icd10_coded', 'diagnosis_uncoded', 'los_count',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isNonnegativeNumberOrNull(value: unknown) {
  return value === null || (typeof value === 'number' && Number.isFinite(value) && value >= 0)
}

export function parsePatientRecordAnalytics(
  result: unknown,
  scope: { roomId: number | null; year: number },
): PatientRecordAnalytics {
  if (isRecord(result) && result.allowed === false) {
    throw new Error('Tidak ada akses ke data episode pada unit atau cakupan yang dipilih.')
  }

  if (
    !isRecord(result) || result.allowed !== true ||
    result.year !== scope.year || result.scope_room_id !== scope.roomId ||
    !COUNTS.every(key => isCount(result[key])) ||
    !isNonnegativeNumberOrNull(result.average_los) ||
    !Array.isArray(result.monthly) || !result.monthly.every(row =>
      isRecord(row) && isCount(row.month) && row.month >= 1 && row.month <= 12 && isCount(row.count)) ||
    result.monthly.length !== 12 || new Set(result.monthly.map(row => row.month)).size !== 12 ||
    !Array.isArray(result.top_icd10) || !result.top_icd10.every(row =>
      isRecord(row) && typeof row.code === 'string' && typeof row.diagnosis === 'string' && isCount(row.count)) ||
    !Array.isArray(result.los_bands) || !result.los_bands.every(row =>
      isRecord(row) && typeof row.label === 'string' && isCount(row.count)) ||
    !Array.isArray(result.units) || !result.units.every(row =>
      isRecord(row) && typeof row.unit === 'string' && isCount(row.episodes) &&
      isCount(row.inpatient) && isCount(row.active) && isCount(row.los_count) &&
      isNonnegativeNumberOrNull(row.average_los))
  ) {
    throw new Error('Ringkasan rekam medis tidak lengkap atau tidak sesuai dengan filter.')
  }

  const analytics = result as PatientRecordAnalytics
  if (
    analytics.los_count > analytics.discharged_inpatients ||
    (analytics.average_los === null) !== (analytics.los_count === 0)
  ) {
    throw new Error('Ringkasan LOS tidak konsisten dengan jumlah catatan yang dapat dihitung.')
  }
  return analytics
}

export function patientRecordCoverage(observed: number, eligible: number): number | null {
  return eligible > 0 && observed <= eligible ? observed / eligible * 100 : null
}
