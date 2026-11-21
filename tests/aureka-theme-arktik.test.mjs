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

test('Infographics show a user-facing failure state without database setup instructions', () => {
  assert.match(infographic, /Ringkasan belum dapat dimuat/)
  assert.match(infographic, /className="ifError" role="alert"/)
  assert.doesNotMatch(infographic, /infographics_(?:permission_guard|aggregate)\.sql|Ringkasan tidak mengembalikan payload/)
})
