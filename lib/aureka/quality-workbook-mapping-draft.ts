import qualityAuditLayout2026 from '@/data/quality-audit-layout-2026.json'
import {
  normalizeExcelHeader,
  type ExcelHeaderColumn,
} from './excel-column-picker.ts'

/**
 * Provides visual mapping proposals when no versioned indicator master exists yet.
 * This reference list must NEVER become an automatically published profile set,
 * indicator obligation, or source of official quality measures.
 */
export type ProvisionalIndicatorMapping = {
  key: string
  indicatorLabel: string
  columnIndex: number
  sourceHeader: string
  occurrence: number
}

type UnitLayout = { roomId: number; indicators?: string[] }

export function proposeWorkbookIndicatorMappings(
  roomId: number | null,
  columns: readonly ExcelHeaderColumn[],
): ProvisionalIndicatorMapping[] {
  if (roomId == null || !columns.length) return []
  const layout = (qualityAuditLayout2026 as UnitLayout[]).find(
    candidate => Number(candidate.roomId) === Number(roomId),
  )
  if (!layout?.indicators?.length) return []
  const seen = new Set<number>()
  return layout.indicators.flatMap((indicatorLabel, i) => {
    const column = columns.find(item =>
      normalizeExcelHeader(item.header) === normalizeExcelHeader(indicatorLabel) &&
      !seen.has(item.index),
    )
    if (!column) return []
    seen.add(column.index)
    return [{
      key: 'reference:' + i + ':' + normalizeExcelHeader(indicatorLabel),
      indicatorLabel,
      columnIndex: column.index,
      sourceHeader: column.header,
      occurrence: column.occurrence,
    }]
  })
}

export type ProvisionalMappingDraft = {
  version: 1
  roomId: number
  year: number
  importerKey: string
  sourceSheet: string
  headerRow: number
  mappings: Array<{
    indicatorLabel: string
    sourceHeader: string
    occurrence: number
  }>
}

const storagePrefix = 'aureka:quality-mapping-draft:v1:'

export function provisionalDraftStorageKey(
  roomId: number, year: number, importerKey: string, sourceSheet: string,
): string {
  return storagePrefix + [roomId, year, importerKey, normalizeExcelHeader(sourceSheet)]
    .map(encodeURIComponent).join(':')
}

export function parseProvisionalMappingDraft(value: unknown): ProvisionalMappingDraft | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const rows = candidate.mappings
  if (candidate.version !== 1 || !Number.isSafeInteger(candidate.roomId) ||
      !Number.isSafeInteger(candidate.year) || typeof candidate.importerKey !== 'string' ||
      typeof candidate.sourceSheet !== 'string' || !Number.isSafeInteger(candidate.headerRow) ||
      !Array.isArray(rows) || rows.length > 250) return null
  const mappings: ProvisionalMappingDraft['mappings'] = []
  for (const row of rows) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) return null
    const item = row as Record<string, unknown>
    if (typeof item.indicatorLabel !== 'string' || typeof item.sourceHeader !== 'string' ||
      !item.indicatorLabel.trim() || !item.sourceHeader.trim() ||
      item.indicatorLabel.length > 240 || item.sourceHeader.length > 240 ||
      !Number.isSafeInteger(item.occurrence) || Number(item.occurrence) < 1 ||
      Number(item.occurrence) > 20) return null
    mappings.push({
      indicatorLabel: item.indicatorLabel,
      sourceHeader: item.sourceHeader,
      occurrence: Number(item.occurrence),
    })
  }
  return {
    version: 1, roomId: Number(candidate.roomId), year: Number(candidate.year),
    importerKey: candidate.importerKey, sourceSheet: candidate.sourceSheet,
    headerRow: Number(candidate.headerRow), mappings,
  }
}
