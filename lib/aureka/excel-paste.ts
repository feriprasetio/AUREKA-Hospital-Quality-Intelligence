export type ExcelPasteRow = {
  sourceRow: number
  values: Record<string, string>
  cells: string[]
}

export type ExcelPasteResult = {
  headers: string[]
  matchedHeaders: string[]
  unknownHeaders: string[]
  duplicateHeaders: string[]
  rows: ExcelPasteRow[]
  errors: string[]
}

export function normalizeExactHeader(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\u00a0/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLocaleLowerCase('id-ID')
}

function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (char === '"' && quoted && text[i + 1] === '"') {
      field += '"'
      i += 1
    } else if (char === '"') {
      quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(field)
      field = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[i + 1] === '\n') i += 1
      row.push(field)
      if (row.some((cell) => cell.trim() !== '')) rows.push(row)
      row = []
      field = ''
    } else {
      field += char
    }
  }

  if (quoted) throw new Error('Ada tanda petik yang tidak berpasangan. Periksa isi sel di Excel lalu salin ulang.')
  row.push(field)
  if (row.some((cell) => cell.trim() !== '')) rows.push(row)
  return rows
}

/**
 * Parses tab-delimited rows copied directly from Excel.
 * Column names must match the current unit's AUREKA headers exactly after
 * case/space/diacritic normalization. Unknown or duplicate headers block use.
 */
export function parseExcelPaste(text: string, allowedHeaders: string[]): ExcelPasteResult {
  const errors: string[] = []
  const clean = String(text ?? '').replace(/^\uFEFF/, '').trim()
  if (!clean) {
    return { headers: [], matchedHeaders: [], unknownHeaders: [], duplicateHeaders: [], rows: [], errors: [] }
  }

  const firstLine = clean.split(/\r?\n/, 1)[0] ?? ''
  if (!firstLine.includes('\t')) {
    return {
      headers: [], matchedHeaders: [], unknownHeaders: [], duplicateHeaders: [], rows: [],
      errors: ['Format tidak dikenali. Salin rentang sel langsung dari Excel agar kolom dipisahkan tab, lalu tempel di sini.'],
    }
  }

  let matrix: string[][]
  try {
    matrix = parseDelimited(clean, '\t')
  } catch (error) {
    return { headers: [], matchedHeaders: [], unknownHeaders: [], duplicateHeaders: [], rows: [], errors: [error instanceof Error ? error.message : 'Format tempelan tidak valid.'] }
  }

  if (matrix.length < 2) {
    return { headers: (matrix[0] ?? []).map((h) => h.trim()), matchedHeaders: [], unknownHeaders: [], duplicateHeaders: [], rows: [], errors: ['Tempelan harus berisi satu baris header dan minimal satu baris data.'] }
  }
  if (matrix.length - 1 > 500) errors.push('Maksimal 500 baris per tempelan. Bagi data menjadi beberapa kelompok.')

  const headers = matrix[0].map((header) => header.trim())
  const allowed = new Map<string, string>()
  allowedHeaders.forEach((header) => {
    const key = normalizeExactHeader(header)
    if (key && !allowed.has(key)) allowed.set(key, header)
  })

  const seen = new Set<string>()
  const duplicateHeaders: string[] = []
  const unknownHeaders: string[] = []
  const matchedHeaders: string[] = []
  const mappedHeaders: (string | null)[] = []

  headers.forEach((header) => {
    const key = normalizeExactHeader(header)
    if (!key) {
      unknownHeaders.push('(header kosong)')
      mappedHeaders.push(null)
      return
    }
    if (seen.has(key)) duplicateHeaders.push(header)
    seen.add(key)
    const exact = allowed.get(key)
    if (!exact) {
      unknownHeaders.push(header)
      mappedHeaders.push(null)
    } else {
      matchedHeaders.push(exact)
      mappedHeaders.push(exact)
    }
  })

  if (new Set(matchedHeaders.map(normalizeExactHeader)).size !== matchedHeaders.length) {
    duplicateHeaders.push('Nama kolom yang sama muncul lebih dari sekali')
  }
  if (unknownHeaders.length) errors.push('Ada header yang tidak cocok dengan header aktif unit. Ubah kolom sumber atau pilih rentang yang tepat; kolom tidak akan ditebak otomatis.')
  if (duplicateHeaders.length) errors.push('Ada header ganda. Perbaiki nama kolom sebelum menggunakan data.')

  const rows = matrix.slice(1, 501).map((cells, index) => {
    const values: Record<string, string> = {}
    mappedHeaders.forEach((header, columnIndex) => {
      if (header) values[header] = String(cells[columnIndex] ?? '').trim()
    })
    return { sourceRow: index + 2, values, cells }
  })

  return { headers, matchedHeaders, unknownHeaders: [...new Set(unknownHeaders)], duplicateHeaders: [...new Set(duplicateHeaders)], rows, errors }
}
