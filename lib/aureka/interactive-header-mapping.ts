import { normalizeExactHeader } from './excel-paste.ts'

export type InteractiveHeaderColumns = ReadonlyMap<string, number | readonly number[]>

export type InteractiveHeaderMappingOptions = {
  /** Stable importer key, e.g. "ibs-logbook". Keeps different unit mappings isolated. */
  importerKey: string
  /** Stable importer field/indicator key, e.g. "medicalRecordNo" or "4.1". */
  fieldKey: string
  /** Human-readable AUREKA field label shown in the chooser. */
  fieldLabel?: string
  /** Optional fields are not prompted when no corresponding source column exists. */
  required?: boolean
  /** Deprecated compatibility field. Importers no longer prompt during upload. */
  chooseColumn?: (message: string) => string | null
}

type StoredMapping = {
  normalizedHeader: string
  occurrence: number
  mappingStatus?: 'approved' | 'needs_review'
}

type StoredMappings = Record<string, StoredMapping>

export type ServerHeaderMapping = {
  importer_key: string
  target_key: string
  source_header: string
  occurrence?: number | null
  mapping_status?: string
}

let activeMappingScope = ''
let serverMappings: Record<string, Record<string, StoredMapping>> = {}

export function hydrateInteractiveExcelHeaderMappings(
  roomId: number | null,
  year: number,
  rows: readonly ServerHeaderMapping[],
): void {
  activeMappingScope = roomId == null ? '' : String(roomId) + ':' + String(year)
  const next: Record<string, Record<string, StoredMapping>> = {}
  for (const row of rows) {
    if (!row || !row.importer_key || !row.target_key || !row.source_header) continue
    const importer = next[row.importer_key] ?? (next[row.importer_key] = {})
    importer[row.target_key] = {
      normalizedHeader: normalizeExactHeader(row.source_header),
      occurrence: Math.max(1, Number(row.occurrence) || 1),
      mappingStatus: row.mapping_status === 'needs_review' ? 'needs_review' : 'approved',
    }
  }
  serverMappings = next
}

/** Clears the in-memory server mapping scope when the logbook changes unit/year. */
export function clearInteractiveExcelHeaderMappingScope(): void {
  activeMappingScope = ''
  serverMappings = {}
}

const STORAGE_PREFIX = 'aureka:excel-header-mapping:v1:'

function getPositions(columns: InteractiveHeaderColumns): Map<string, number[]> {
  const positions = new Map<string, number[]>()
  for (const [rawKey, rawValue] of columns.entries()) {
    const key = normalizeExactHeader(rawKey)
    if (!key) continue
    const values = Array.isArray(rawValue) ? rawValue : [rawValue]
    const current = positions.get(key) ?? []
    for (const value of values) {
      const column = Number(value)
      if (Number.isInteger(column) && column > 0 && !current.includes(column)) current.push(column)
    }
    current.sort((a, b) => a - b)
    positions.set(key, current)
  }
  return positions
}

function readMappings(importerKey: string): StoredMappings {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + importerKey)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed as StoredMappings
  } catch {
    return {}
  }
}

function writeMapping(importerKey: string, fieldKey: string, mapping: StoredMapping): void {
  if (typeof window === 'undefined') return
  try {
    const mappings = readMappings(importerKey)
    mappings[fieldKey] = mapping
    window.localStorage.setItem(STORAGE_PREFIX + importerKey, JSON.stringify(mappings))
  } catch {
    // Storage can be unavailable in private/restricted browser contexts.
    // The current import still succeeds; only reuse on later uploads is lost.
  }
}

/**
 * Resolves a logical AUREKA field to a physical Excel column.
 *
 * Resolution order:
 * 1. A saved unit/year/importer mapping configured by Admin/PMKP.
 * 2. A legacy browser mapping retained for backward compatibility.
 * 3. A unique exact header match.
 *
 * Missing or ambiguous mandatory headers never open a browser prompt. The importer
 * stops with an actionable route to the central configuration workspace instead
 * of silently guessing the wrong column.
 */
export function resolveInteractiveExcelHeaderColumn(
  columns: InteractiveHeaderColumns,
  candidates: readonly string[],
  options: InteractiveHeaderMappingOptions,
): number | null {
  const positions = getPositions(columns)
  const fieldLabel = options.fieldLabel ?? candidates[0] ?? options.fieldKey
  const context = activeMappingScope ? activeMappingScope.replace(':', ' / ') : 'unit belum dipilih'

  const configurationError = (reason: string) =>
    'Kolom sumber untuk "' + fieldLabel + '" ' + reason +
    '. Atur pada Indikator Mutu → Pusat Rekonsiliasi → Pengaturan per Unit (unit/tahun ' +
    context + ', workbook "' + options.importerKey + '", target "' + options.fieldKey +
    '"), lalu unggah ulang. AUREKA tidak akan memilih kolom secara acak.'

  const serverSaved = activeMappingScope
    ? serverMappings[options.importerKey]?.[options.fieldKey]
    : undefined

  if (serverSaved) {
    if (serverSaved.mappingStatus === 'needs_review') {
      throw new Error(configurationError('masih menunggu persetujuan Admin/PMKP'))
    }
    const configuredPositions = positions.get(normalizeExactHeader(serverSaved.normalizedHeader)) ?? []
    if (configuredPositions.length >= serverSaved.occurrence) {
      return configuredPositions[serverSaved.occurrence - 1]
    }
    throw new Error(configurationError(
      'sudah dikonfigurasi ke header "' + serverSaved.normalizedHeader + '" tetapi header tersebut tidak ditemukan'
    ))
  }

  const saved = readMappings(options.importerKey)[options.fieldKey]
  const savedPositions = saved ? positions.get(normalizeExactHeader(saved.normalizedHeader)) ?? [] : []
  if (saved && savedPositions.length >= saved.occurrence) {
    return savedPositions[saved.occurrence - 1]
  }

  const matched = [...new Set(candidates.flatMap(candidate => positions.get(normalizeExactHeader(candidate)) ?? []))]
    .sort((a, b) => a - b)

  if (matched.length === 1) return matched[0]
  if (matched.length === 0 && options.required === false) return null
  if (matched.length > 1) {
    throw new Error(configurationError('memiliki lebih dari satu kolom yang cocok (' + matched.length + ' kandidat)')
    )
  }

  const allHeaders = [...positions.entries()]
    .flatMap(([header, indexes]) => indexes.map(index => ({ header, index })))
    .sort((a, b) => a.index - b.index)
    .map(item => item.header + ' (' + item.index + ')')
  throw new Error(configurationError(
    'belum ditemukan sebagai header yang cocok' +
    (allHeaders.length ? '. Header tersedia: ' + allHeaders.slice(0, 25).join('; ') : '')
  ))
}

/** Remove saved manual mappings for one importer; useful when the source template changes. */
export function clearInteractiveExcelHeaderMappings(importerKey: string): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(STORAGE_PREFIX + importerKey)
  } catch {
    // Ignore unavailable storage.
  }
}
