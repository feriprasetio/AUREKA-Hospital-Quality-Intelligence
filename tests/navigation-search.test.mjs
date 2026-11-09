import test from 'node:test'
import assert from 'node:assert/strict'
import { searchWorkspaceNavigation } from '../lib/aureka/navigation-search.ts'
import { readFileSync } from 'node:fs'

const modules = [['home', 'Ringkasan'], ['quality', 'Mutu Klinis'], ['risk', 'Manajemen Risiko']]
const groups = {
  quality: [{ id: 'indicators', label: 'Audit Indikator Mutu' }, { id: 'pathway', label: 'Clinical Pathway' }],
  risk: [{ id: 'register', label: 'Risk Register' }, { id: 'fmea', label: 'FMEA / HFMEA' }],
  settings: [{ id: 'users', label: 'Pengguna rahasia' }],
}

test('navigation search matches child labels, parent context, case, and multiple terms', () => {
  assert.equal(searchWorkspaceNavigation(modules, groups, 'PATHWAY')[0].childId, 'pathway')
  const result = searchWorkspaceNavigation(modules, groups, 'mutu pathway')
  assert.equal(result.length, 1)
  assert.equal(result[0].moduleId, 'quality')
  assert.equal(result[0].context, 'Mutu Klinis')
  assert.equal(searchWorkspaceNavigation(modules, groups, 'ringkasan')[0].childId, undefined)
})

test('navigation search never exposes groups outside the supplied authorized modules', () => {
  assert.deepEqual(searchWorkspaceNavigation(modules, groups, 'rahasia'), [])
  assert.deepEqual(searchWorkspaceNavigation([['quality', 'Mutu Klinis']], groups, 'risiko'), [])
  assert.deepEqual(searchWorkspaceNavigation(modules, groups, '   '), [])
  assert.deepEqual(searchWorkspaceNavigation(modules, groups, 'tidak-ada'), [])
})

test('nested destinations retain their authorized module and full breadcrumb', () => {
  const results = searchWorkspaceNavigation([['quality', 'Mutu Klinis']], {
    quality: [{ id: 'pathway', label: 'Clinical Pathway', children: [{ id: 'results', label: 'Hasil Capaian' }] }],
  }, 'hasil')
  assert.equal(results[0].childId, 'results')
  assert.equal(results[0].context, 'Mutu Klinis · Clinical Pathway')
  assert.equal(results[0].key, 'quality/results')
})

test('workspace keeps the comfortable baseline without a density toggle', () => {
  const css = readFileSync(new URL('../app/aureka-refined.css', import.meta.url), 'utf8')
  const home = readFileSync(new URL('../components/HomeClient.tsx', import.meta.url), 'utf8')
  assert.match(home, /data-density="comfortable"/)
  assert.doesNotMatch(home, /workspaceDensityToggle|setDensity|const \[density,/)
  assert.match(css, /\[data-density="compact"\] \.moduleEnter td \{ padding-block: 7px/)
  assert.match(css, /\[data-density="compact"\] \.moduleEnter th \{ padding-block: 8px/)
  assert.match(home, /workspaceGlobalSearchInput/)
  assert.match(home, /dispatchWorkspaceSearch\(e\.target\.value\)/)
  assert.match(home, /aureka:workspace-search/)
  assert.match(home, /const commandItems=useMemo/)
  assert.match(home, /<CommandPalette items=\{commandItems\}/)
  assert.doesNotMatch(home, /Cari menu|sidebarSearch|navigationQuery/)
  assert.match(css, /\.sidebarNav\[hidden\] \{ display: none !important/)
})
