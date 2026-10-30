export type OutpatientWorkbookRecord = {
  recordDate: string
  clinic: string
  doctor: string
  waitingMinutes: number
  sourceRow: number
  sourceColumn: number
}

export type OutpatientWorkbookParseResult = {
  rows: OutpatientWorkbookRecord[]
  clinics: string[]
  doctors: string[]
  dates: string[]
  invalidCellCount: number
  skippedRowCount: number
  warnings: string[]
}

const MAX_ROWS = 20000
const MAX_COLUMNS = 500

function readCellValue(cell: any): unknown {
  const value = cell?.value
  if (value == null) return ''
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if ('result' in value) return value.result ?? ''
    if (Array.isArray(value.richText)) return value.richText.map((part: any) => String(part?.text ?? '')).join('')
    if (typeof value.text === 'string') return value.text
    if (typeof value.hyperlink === 'string') return value.text ?? value.hyperlink
    return ''
  }
  return value
}

function cellText(cell: any): string {
  const value = readCellValue(cell)
  return value == null ? '' : String(value).trim()
}

function excelSerialToDate(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10)
}

export function normalizeOutpatientDate(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return String(value.getUTCFullYear()) + '-' + String(value.getUTCMonth() + 1).padStart(2, '0') + '-' + String(value.getUTCDate()).padStart(2, '0')
  }
  if (typeof value === 'number') return excelSerialToDate(value)
  const raw = String(value ?? '').trim()
  if (!raw) return null

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/)
  if (iso) {
    const year = Number(iso[1]), month = Number(iso[2]), day = Number(iso[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
      : null
  }

  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)
  if (dmy) {
    const day = Number(dmy[1]), month = Number(dmy[2]), year = Number(dmy[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
      : null
  }

  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return String(parsed.getUTCFullYear()) + '-' + String(parsed.getUTCMonth() + 1).padStart(2, '0') + '-' + String(parsed.getUTCDate()).padStart(2, '0')
}

function parseMinutes(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 ? value : null
  let raw = String(value).trim().replace(/\s/g, '')
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.')
  else raw = raw.replace(',', '.')
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function isClinicLabel(value: string): boolean {
  return /^(?:klinik|poliklinik)\b/i.test(value)
}

function isNonProviderLabel(value: string): boolean {
  return !value || /^(?:jumlah|total|rata[- ]?rata|grand total|keterangan|poliklinik|clinic|dokter)$/i.test(value)
}

/**
 * Reads the source workbook's Logbook matrix directly:
 * row 1 contains dates from column B onward; column A contains a clinic heading
 * followed by provider labels; each populated provider/date cell is one
 * provider-day observation.
 */
export async function parseOutpatientWorkbook(
  source: ArrayBuffer | Uint8Array,
  expectedYear: number,
): Promise<OutpatientWorkbookParseResult> {
  const module = await import('exceljs-hardened')
  const ExcelJS: any = (module as any).default ?? module
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(source)

  const worksheet = workbook.getWorksheet('Logbook')
  if (!worksheet) throw new Error('Sheet "Logbook" tidak ditemukan. Pilih workbook resmi Instalasi Rawat Jalan.')

  if (worksheet.rowCount > 5005) {
    throw new Error('Jumlah baris pada sheet Logbook melebihi batas 5.000 baris.')
  }

  const dateColumns: Array<{ column: number; date: string }> = []
  const invalidHeaders: number[] = []
  for (let column = 2; column <= Math.min(Number(worksheet.columnCount ?? 0), MAX_COLUMNS); column++) {
    const raw = readCellValue(worksheet.getRow(1).getCell(column))
    if (raw == null || String(raw).trim() === '') continue
    const date = normalizeOutpatientDate(raw)
    if (!date) {
      invalidHeaders.push(column)
      continue
    }
    if (Number(date.slice(0, 4)) === expectedYear) dateColumns.push({ column, date })
  }

  if (!dateColumns.length) {
    const invalidHint = invalidHeaders.length ? ' Ditemukan ' + invalidHeaders.length + ' header tanggal yang tidak valid.' : ''
    throw new Error('Tidak ditemukan kolom tanggal tahun ' + expectedYear + ' pada baris pertama sheet Logbook.' + invalidHint)
  }

  const rows: OutpatientWorkbookRecord[] = []
  const clinics = new Set<string>()
  const doctors = new Set<string>()
  const dates = new Set<string>()
  const warnings: string[] = []
  const seen = new Set<string>()
  let currentClinic = ''
  let invalidCellCount = 0
  let skippedRowCount = 0

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber++) {
    const worksheetRow = worksheet.getRow(rowNumber)
    const label = cellText(worksheetRow.getCell(1)).replace(/\s+/g, ' ').trim()
    if (!label) {
      currentClinic = ''
      skippedRowCount++
      continue
    }
    if (isClinicLabel(label)) {
      currentClinic = label
      clinics.add(label)
      continue
    }
    if (!currentClinic || isNonProviderLabel(label) || label.startsWith('=')) {
      skippedRowCount++
      continue
    }

    const populated = dateColumns.some(({ column }) => {
      const value = readCellValue(worksheetRow.getCell(column))
      return value != null && String(value).trim() !== ''
    })
    if (!populated) {
      skippedRowCount++
      continue
    }

    doctors.add(label)
    for (const { column, date } of dateColumns) {
      const raw = readCellValue(worksheetRow.getCell(column))
      if (raw == null || String(raw).trim() === '') continue
      const waitingMinutes = parseMinutes(raw)
      if (waitingMinutes == null) {
        invalidCellCount++
        if (warnings.length < 30) {
          warnings.push('Baris ' + rowNumber + ', kolom ' + column + ' (' + label + '): nilai waktu tunggu "' + String(raw) + '" tidak numerik/non-negatif dan dilewati.')
        }
        continue
      }

      const key = date + '\u0000' + currentClinic + '\u0000' + label
      if (seen.has(key)) {
        if (warnings.length < 30) warnings.push('Duplikasi sumber di baris ' + rowNumber + ', kolom ' + column + ' (' + currentClinic + ' · ' + label + ' · ' + date + ') dilewati.')
        continue
      }
      seen.add(key)
      rows.push({
        recordDate: date,
        clinic: currentClinic,
        doctor: label,
        waitingMinutes,
        sourceRow: rowNumber,
        sourceColumn: column,
      })
      dates.add(date)
      if (rows.length > MAX_ROWS) {
        throw new Error('Workbook menghasilkan lebih dari ' + MAX_ROWS.toLocaleString('id-ID') + ' observasi. Pecah file berdasarkan periode sebelum mengimpor.')
      }
    }
  }

  if (!rows.length) {
    throw new Error('Tidak ada nilai waktu tunggu numerik pada sheet Logbook untuk tahun ' + expectedYear + '. Periksa baris klinik, dokter, header tanggal, dan isi sel.')
  }

  return {
    rows,
    clinics: [...clinics],
    doctors: [...doctors],
    dates: [...dates].sort(),
    invalidCellCount,
    skippedRowCount,
    warnings,
  }
}
