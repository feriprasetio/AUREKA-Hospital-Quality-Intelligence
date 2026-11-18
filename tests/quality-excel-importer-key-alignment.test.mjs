import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const settings = read('components/QualityExcelMappingWorkspace.tsx')
const nara = read('supabase/functions/aureka-tanya/index.ts')

test('maternal and emergency importer keys in the mapping centre match their runtime resolvers', () => {
  const pairs = [
    ['nifas', 'lib/aureka/nifas-logbook.ts'],
    ['perinatology', 'lib/aureka/perinatology-logbook.ts'],
    ['ponek', 'lib/aureka/ponek-logbook.ts'],
    ['timkordik', 'components/TimkordikExcelImportDialog.tsx'],
    ['rehab-medik', 'components/RehabMedikExcelImportDialog.tsx'],
  ]
  for (const [key, path] of pairs) {
    assert.ok(settings.includes("key: '" + key + "'"), 'mapping centre must expose importer ' + key)
    const importer = read(path)
    assert.ok(importer.includes("importerKey: '" + key + "'"), 'runtime importer must use key ' + key)
  }
})

test('inpatient mapping keys use the same identifiers as the header resolver libraries', () => {
  const pairs = [
    ['pediatric', 'lib/aureka/pediatric-inpatient-logbook.ts'],
    ['surgical', 'lib/aureka/surgical-inpatient-logbook.ts'],
    ['isolasi', 'lib/aureka/isolasi-inpatient-logbook.ts'],
    ['internal-medicine', 'lib/aureka/penyakit-dalam-inpatient-logbook.ts'],
    ['saraf', 'lib/aureka/saraf-inpatient-logbook.ts'],
  ]
  for (const [key, path] of pairs) {
    assert.ok(settings.includes("key: '" + key + "'"), 'mapping centre must expose importer ' + key)
    const importer = read(path)
    assert.ok(importer.includes("importerKey: '" + key + "'"), 'runtime importer must use key ' + key)
    assert.ok(importer.includes("fieldKey: key") || importer.includes("fieldKey: 'indicator:' + item.code"))
  }
})

test('NARA allow-list accepts the same importer keys as the mapping centre', () => {
  for (const key of ['pediatric','surgical','isolasi','internal-medicine','saraf','nifas','perinatology','ponek']) {
    assert.ok(nara.includes(key + ':') || nara.includes('"' + key + '"'), 'NARA must allow ' + key)
  }
})
