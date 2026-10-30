export function normalizeOutpatientImportDate(value: unknown): string | null {
  const valid = (year: number, month: number, day: number): string | null => {
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
      : null
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return valid(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 20000 || value > 80000) return null
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
  }

  const raw = String(value ?? '').trim()
  if (!raw) return null
  const iso = raw.match(/^(\\d{4})-(\\d{2})-(\\d{2})/)
  if (iso) return valid(Number(iso[1]), Number(iso[2]), Number(iso[3]))
  const dmy = raw.match(/^(\\d{1,2})[\\/.-](\\d{1,2})[\\/.-](\\d{4})/)
  if (dmy) return valid(Number(dmy[3]), Number(dmy[2]), Number(dmy[1]))
  if (/^\\d+(?:[.,]\\d+)?$/.test(raw)) {
    const serial = Number(raw.replace(',', '.'))
    if (serial < 20000 || serial > 80000) return null
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
  }
  return null
}

export function parseOutpatientWaitingMinutes(value: unknown): number | null {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value >= 0 && value <= 1440 ? value : null
  }
  let raw = String(value ?? '').trim().toLocaleLowerCase('id-ID')
  if (!raw) return null
  raw = raw.replace(/\\s*menit(?:s)?\\s*$/i, '').replace(/\\s/g, '')
  if (!/^[+]?[0-9][0-9.,]*$/.test(raw)) return null

  let normalized = raw.replace(/^\\+/, '')
  const comma = normalized.lastIndexOf(',')
  const dot = normalized.lastIndexOf('.')
  if (comma >= 0 && dot >= 0) {
    // The last punctuation mark is the decimal separator.
    normalized = comma > dot
      ? normalized.replace(/\\./g, '').replace(',', '.')
      : normalized.replace(/,/g, '')
  } else if (comma >= 0) {
    normalized = /^\\d{1,3}(,\\d{3})+$/.test(normalized)
      ? normalized.replace(/,/g, '')
      : normalized.replace(',', '.')
  } else if (dot >= 0 && /^\\d{1,3}(\\.\\d{3})+$/.test(normalized)) {
    normalized = normalized.replace(/\\./g, '')
  }

  const parsed = Number(normalized)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1440 ? parsed : null
}

/** The same provider-day key used by manual logbook saves and the live DB import RPC. */
export function makeOutpatientProviderDaySubjectKey(date: string, clinic: string, doctor: string): string {
  return '11:' + date + ':' + clinic.trim() + ':' + doctor.trim()
}
