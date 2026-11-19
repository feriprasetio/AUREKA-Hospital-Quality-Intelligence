export type SpmImportProfile = {
  id: string
  code: string
  profile_year: number
  group_name: string
  title: string
  numerator_definition: string | null
  denominator_definition: string | null
  source_mode: 'standalone' | 'quality_linked' | 'quality_denominator_linked'
  calculation_config: Record<string, unknown> | null
}

export type SpmPreparedMeasurement = {
  indicator_id: string
  profile_year: number
  period_month: number
  input_json: Record<string, number>
  notes: string
  source_row: number
  code: string
  title: string
  group_name: string
  room_id: number | null
  room_name: string | null
}

export type SpmImportRoom = { id: number; name: string; code?: string }

// Resolve workbook subunit labels to canonical AUREKA room identities. The existing
// master_rooms records remain the source of identity and access; no duplicate units/accounts.
const INPATIENT_SUBUNIT_ROOM_CODES: Record<string, string> = {
  [normalizeSpmExcelText('Rawat Inap Anak')]: 'RANAK',
  [normalizeSpmExcelText('Rawat Inap Bedah')]: 'RBEDAH',
  [normalizeSpmExcelText('Rawat Inap Isolasi')]: 'RISOLASI',
  [normalizeSpmExcelText('Rawat Inap Penyakit Dalam')]: 'RPENYDALAM',
  [normalizeSpmExcelText('Rawat Inap Saraf')]: 'RSARAF',
  [normalizeSpmExcelText('Rawat Inap VIP')]: 'RVIP',
};

export type SpmImportPreview = {
  rows: SpmPreparedMeasurement[]
  warnings: string[]
  matched_indicators: string[]
  linked_indicators_skipped: number
  ignored_unmatched_rows: number
  duplicate_rows_skipped: number
}

const MONTH_HEADERS = ['jan','feb','mar','apr','mei','jun','jul','agu','sep','okt','nov','des']

function textValue(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'object') {
    const item = value as Record<string, any>
    if (item.result != null) return textValue(item.result)
    if (Array.isArray(item.richText)) return item.richText.map(part => String(part?.text ?? '')).join('').trim()
    if (typeof item.text === 'string') return item.text.trim()
    if (typeof item.hyperlink === 'string') return String(item.text ?? item.hyperlink).trim()
    return ''
  }
  return String(value).trim()
}

function numericValue(value: unknown): number | null {
  if (value == null || textValue(value) === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const raw = textValue(value).replace(/\s/g, '').replace(',', '.')
  if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(raw)) return null
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}

export function normalizeSpmExcelText(value: unknown): string {
  return textValue(value)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('id-ID')
    .replace(/&/g, ' dan ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function similarity(left: unknown, right: unknown): number {
  const a = new Set(normalizeSpmExcelText(left).split(' ').filter(Boolean))
  const b = new Set(normalizeSpmExcelText(right).split(' ').filter(Boolean))
  if (!a.size || !b.size) return 0
  let common = 0
  a.forEach(token => { if (b.has(token)) common++ })
  return common / new Set([...a, ...b]).size
}

function monthHeadersMatch(row: unknown[], start: number): boolean {
  return MONTH_HEADERS.every((month, index) => normalizeSpmExcelText(row[start + 3 + index]) === month)
}

function numberFromCode(value: unknown): number | null {
  const parsed = numericValue(value)
  return parsed != null && Number.isInteger(parsed) && parsed > 0 ? parsed : null
}

/**
 * Convert repeated 15-column Logbook blocks into one measurement per indicator/month.
 * Only group + indicator + numerator-definition matches are imported. This intentionally
 * ignores secondary service blocks and old linked values that are not governed by SPM itself.
 */
export function prepareSpmExcelImport(
  grid: unknown[][],
  profiles: SpmImportProfile[],
  targetYear: number,
  fileName: string,
  rooms: SpmImportRoom[] = [],
): SpmImportPreview {
  if (!Array.isArray(grid) || grid.length < 3) throw new Error('Sheet Logbook tidak berisi baris data yang cukup.')
  if (!Number.isInteger(targetYear) || targetYear < 1900 || targetYear > 2200) {
    throw new Error('Tahun tujuan harus berupa bilangan bulat antara 1900 dan 2200.')
  }

  const activeProfiles = profiles.filter(profile => profile.profile_year === targetYear && profile.id)
  if (!activeProfiles.length) throw new Error('Master indikator untuk tahun tujuan belum tersedia. Muat ulang SPM terlebih dahulu.')

  const byGroupAndTitle = new Map<string, SpmImportProfile[]>()
  const knownGroups = new Set(activeProfiles.map(profile => normalizeSpmExcelText(profile.group_name)))
  for (const profile of activeProfiles) {
    const key = normalizeSpmExcelText(profile.group_name) + '|' + normalizeSpmExcelText(profile.title)
    const list = byGroupAndTitle.get(key) ?? []
    list.push(profile)
    byGroupAndTitle.set(key, list)
  }

  const headers: Array<{ row: number; start: number; end: number; group: string; subunit: string; room_id: number | null }> = []
  for (let rowIndex = 0; rowIndex < grid.length; rowIndex++) {
    const row = grid[rowIndex] ?? []
    for (let start = 0; start + 14 < row.length; start++) {
      if (
        normalizeSpmExcelText(row[start]) === 'no' &&
        normalizeSpmExcelText(row[start + 1]) === 'indikator' &&
        normalizeSpmExcelText(row[start + 2]) === 'parameter' &&
        monthHeadersMatch(row, start)
      ) {
        const group = start === 0 ? textValue(grid[rowIndex - 1]?.[start]) : textValue(grid[rowIndex - 1]?.[0])
        const subunit = start === 0 ? '' : textValue(grid[rowIndex - 1]?.[start])
        const isDistinctSubunit = !!subunit && normalizeSpmExcelText(subunit) !== normalizeSpmExcelText(group)
        const expectedRoomCode = INPATIENT_SUBUNIT_ROOM_CODES[normalizeSpmExcelText(subunit)]
        const room = isDistinctSubunit
          ? (expectedRoomCode ? rooms.find(item => String(item.code ?? '').toUpperCase() === expectedRoomCode) : undefined)
            ?? rooms.find(item => normalizeSpmExcelText(item.name) === normalizeSpmExcelText(subunit))
          : undefined
        headers.push({ row: rowIndex, start, end: grid.length, group, subunit, room_id: room ? Number(room.id) : null })
      }
    }
  }

  if (!headers.length) {
    throw new Error('Struktur sheet Logbook tidak dikenali. Header No. / Indikator / Parameter / Jan–Des tidak ditemukan.')
  }

  headers.forEach((header, index) => {
    const next = headers.slice(index + 1).find(item => item.start === header.start)
    header.end = next?.row ?? grid.length
  })

  const prepared = new Map<string, SpmPreparedMeasurement>()
  const matched = new Set<string>()
  const warnings: string[] = []
  let linkedIndicatorsSkipped = 0
  let ignoredUnmatchedRows = 0
  let duplicateRowsSkipped = 0
  let warningOverflow = 0

  const warn = (message: string) => {
    if (warnings.length < 30) warnings.push(message)
    else warningOverflow++
  }

  for (const header of headers) {
    const groupKey = normalizeSpmExcelText(header.group)
    const hasUnitBlocks = headers.some(item => item.row === header.row && item.room_id != null && normalizeSpmExcelText(item.group) === groupKey && normalizeSpmExcelText(item.subunit) !== groupKey)
    const parentAggregateBlock = header.start === 0 && hasUnitBlocks
    if (header.start > 0 && !header.room_id) { ignoredUnmatchedRows++; if (header.subunit) warn('Blok tambahan ' + header.subunit + ' tidak dipetakan ke master unit AUREKA; blok dilewati.'); continue }
    if (!groupKey || !knownGroups.has(groupKey)) {
      // Child services not represented as separate SPM master groups are intentionally ignored.
      ignoredUnmatchedRows++
      continue
    }

    for (let rowIndex = header.row + 1; rowIndex < header.end; rowIndex++) {
      const row = grid[rowIndex] ?? []
      const sourceCode = numberFromCode(row[header.start])
      const title = textValue(row[header.start + 1])
      if (sourceCode == null || !title) continue

      const candidates = byGroupAndTitle.get(groupKey + '|' + normalizeSpmExcelText(title)) ?? []
      if (candidates.length !== 1) {
        ignoredUnmatchedRows++
        if (candidates.length > 1) warn('Baris Logbook ' + (rowIndex + 1) + ': nama kelompok dan indikator cocok ke lebih dari satu master SPM; baris dilewati.')
        continue
      }

      const profile = candidates[0]
      if (parentAggregateBlock && profile.source_mode !== 'quality_denominator_linked') continue
      if (profile.source_mode === 'quality_linked') {
        linkedIndicatorsSkipped++
        continue
      }
      if (profile.source_mode === 'quality_denominator_linked' && header.room_id != null) {
        ignoredUnmatchedRows++
        warn('Baris Logbook ' + (rowIndex + 1) + ' (' + profile.code + '): numerator per unit dilewati sampai denominator Indikator Mutu tersedia per unit.');
        continue
      }

      const method = String(profile.calculation_config?.method ?? 'ratio')
      const numeratorParameter = textValue(row[header.start + 2])
      const numeratorMatch = similarity(numeratorParameter, profile.numerator_definition)
      const minNumeratorMatch = profile.source_mode === 'quality_denominator_linked' ? 0.42 : 0.48
      if (!numeratorParameter || numeratorMatch < minNumeratorMatch) {
        ignoredUnmatchedRows++
        warn(
          'Baris Logbook ' + (rowIndex + 1) + ' (' + profile.code + '): definisi numerator tidak cukup cocok ('
          + Math.round(numeratorMatch * 100) + '%); nilai tidak diimpor.',
        )
        continue
      }

      const denominatorRow = grid[rowIndex + 1] ?? []
      const denominatorCode = numberFromCode(denominatorRow[header.start])
      const denominatorTitle = textValue(denominatorRow[header.start + 1])
      const hasDenominatorRow = denominatorCode == null && !denominatorTitle && !!textValue(denominatorRow[header.start + 2])
      const denominatorParameter = hasDenominatorRow ? textValue(denominatorRow[header.start + 2]) : ''
      const requiresDenominator = profile.source_mode !== 'quality_denominator_linked' && method !== 'manual_value'
      if (requiresDenominator && !hasDenominatorRow) {
        warn('Baris Logbook ' + (rowIndex + 1) + ' (' + profile.code + '): baris denominator tidak ditemukan tepat setelah numerator.')
        continue
      }
      if (requiresDenominator && similarity(denominatorParameter, profile.denominator_definition) < 0.30) {
        warn('Baris Logbook ' + (rowIndex + 1) + ' (' + profile.code + '): definisi denominator tidak cocok; nilai tidak diimpor.')
        continue
      }

      matched.add(profile.code)
      const scaleMax = Number(profile.calculation_config?.scale_max ?? 4)
      for (let monthIndex = 0; monthIndex < 12; monthIndex++) {
        const numerator = numericValue(row[header.start + 3 + monthIndex])
        if (numerator == null) continue

        let input: Record<string, number>
        if (profile.source_mode === 'quality_denominator_linked') {
          input = { numerator }
        } else if (method === 'manual_value') {
          input = { value: numerator }
        } else {
          const denominator = numericValue(denominatorRow[header.start + 3 + monthIndex])
          if (denominator == null) {
            warn('Baris Logbook ' + (rowIndex + 1) + ', bulan ' + MONTH_HEADERS[monthIndex].toUpperCase()
              + ' (' + profile.code + '): denominator kosong; bulan dilewati.')
            continue
          }
          if (method === 'score_to_percent') {
            if (denominator <= 0 || numerator < 0 || numerator > scaleMax) {
              warn('Baris Logbook ' + (rowIndex + 1) + ', bulan ' + MONTH_HEADERS[monthIndex].toUpperCase()
                + ' (' + profile.code + '): skor atau jumlah responden di luar batas; bulan dilewati.')
              continue
            }
            // The numerator cell already contains the mean score, not the sum of individual scores.
            input = { score_mean: numerator, respondents: denominator }
          } else if (method === 'ratio' || method === 'time_average' || method === 'no_event_rate') {
            if (method === 'no_event_rate' && (denominator <= 0 || numerator > denominator)) {
              warn('Baris Logbook ' + (rowIndex + 1) + ', bulan ' + MONTH_HEADERS[monthIndex].toUpperCase()
                + ' (' + profile.code + '): pasangan numerator/denominator tidak valid; bulan dilewati.')
              continue
            }
            input = { numerator, denominator }
          } else {
            warn('Indikator ' + profile.code + ' menggunakan metode perhitungan yang tidak didukung impor XLSX.')
            break
          }
        }

        const periodMonth = monthIndex + 1
        const key = profile.id + ':' + periodMonth + ':' + (header.room_id ?? 'all')
        if (prepared.has(key)) {
          duplicateRowsSkipped++
          continue
        }
        prepared.set(key, {
          indicator_id: profile.id,
          profile_year: targetYear,
          period_month: periodMonth,
          input_json: input,
          notes: 'Impor XLSX SPM: ' + fileName + ' · sheet Logbook · baris ' + (rowIndex + 1),
          source_row: rowIndex + 1,
          code: profile.code,
          title: profile.title,
          group_name: profile.group_name,
          room_id: header.room_id,
          room_name: header.room_id == null ? null : (rooms.find(item => Number(item.id) === Number(header.room_id))?.name ?? null),
        })
      }
    }
  }

  if (!prepared.size) {
    throw new Error('Tidak ada nilai bulanan yang dapat dipetakan. Pastikan file menggunakan format Logbook SPM yang sesuai dengan master indikator tahun ' + targetYear + '.')
  }

  if (warningOverflow) warnings.push(warningOverflow + ' peringatan tambahan tidak ditampilkan.')
  return {
    rows: Array.from(prepared.values()).sort((a, b) =>
      a.group_name.localeCompare(b.group_name, 'id') ||
      a.code.localeCompare(b.code, 'id') ||
      (a.room_id ?? 0) - (b.room_id ?? 0) ||
      a.period_month - b.period_month,
    ),
    warnings,
    matched_indicators: Array.from(matched).sort(),
    linked_indicators_skipped: linkedIndicatorsSkipped,
    ignored_unmatched_rows: ignoredUnmatchedRows,
    duplicate_rows_skipped: duplicateRowsSkipped,
  }
}
