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
  /** Test seam; production defaults to window.prompt. */
  chooseColumn?: (message: string) => string | null
}

type StoredMapping = {
  normalizedHeader: string
  occurrence: number
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
    if (!row || row.mapping_status === 'needs_review' || !row.importer_key || !row.target_key || !row.source_header) continue
    const importer = next[row.importer_key] ?? (next[row.importer_key] = {})
    importer[row.target_key] = {
      normalizedHeader: normalizeExactHeader(row.source_header),
      occurrence: Math.max(1, Number(row.occurrence) || 1),
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

function columnLetter(column: number): string {
  let n = column
  let result = ''
  while (n > 0) {
    const remainder = (n - 1) % 26
    result = String.fromCharCode(65 + remainder) + result
    n = Math.floor((n - 1) / 26)
  }
  return result
}

function parseColumnChoice(value: string, allowed: number[]): number | null {
  const clean = value.trim().toUpperCase()
  if (!clean) return null
  if (/^\d+$/.test(clean)) {
    const n = Number(clean)
    return allowed.includes(n) ? n : null
  }
  if (/^[A-Z]{1,3}$/.test(clean)) {
    let n = 0
    for (const char of clean) n = n * 26 + char.charCodeAt(0) - 64
    return allowed.includes(n) ? n : null
  }
  return null
}

/**
 * Resolves a logical AUREKA field to a physical Excel column.
 *
 * Exact normalized matches are automatic only when unique. Missing, ambiguous,
 * and duplicate headers open a chooser in the upload flow. The selected source
 * header is saved per importer/field in this browser so later workbooks can be
 * mapped automatically even when their column order changes.
 */
export function resolveInteractiveExcelHeaderColumn(
  columns: InteractiveHeaderColumns,
  candidates: readonly string[],
  options: InteractiveHeaderMappingOptions,
): number | null {
  const positions = getPositions(columns)
  const serverSaved = activeMappingScope
    ? serverMappings[options.importerKey]?.[options.fieldKey]
    : undefined
  if (serverSaved) {
    const configuredPositions = positions.get(normalizeExactHeader(serverSaved.normalizedHeader)) ?? []
    if (configuredPositions.length >= serverSaved.occurrence) {
      return configuredPositions[serverSaved.occurrence - 1]
    }
    throw new Error(
      'Aturan impor unit mengarahkan "' + (options.fieldLabel ?? options.fieldKey) +
      '" ke kolom "' + serverSaved.normalizedHeader +
      '", tetapi header tersebut tidak ditemukan. Perbarui Pusat Pemetaan Excel untuk unit ini sebelum melanjutkan.'
    )
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

  const allColumns = [...positions.entries()]
    .flatMap(([header, indexes]) => indexes.map(index => ({ header, index })))
    .sort((a, b) => a.index - b.index)
  const choices = matched.length ? allColumns.filter(item => matched.includes(item.index)) : allColumns
  if (!choices.length) {
    throw new Error('Workbook tidak memiliki header yang dapat dipetakan untuk "' + (options.fieldLabel ?? candidates[0] ?? options.fieldKey) + '".')
  }

  const fieldLabel = options.fieldLabel ?? candidates[0] ?? options.fieldKey
  const reason = matched.length > 1
    ? 'AUREKA menemukan lebih dari satu kolom yang cocok. Pilih kolom sumber yang benar.'
    : 'Header belum dikenali. Pilih kolom sumber yang paling sesuai untuk field AUREKA ini.'
  const choiceLines = choices.map(item => columnLetter(item.index) + ' (' + item.index + ') — ' + item.header).join('\n')
  const message = [
    'AUREKA · PEMETAAN HEADER INTERAKTIF',
    '',
    'Field tujuan: ' + fieldLabel,
    reason,
    '',
    choiceLines,
    '',
    'Masukkan huruf kolom (mis. H) atau nomor kolom (mis. 8).',
    'Pilihan ini akan disimpan untuk unggahan berikutnya pada modul yang sama.',
  ].join('\n')

  const chooser = options.chooseColumn ?? (typeof window !== 'undefined' ? window.prompt.bind(window) : undefined)
  if (!chooser) {
    throw new Error('Header "' + fieldLabel + '" perlu pemetaan manual, tetapi dialog pemetaan tidak tersedia pada lingkungan ini.')
  }

  // Permit a few attempts so a typing mistake does not force the user to restart.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const answer = chooser(message)
    if (answer == null) {
      throw new Error('Pemetaan header "' + fieldLabel + '" belum diselesaikan. Unggah tetap tersimpan; lanjutkan pemetaan untuk mencoba kembali.')
    }
    const selected = parseColumnChoice(answer, choices.map(item => item.index))
    if (selected == null) continue
    const entry = choices.find(item => item.index === selected)!
    const occurrence = (positions.get(entry.header) ?? []).indexOf(selected) + 1
    writeMapping(options.importerKey, options.fieldKey, {
      normalizedHeader: entry.header,
      occurrence: Math.max(1, occurrence),
    })
    return selected
  }

  throw new Error('Pilihan kolom untuk "' + fieldLabel + '" tidak valid. Gunakan huruf atau nomor kolom yang ditampilkan.')
}

/**
 * Read the effective per-field selection for an embedded workbook mapping panel.
 * Unit/year-specific server mappings always take precedence over browser mappings.
 */
export function readInteractiveExcelHeaderMapping(importerKey: string, fieldKey: string):
  { normalizedHeader: string; occurrence: number; locked: boolean } | null {
  const configured = activeMappingScope ? serverMappings[importerKey]?.[fieldKey] : undefined
  if (configured) return { ...configured, locked: true }
  const saved = readMappings(importerKey)[fieldKey]
  return saved ? { ...saved, locked: false } : null
}

/** Persist an explicit user's column choice; never override server-governed mappings. */
export function saveInteractiveExcelHeaderMapping(
  importerKey: string,
  fieldKey: string,
  header: string,
  occurrence: number,
): void {
  if (activeMappingScope && serverMappings[importerKey]?.[fieldKey]) {
    throw new Error('Tautan kolom ini dikelola Pusat Pemetaan Excel dan tidak dapat ditimpa dari popup.')
  }
  const normalizedHeader = normalizeExactHeader(header)
  if (!normalizedHeader || !Number.isInteger(occurrence) || occurrence < 1) {
    throw new Error('Pilih kolom header yang valid.')
  }
  writeMapping(importerKey, fieldKey, { normalizedHeader, occurrence })
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
