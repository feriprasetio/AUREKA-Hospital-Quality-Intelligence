/**
 * Excel source-column picker: distinguish physical columns with the same header.
 * Store header + occurrence (not physical letter) so a later column reorder is safe.
 */
export type ExcelHeaderColumn = {
  index: number
  letter: string
  header: string
  occurrence: number
}
export const normalizeExcelHeader = (value: unknown): string =>
  String(value ?? '').normalize('NFKC').toLocaleLowerCase('id-ID').replace(/\s+/g, ' ').trim()

export function excelColumnLetter(index: number): string {
  if (!Number.isSafeInteger(index) || index < 1) throw new Error('Indeks kolom Excel harus positif.')
  let number = index
  let result = ''
  while (number > 0) {
    number--
    result = String.fromCharCode(65 + number % 26) + result
    number = Math.floor(number / 26)
  }
  return result
}

export function detectExcelHeaderColumns(
  cells: ReadonlyArray<{ index: number; value: unknown }>,
): ExcelHeaderColumn[] {
  const occurrences = new Map<string, number>()
  return cells.flatMap(({ index, value }) => {
    if (!Number.isSafeInteger(index) || index <= 0) return []
    if (typeof value !== 'string' && typeof value !== 'number') return []
    const header = String(value).trim()
    const normalized = normalizeExcelHeader(header)
    if (!normalized) return []
    const occurrence = (occurrences.get(normalized) ?? 0) + 1
    occurrences.set(normalized, occurrence)
    return [{ index, letter: excelColumnLetter(index), header, occurrence }]
  })
}

export function resolveExcelSourceColumn(
  columns: readonly ExcelHeaderColumn[],
  sourceHeader: string | null | undefined,
  occurrence = 1,
): ExcelHeaderColumn | null {
  const wanted = normalizeExcelHeader(sourceHeader)
  if (!wanted) return null
  return columns.find(column => normalizeExcelHeader(column.header) === wanted && column.occurrence === occurrence) ?? null
}

export function describeExcelSourceColumn(column: ExcelHeaderColumn): string {
  return column.letter + ' · ' + column.header + (column.occurrence > 1 ? ' (judul sama #' + column.occurrence + ')' : '')
}
