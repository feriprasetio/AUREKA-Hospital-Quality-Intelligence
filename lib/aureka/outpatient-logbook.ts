export type OutpatientProviderGroup = {
  clinic: string
  doctors: string[]
}

export type OutpatientDoctorSummary = {
  doctor: string
  measurementCount: number
  averageMinutes: number | null
  lastObserved: string | null
}

export type OutpatientClinicSummary = {
  clinic: string
  rosterDoctorCount: number
  doctorsWithData: number
  recordCount: number
  measurementCount: number
  daysCount: number
  averageMinutes: number | null
  lastObserved: string | null
  doctorSummaries: OutpatientDoctorSummary[]
}

type OutpatientRecord = {
  admit?: unknown
  recordDate?: unknown
  formData?: Record<string, unknown> | null
}

export function normalizeProviderName(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('id-ID')
}

export function getOutpatientDoctorsForClinic(
  groups: readonly OutpatientProviderGroup[],
  clinic: unknown,
): string[] {
  const key = normalizeProviderName(clinic)
  if (!key) return []
  return groups.find(group => normalizeProviderName(group.clinic) === key)?.doctors ?? []
}

function readDateParts(value: unknown): { year: number; month: number; iso: string } | null {
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (iso) {
    const year = Number(iso[1])
    const month = Number(iso[2])
    const day = Number(iso[3])
    const check = new Date(Date.UTC(year, month - 1, day))
    if (check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day) {
      return { year, month, iso: `${iso[1]}-${iso[2]}-${iso[3]}` }
    }
    return null
  }

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/)
  if (dmy) {
    const day = Number(dmy[1])
    const month = Number(dmy[2])
    const year = Number(dmy[3])
    const check = new Date(Date.UTC(year, month - 1, day))
    if (check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === day) {
      return {
        year,
        month,
        iso: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      }
    }
    return null
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return {
    year: parsed.getFullYear(),
    month: parsed.getMonth() + 1,
    iso: `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, '0')}-${String(parsed.getDate()).padStart(2, '0')}`,
  }
}

function recordDate(record: OutpatientRecord): string | null {
  const fields = record.formData ?? {}
  const candidates = [
    record.recordDate,
    record.admit,
    fields['Tanggal pengamatan'],
    fields['record_date'],
    fields['date'],
  ]
  for (const candidate of candidates) {
    const parsed = readDateParts(candidate)
    if (parsed) return parsed.iso
  }
  return null
}

function readMinutes(record: OutpatientRecord, valueField: string): number | null {
  const fields = record.formData ?? {}
  const candidates = [
    fields[valueField],
    fields['Waktu Tunggu (Menit)'],
    fields['Rata-Rata Waktu Tunggu Rawat Jalan'],
    fields['waiting_minutes'],
  ]
  for (const candidate of candidates) {
    if (candidate == null || candidate === '') continue
    if (typeof candidate === 'number') {
      return Number.isFinite(candidate) && candidate >= 0 ? candidate : null
    }
    const match = String(candidate).trim().match(/^-?\d+(?:[.,]\d+)?/)
    if (!match) continue
    const value = Number(match[0].replace(',', '.'))
    if (Number.isFinite(value) && value >= 0) return value
  }
  return null
}

function mean(values: number[]): number | null {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null
}

/**
 * Builds the outpatient dashboard using the workbook's calculation method:
 * average the daily observations for each doctor, then average those doctor
 * means to obtain the clinic value. Doctors without numeric observations do
 * not contribute to the clinic mean.
 */
export function summarizeOutpatientClinics(
  records: readonly OutpatientRecord[],
  groups: readonly OutpatientProviderGroup[],
  year: number,
  month = 0,
  valueField = 'Waktu Tunggu Rawat Jalan (Menit)',
): OutpatientClinicSummary[] {
  const periodRows = records.flatMap(record => {
    const date = recordDate(record)
    const parts = date ? readDateParts(date) : null
    if (!parts || parts.year !== year || (month > 0 && parts.month !== month)) return []
    return [{ record, date }]
  })

  const clinicNames = new Map<string, string>()
  groups.forEach(group => clinicNames.set(normalizeProviderName(group.clinic), group.clinic))
  periodRows.forEach(({ record }) => {
    const clinic = String(record.formData?.['Klinik'] ?? '').trim()
    const key = normalizeProviderName(clinic)
    if (key && !clinicNames.has(key)) clinicNames.set(key, clinic)
  })

  return [...clinicNames.entries()].map(([clinicKey, clinic]) => {
    const clinicRows = periodRows.filter(({ record }) =>
      normalizeProviderName(record.formData?.['Klinik']) === clinicKey
    )
    const configuredGroup = groups.find(group => normalizeProviderName(group.clinic) === clinicKey)
    const doctorNames = new Map<string, string>()
    ;(configuredGroup?.doctors ?? []).forEach(doctor => doctorNames.set(normalizeProviderName(doctor), doctor))
    clinicRows.forEach(({ record }) => {
      const doctor = String(record.formData?.['Dokter'] ?? '').trim()
      const key = normalizeProviderName(doctor)
      if (key && !doctorNames.has(key)) doctorNames.set(key, doctor)
    })

    const doctorSummaries = [...doctorNames.entries()].map(([doctorKey, doctor]) => {
      const doctorRows = clinicRows.filter(({ record }) =>
        normalizeProviderName(record.formData?.['Dokter']) === doctorKey
      )
      const values = doctorRows
        .map(({ record }) => readMinutes(record, valueField))
        .filter((value): value is number => value !== null)
      const observedDates = doctorRows.map(row => row.date).sort()
      return {
        doctor,
        measurementCount: values.length,
        averageMinutes: mean(values),
        lastObserved: observedDates[observedDates.length - 1] ?? null,
      }
    })

    const measuredDoctors = doctorSummaries.filter(doctor => doctor.averageMinutes !== null)
    const clinicRowsDates = clinicRows.map(row => row.date).sort()
    const measurementCount = doctorSummaries.reduce((sum, doctor) => sum + doctor.measurementCount, 0)
    const daysCount = new Set(clinicRows.map(row => row.date)).size

    return {
      clinic,
      rosterDoctorCount: configuredGroup?.doctors.length ?? 0,
      doctorsWithData: measuredDoctors.length,
      recordCount: clinicRows.length,
      measurementCount,
      daysCount,
      averageMinutes: mean(measuredDoctors.map(doctor => doctor.averageMinutes as number)),
      lastObserved: clinicRowsDates[clinicRowsDates.length - 1] ?? null,
      doctorSummaries,
    }
  }).sort((a, b) => {
    const left = groups.findIndex(group => normalizeProviderName(group.clinic) === normalizeProviderName(a.clinic))
    const right = groups.findIndex(group => normalizeProviderName(group.clinic) === normalizeProviderName(b.clinic))
    if (left < 0 && right >= 0) return 1
    if (right < 0 && left >= 0) return -1
    if (left >= 0 && right >= 0) return left - right
    return a.clinic.localeCompare(b.clinic, 'id')
  })
}


export type OutpatientPerformanceSummary = {
  operatingClinics: number
  clinicsWithData: number
  clinicsBelow60: number
  clinicsWithoutData: number
  performanceRate: number | null
  overallAverageMinutes: number | null
}

/**
 * The operating-clinic denominator is the configured clinic roster plus any
 * additional clinics explicitly present in the logbook. A clinic without a
 * valid observation remains in the denominator and is reported as missing.
 * Overall waiting time is the unweighted mean of clinic means, following the
 * clinic-level aggregation used by the source workbook dashboard.
 */
export function summarizeOutpatientPerformance(
  records: readonly OutpatientRecord[],
  groups: readonly OutpatientProviderGroup[],
  year: number,
  month = 0,
  valueField = 'Waktu Tunggu Rawat Jalan (Menit)',
): OutpatientPerformanceSummary {
  const clinicSummaries = summarizeOutpatientClinics(records, groups, year, month, valueField)
  const clinicsWithData = clinicSummaries.filter(item => item.averageMinutes !== null)
  const clinicsBelow60 = clinicsWithData.filter(item => (item.averageMinutes as number) < 60).length
  const operatingClinics = clinicSummaries.length

  return {
    operatingClinics,
    clinicsWithData: clinicsWithData.length,
    clinicsBelow60,
    clinicsWithoutData: Math.max(0, operatingClinics - clinicsWithData.length),
    performanceRate: operatingClinics ? clinicsBelow60 / operatingClinics * 100 : null,
    overallAverageMinutes: mean(clinicsWithData.map(item => item.averageMinutes as number)),
  }
}
