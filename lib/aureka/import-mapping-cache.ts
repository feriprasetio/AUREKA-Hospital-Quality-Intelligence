export type PersistedImportHeaderMapping = {
  source_header: string
  occurrence?: number
  resolver_keys?: string[]
  confidence?: number | null
  method?: 'manual' | 'exact' | 'nara'
}
export type PersistedImportMappingSet = {
  importerKey: string
  fieldMappings: Record<string, PersistedImportHeaderMapping>
  indicatorMappings: Record<string, PersistedImportHeaderMapping>
  sheetName?: string
  headerRow?: number
  dataStartRow?: number
}
const cache = new Map<string, PersistedImportMappingSet>()

export function setPersistedImportMappingSet(value: PersistedImportMappingSet): void {
  cache.set(value.importerKey, value)
}
export function getPersistedImportMappingSet(importerKey: string): PersistedImportMappingSet | null {
  return cache.get(importerKey) ?? null
}
export function clearPersistedImportMappingSet(importerKey: string): void {
  cache.delete(importerKey)
}
export function findPersistedImportHeaderMapping(importerKey: string, keys: readonly string[]): PersistedImportHeaderMapping | null {
  const value = cache.get(importerKey)
  if (!value) return null
  for (const key of keys) {
    if (!key) continue
    const directField = value.fieldMappings[key]
    if (directField) return directField
    if (key.startsWith('indicator:')) {
      const directIndicator = value.indicatorMappings[key.slice('indicator:'.length)]
      if (directIndicator) return directIndicator
    }
    for (const mapping of Object.values(value.fieldMappings)) {
      if (mapping.resolver_keys?.includes(key)) return mapping
    }
    for (const mapping of Object.values(value.indicatorMappings)) {
      if (mapping.resolver_keys?.includes(key)) return mapping
    }
  }
  return null
}
