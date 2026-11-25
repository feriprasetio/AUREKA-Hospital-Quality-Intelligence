export type CsvRow = Record<string, unknown>

function rawCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  // Excel berbahasa Indonesia memakai koma desimal; "87.5" bisa terbaca 875 atau tanggal.
  if (typeof value === 'number') return Number.isFinite(value) ? (Number.isInteger(value) ? String(value) : String(value).replace('.', ',')) : ''
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

export function escapeSpreadsheetCell(value: unknown): string {
  let text = rawCell(value)
  // Prefix dangerous text cells so spreadsheet apps do not evaluate user-controlled formulas.
  // Numeric values remain numbers and are not rewritten.
  const firstNonWhitespace = text.trimStart()[0]
  if (typeof value !== 'number' && ['=', '+', '-', '@'].includes(firstNonWhitespace)) text = "'" + text
  return /[";\r\n,]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
}

/**
 * CSV untuk Excel Indonesia: pemisah titik koma, BOM UTF-8 (huruf tidak rusak), baris CRLF,
 * dan sel teks yang diawali = + - @ dinetralkan.
 */
export function buildCsvTable(headers: readonly unknown[], rows: ReadonlyArray<readonly unknown[]>): string {
  return '\uFEFF' + [headers, ...rows].map((row) => row.map(escapeSpreadsheetCell).join(';')).join('\r\n')
}

export function buildCsv(rows: CsvRow[], columns: string[]): string {
  return buildCsvTable(columns, rows.map((row) => columns.map((column) => row[column])))
}

/** Unduh teks CSV. URL dicabut belakangan agar unduhan tidak batal di Safari/Firefox. */
export function downloadCsv(filename: string, csv: string) {
  if (typeof document === 'undefined') return
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename.endsWith('.csv') ? filename : filename + '.csv'
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}
