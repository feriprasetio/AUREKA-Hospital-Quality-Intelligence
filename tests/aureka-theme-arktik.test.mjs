import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const layout = read('app/layout.tsx')
const client = read('components/HomeClient.tsx')
const infographic = read('components/governance/InfographicsDashboard.tsx')

test('Arktik adalah tema baku (pilihan Feri) dan tidak ditimpa tema Solid lama', () => {
  assert.match(layout, /<html lang="id" data-skin="arktik"/)
  assert.match(client, /setAttribute\('data-skin','arktik'\)/)
  assert.doesNotMatch(client, /setAttribute\('data-skin','solid'\)/)
  assert.doesNotMatch(layout, /data-skin="solid"/)
})

test('Infografis diagnostic points to the deployed aggregate and permission-guard migrations in execution order', () => {
  assert.match(infographic, /20261112140000_aureka_infographics_aggregate\.sql/)
  assert.match(infographic, /20261112044800_infographics_permission_guard\.sql/)
  assert.doesNotMatch(infographic, /20261112150000_infographics_permission_guard\.sql/)
})
