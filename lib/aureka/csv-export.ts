export type CsvRow = Record<string, unknown>

function rawCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function escapeSpreadsheetCell(value: unknown): string {
  let text = rawCell(value)
  // Prefix dangerous text cells so spreadsheet apps do not evaluate user-controlled formulas.
  // Numeric values remain numbers and are not rewritten.
  if (typeof value !== 'number' && /^[\t\r\n ]*[=+\-@]/.test(text)) text = "'" + text
  return /[";\n,]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

export function buildCsv(rows: CsvRow[], columns: string[]): string {
  return '\uFEFF' + [
    columns.map((column) => escapeSpreadsheetCell(column)).join(';'),
    ...rows.map((row) => columns.map((column) => escapeSpreadsheetCell(row[column])).join(';')),
  ].join('\n')
}
