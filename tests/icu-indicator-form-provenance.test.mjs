import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('ICU form headers resolve to the published 14.1–14.9 indicator profiles', () => {
  const workspace = read('components/QualityIndicatorWorkspace.tsx')
  const layout = read('data/quality-audit-layout-2026.json')
  for (const [header, code] of [
    ['visite spesialis', '14.4'],
    ['validitas asesmen', '14.8'],
    ['identifikasi pasien', '14.3'],
    ['apd', '14.5'],
    ['pencegahan jatuh', '14.6'],
    ['komunikasi perawatan', '14.7'],
    ['transfer igd', '14.2'],
    ['los icu panjang', '14.9'],
    ['kekosongan bhp linen', '14.1'],
  ]) {
    assert.match(workspace, new RegExp("'" + header.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "':\\s*'" + code + "'"))
  }
  const room = JSON.parse(layout).find((item) => item.roomId === 14)
  assert.ok(room)
  assert.ok(room.indicators.includes('Kekosongan BHP/Linen'))
  assert.equal(room.indicators.length, 9)
})

test('ICU imported categorical responses are rendered as editable choices, not empty numeric inputs', () => {
  const workspace = read('components/QualityIndicatorWorkspace.tsx')
  const migration = read('supabase/migrations/20261118060000_icu_categorical_capture_and_bhp_linen_mapping.sql')
  assert.match(workspace, /response_capture_mode\?\?''\)===\s*'categorical'/)
  assert.match(workspace, /categoricalCapture\|\|shouldUseIndicatorDropdown\(p\)/)
  assert.match(migration, /'response_capture_mode', 'categorical'/)
})

test('ICU workbook import stores BHP/Linen as indicator 14.1 with exact column coordinates', () => {
  const importer = read('components/IcuExcelImportDialog.tsx')
  const migration = read('supabase/migrations/20261118060000_icu_categorical_capture_and_bhp_linen_mapping.sql')
  assert.match(importer, /\{ code: '14\.1', header: 'Kekosongan BHP\/Linen'/)
  assert.match(importer, /source_indicator_columns: row\.indicatorHeaders/)
  assert.match(importer, /columnIndex: column/)
  assert.match(importer, /columnLetter: excelColumnLetter\(column\)/)
  assert.match(importer, /'Kekosongan BHP\/Linen': row\.unassignedBhpLinen/)
  assert.match(migration, /jsonb_array_length\(v_responses\) <> 9/)
  assert.match(migration, /'14\.1' = ANY\(v_seen_codes\)/)
  assert.match(migration, /column_letter/)
  assert.match(migration, /source_bhp_linen/)
})

test('Hasil Capaian links each indicator to the recorded source header, cell and workbook row', () => {
  const results = read('components/QualityResultsWorkspace.tsx')
  assert.match(results, /className="qraSourceBtn" onClick=\{\(\) => setSourceFor\(result\.profile\)\}/)
  assert.match(results, /source_indicator_columns\?\.\[code\]/)
  assert.match(results, /columnRef\.columnLetter/)
  assert.match(results, /sourceProvenance\.rows\.map/)
  assert.match(results, /sourceProvenance\.rowsWithValues/)
})
