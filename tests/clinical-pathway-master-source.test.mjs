import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Clinical Pathway library uses Supabase as the sole source of master formats', () => {
  const source = read('components/ClinicalPathwayWorkspace.tsx')
  assert.match(source, /from\('clinical_pathway_templates'\)\.select\('\*'\)\.order\('name'\)/)
  assert.doesNotMatch(source, /fetchCatalog|normalizeCatalog|clinical-pathway-catalog-/)
  assert.doesNotMatch(source, /setTemplates\(source\)|const source = await fetchCatalog/)
})

test('opening Clinical Pathway does not seed bundled legacy formats back into the database', () => {
  const source = read('components/ClinicalPathwayWorkspace.tsx')
  const start = source.indexOf('const loadTemplates = useCallback')
  const end = source.indexOf('async function importClinicalPathwaySourcePack', start)
  assert.ok(start >= 0 && end > start, 'loadTemplates block should exist')
  const loader = source.slice(start, end)
  assert.doesNotMatch(loader, /\.insert\(/)
  assert.match(loader, /setTemplates\(shown\)/)
  assert.match(loader, /setTemplates\(\[\]\)/)
  assert.match(loader, /Belum ada format Clinical Pathway tersimpan/)
})

test('newly saved CP masters are reflected only in the Supabase-backed template list', () => {
  const source = read('components/ClinicalPathwayWorkspace.tsx')
  assert.doesNotMatch(source, /setCatalog|\[catalog, setCatalog\]/)
  assert.match(source, /setTemplates\(\(old\)=>\[\.\.\.old\.filter\(/)
})
