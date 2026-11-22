import type { Row } from 'exceljs-hardened'
import { detectExcelHeaderColumns, normalizeExcelHeader, resolveExcelSourceColumn, type ExcelHeaderColumn } from './excel-column-picker.ts'

export type WorkbookSourceColumn = ExcelHeaderColumn & { key: string }
export type WorkbookSourceRule = {
  source_header: string
  occurrence?: number
  mapping_status?: string
  transform_json?: { source_sheet?: string; header_row?: number }
}

export function readWorkbookSourceColumns(row: Row): WorkbookSourceColumn[] {
  const cells: Array<{ index: number; value: string }> = []
  row.eachCell((cell, index) => {
    if (cell.isMerged && cell.master.address !== cell.address) return
    if (cell.value && typeof cell.value === 'object' && 'error' in cell.value) return
    const text = cell.text.trim()
    if (text) cells.push({ index, value: text })
  })
  return detectExcelHeaderColumns(cells).map(column => ({
    ...column, key: column.letter + ': ' + column.header,
  }))
}

export function getWorkbookRuleColumn<T extends ExcelHeaderColumn>(
  columns: readonly T[], sheetName: string, headerRow: number, rule?: WorkbookSourceRule,
): T | null {
  if (!rule || rule.mapping_status === 'needs_review') return null
  const source = rule.transform_json
  if (source?.source_sheet && normalizeExcelHeader(source.source_sheet) !== normalizeExcelHeader(sheetName)) return null
  if (source?.header_row && Number(source.header_row) !== headerRow) return null
  const column = resolveExcelSourceColumn(columns, rule.source_header, Number(rule.occurrence ?? 1))
  return columns.find(item => item.index === column?.index) ?? null
}
