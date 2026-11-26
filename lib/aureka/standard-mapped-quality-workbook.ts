import { normalizeExactHeader } from './excel-paste.ts'
import { isExcelSourceError } from './quality-import-row-filter.ts'

type Column = { header: string; key: string }

const mappedRoomDates: Record<number, string> = {
  8: 'Tanggal Masuk',
  10: 'Waktu Permintaan',
  21: 'Tanggal Survei',
  27: 'Pelayanan di Ruangan',
  29: 'Tanggal Lapor',
  31: 'Tanggal Berkunjung',
  32: 'Tanggal Masuk',
  34: 'Tanggal Kunjungan',
  37: 'Tanggal Masuk',
}

export function getStandardMappedRoomDate(roomId: number): string | undefined {
  return mappedRoomDates[roomId]
}

export function exactWorkbookColumn(columns: readonly Column[], header: string): string {
  const expected = normalizeExactHeader(header)
  const matches = columns.filter(column => normalizeExactHeader(column.header) === expected)
  return matches.length === 1 ? matches[0].key : ''
}

export function readCodedWorkbookChoice(value: string) {
  let label = value.trim()
  const codes = new Set<number>()
  // Older PMKP sheets sometimes duplicate the suffix or omit its closing paren.
  for (;;) {
    const suffix = label.match(/\(\s*code\s*(\d+)\s*\)?$/i)
    if (!suffix) break
    codes.add(Number(suffix[1]))
    label = label.slice(0, suffix.index).trim()
  }
  return {
    label,
    sourceCode: codes.size === 1 ? [...codes][0] : null,
    conflictingCodes: codes.size > 1,
  }
}

function clockMinutes(value: unknown): number | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return value.getUTCHours() * 60 + value.getUTCMinutes() + value.getUTCSeconds() / 60
  }
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1) return value * 1440
  if (typeof value !== 'string' || isExcelSourceError(value)) return null
  const match = value.trim().match(/^(\d{1,2})[:.](\d{2})(?::(\d{2}))?$/)
  if (!match) return null
  const [h, m, s] = [Number(match[1]), Number(match[2]), Number(match[3] ?? 0)]
  return h < 24 && m < 60 && s < 60 ? h * 60 + m + s / 60 : null
}

export function getIncidentReportElapsedMinutes(
  incidentDate: string | null,
  incidentTime: unknown,
  reportDate: string | null,
  reportTime: unknown,
): number | null {
  const incident = clockMinutes(incidentTime)
  const report = clockMinutes(reportTime)
  if (!incidentDate || !reportDate || incident == null || report == null) return null
  const elapsed = (Date.parse(reportDate) - Date.parse(incidentDate)) / 60000 + report - incident
  return Number.isFinite(elapsed) && elapsed >= 0 ? elapsed : null
}
