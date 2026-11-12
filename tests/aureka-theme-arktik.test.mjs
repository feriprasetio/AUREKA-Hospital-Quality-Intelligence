import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const layout = read('app/layout.tsx')
const client = read('components/HomeClient.tsx')
const infographic = read('components/governance/InfographicsDashboard.tsx')
const accents = read('app/theme-arktik-accents.css')
const dark = read('app/theme-arktik-dark.css')

test('Arktik Kaca is the canonical workspace skin and legacy Solid layers are absent', () => {
  assert.match(layout, /<html lang="id" data-skin="arktik"/)
  assert.match(client, /setAttribute\('data-skin','arktik'\)/)
  assert.doesNotMatch(client, /setAttribute\('data-skin','solid'\)/)
  assert.match(client, /data-aureka-theme="arktik-glass"/)
  for (const oldFile of ['solid-default.css','aureka-solid-enterprise.css','aureka-solid-navigation.css']) {
    assert.doesNotMatch(layout, new RegExp(oldFile.replaceAll('.', '\\.') ))
    assert.doesNotMatch(accents, new RegExp('from ' + oldFile.replaceAll('.', '\\.') ))
    assert.doesNotMatch(dark, new RegExp('from ' + oldFile.replaceAll('.', '\\.') ))
  }
})

test('Infografis diagnostic points to the deployed aggregate and permission-guard migrations in execution order', () => {
  assert.match(infographic, /20261112140000_aureka_infographics_aggregate\.sql/)
  assert.match(infographic, /20261112044800_infographics_permission_guard\.sql/)
  assert.doesNotMatch(infographic, /20261112150000_infographics_permission_guard\.sql/)
})
