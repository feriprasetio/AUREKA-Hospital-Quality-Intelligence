import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import {
  clearPersistedImportMappingSet,
  getPersistedImportMappingSet,
  setPersistedImportMappingSet,
  type PersistedImportHeaderMapping,
} from '@/lib/aureka/import-mapping-cache'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')

type MappingRow = {
  room_id: number
  profile_year: number
  importer_key: string
  sheet_name: string
  header_row: number
  data_start_row: number
  field_mappings: Record<string, PersistedImportHeaderMapping> | null
  indicator_mappings: Record<string, PersistedImportHeaderMapping> | null
}

function asMap(value: unknown): Record<string, PersistedImportHeaderMapping> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const result: Record<string, PersistedImportHeaderMapping> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    if (!key || !raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const item = raw as Record<string, unknown>
    const sourceHeader = String(item.source_header ?? '').trim()
    if (!sourceHeader) continue
    const occurrence = Number(item.occurrence ?? 1)
    result[key] = {
      source_header: sourceHeader,
      occurrence: Number.isInteger(occurrence) && occurrence > 0 ? occurrence : 1,
      resolver_keys: Array.isArray(item.resolver_keys) ? item.resolver_keys.map(String) : [],
      confidence: Number.isFinite(Number(item.confidence)) ? Number(item.confidence) : null,
      method: item.method === 'manual' || item.method === 'nara' ? item.method : 'exact',
    }
  }
  return result
}

/** Load the centrally governed mapping before the workbook chooser opens. */
export async function primeInteractiveExcelHeaderMappings(
  roomId: number | null,
  year: number,
  importerKey: string,
): Promise<MappingRow | null> {
  if (!roomId || !importerKey) {
    clearPersistedImportMappingSet(importerKey)
    return null
  }
  const { data, error } = await quality()
    .from('quality_import_mappings')
    .select('room_id,profile_year,importer_key,sheet_name,header_row,data_start_row,field_mappings,indicator_mappings')
    .eq('room_id', roomId)
    .eq('profile_year', year)
    .eq('importer_key', importerKey)
    .maybeSingle()
  if (error) throw new Error('Pengaturan pemetaan unit belum dapat dibaca: ' + error.message)
  const row = (data ?? null) as MappingRow | null
  if (!row) {
    clearPersistedImportMappingSet(importerKey)
    setPersistedImportMappingSet({
      importerKey,
      fieldMappings: {},
      indicatorMappings: {},
    })
    return null
  }
  setPersistedImportMappingSet({
    importerKey,
    fieldMappings: asMap(row.field_mappings),
    indicatorMappings: asMap(row.indicator_mappings),
    sheetName: row.sheet_name || 'Logbook',
    headerRow: Number(row.header_row) || 3,
    dataStartRow: Number(row.data_start_row) || ((Number(row.header_row) || 3) + 1),
  })
  return row
}

type HeaderCell = { value?: unknown; text?: string }

/**
 * Apply centrally configured mappings to importers that use custom header
 * parsers instead of resolveInteractiveExcelHeaderColumn().
 * Existing source-header detection remains the fallback for unconfigured keys.
 */
export function applyConfiguredImportMappingsToIndexes(
  importerKey: string,
  headerRow: { getCell: (index: number) => HeaderCell },
  currentIndexes: Record<string, number>,
  maxColumns = 200,
): Record<string, number> {
  const cache = (() => {
    // Imported lazily by the shared cache module without touching local storage.
    return configuredMappings(importerKey)
  })()
  if (!cache) return currentIndexes

  const positions = new Map<string, number[]>()
  for (let column = 1; column <= maxColumns; column++) {
    const cell = headerRow.getCell(column)
    const raw = String(cell?.text ?? cell?.value ?? '').trim()
    if (!raw) continue
    const key = normalizeExactHeader(raw)
    if (!key) continue
    const list = positions.get(key) ?? []
    list.push(column)
    positions.set(key, list)
  }

  const output = { ...currentIndexes }
  const apply = (targetKey: string, mapping: PersistedImportHeaderMapping) => {
    const matches = positions.get(normalizeExactHeader(mapping.source_header)) ?? []
    const occurrence = Math.max(1, Number(mapping.occurrence ?? 1))
    if (matches.length < occurrence) {
      throw new Error(
        'Pemetaan terpusat "' + targetKey + '" menunjuk kolom "' + mapping.source_header +
        '", tetapi kolom tersebut tidak ada pada header workbook. Perbarui Pengaturan Pemetaan Unit.'
      )
    }
    output[targetKey] = matches[occurrence - 1]
  }
  for (const [key, mapping] of Object.entries(cache.fieldMappings)) apply(key, mapping)
  for (const [code, mapping] of Object.entries(cache.indicatorMappings)) {
    apply('indicator:' + code, mapping)
  }
  return output
}

function configuredMappings(importerKey: string) {
  return getPersistedImportMappingSet(importerKey)
}
