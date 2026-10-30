export const PHARMACY_INDICATOR_CODES = ['5.2', '5.3', '5.4', '5.5'] as const
export type PharmacyIndicatorCode = typeof PHARMACY_INDICATOR_CODES[number]
export type PharmacyImportStream = 'Rawat Jalan' | 'Rawat Inap'

export type PharmacySourceObservation = {
  date: string
  serviceStream: PharmacyImportStream
  indicatorCode: PharmacyIndicatorCode
  numerator: number | null
  denominator: number | null
  sourceSheet: string
  sourceRow: number
  error?: string
}

export type PharmacyImportMetric = {
  numerator: number
  denominator: number
  noncompliant?: number
  sourceNumerator: number
  sourceDenominator: number
}

export type PharmacyImportRecord = {
  date: string
  serviceStream: PharmacyImportStream
  values: Record<PharmacyIndicatorCode, PharmacyImportMetric>
  sourceRows: Record<string, number>
}

export type PharmacyImportExclusion = {
  date: string
  serviceStream: PharmacyImportStream
  sourceRows: Record<string, number>
  reasons: string[]
}

export type PharmacyImportBuildResult = {
  records: PharmacyImportRecord[]
  excluded: PharmacyImportExclusion[]
  noObservationCount: number
}

type Group = {
  date: string
  serviceStream: PharmacyImportStream
  observations: Partial<Record<PharmacyIndicatorCode, PharmacySourceObservation>>
}

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(value + 'T00:00:00.000Z')
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function isCount(value: number | null): value is number {
  return value != null && Number.isSafeInteger(value) && value >= 0
}

/**
 * Merge the eight source sheets by exact calendar date and service stream.
 * Zero/zero across all four indicators means no measurable daily denominator and is skipped.
 * A partially missing or mathematically impossible indicator excludes the whole date/stream row.
 */
export function buildPharmacyImportRecords(
  observations: PharmacySourceObservation[],
): PharmacyImportBuildResult {
  const groups = new Map<string, Group>()
  const duplicateErrors = new Map<string, string[]>()

  for (const observation of observations) {
    if (!isValidIsoDate(observation.date)) continue
    const key = observation.date + '|' + observation.serviceStream
    let group = groups.get(key)
    if (!group) {
      group = { date: observation.date, serviceStream: observation.serviceStream, observations: {} }
      groups.set(key, group)
    }
    if (group.observations[observation.indicatorCode]) {
      const errors = duplicateErrors.get(key) ?? []
      errors.push('Tanggal sumber ganda pada sheet ' + observation.sourceSheet + '.')
      duplicateErrors.set(key, errors)
      continue
    }
    group.observations[observation.indicatorCode] = observation
  }

  const records: PharmacyImportRecord[] = []
  const excluded: PharmacyImportExclusion[] = []
  let noObservationCount = 0

  for (const [key, group] of groups) {
    const sourceRows: Record<string, number> = {}
    const reasons = [...(duplicateErrors.get(key) ?? [])]
    let allNoObservation = true
    const completeValues: Partial<Record<PharmacyIndicatorCode, PharmacyImportMetric>> = {}

    for (const code of PHARMACY_INDICATOR_CODES) {
      const item = group.observations[code]
      if (!item) {
        reasons.push('Sheet untuk indikator ' + code + ' tidak memiliki baris pada tanggal ini.')
        allNoObservation = false
        continue
      }
      sourceRows[item.sourceSheet] = item.sourceRow
      if (item.error) {
        reasons.push(item.sourceSheet + ' baris ' + item.sourceRow + ': ' + item.error)
        allNoObservation = false
        continue
      }

      const n = item.numerator
      const d = item.denominator
      const noSample = (n == null && d == null) || (n === 0 && d === 0)
      if (noSample) continue
      allNoObservation = false

      if (!isCount(n) || !isCount(d)) {
        reasons.push(item.sourceSheet + ' baris ' + item.sourceRow + ': numerator dan denominator harus terisi sebagai bilangan bulat non-negatif.')
        continue
      }
      if (d <= 0) {
        reasons.push(item.sourceSheet + ' baris ' + item.sourceRow + ': denominator harus lebih besar dari nol untuk dihitung.')
        continue
      }
      if (n > d) {
        reasons.push(item.sourceSheet + ' baris ' + item.sourceRow + ': numerator (' + n + ') melebihi denominator (' + d + ').')
        continue
      }

      completeValues[code] = {
        numerator: code === '5.3' ? d - n : n,
        denominator: d,
        ...(code === '5.3' ? { noncompliant: n } : {}),
        sourceNumerator: n,
        sourceDenominator: d,
      }
    }

    if (allNoObservation && reasons.length === 0) {
      noObservationCount += 1
      continue
    }

    const missingCodes = PHARMACY_INDICATOR_CODES.filter(code => !completeValues[code])
    if (missingCodes.length) {
      for (const code of missingCodes) {
        const item = group.observations[code]
        if (item && !item.error && ((item.numerator == null && item.denominator == null) || (item.numerator === 0 && item.denominator === 0))) {
          reasons.push('Indikator ' + code + ' tidak memiliki denominator yang dapat dinilai pada tanggal/alur ini.')
        } else if (!item && !reasons.some(reason => reason.includes('indikator ' + code))) {
          reasons.push('Data indikator ' + code + ' tidak tersedia.')
        }
      }
    }

    if (reasons.length || missingCodes.length) {
      excluded.push({
        date: group.date,
        serviceStream: group.serviceStream,
        sourceRows,
        reasons: Array.from(new Set(reasons)),
      })
      continue
    }

    records.push({
      date: group.date,
      serviceStream: group.serviceStream,
      values: completeValues as Record<PharmacyIndicatorCode, PharmacyImportMetric>,
      sourceRows,
    })
  }

  records.sort((a, b) =>
    a.date.localeCompare(b.date) || a.serviceStream.localeCompare(b.serviceStream),
  )
  excluded.sort((a, b) =>
    a.date.localeCompare(b.date) || a.serviceStream.localeCompare(b.serviceStream),
  )

  return { records, excluded, noObservationCount }
}
