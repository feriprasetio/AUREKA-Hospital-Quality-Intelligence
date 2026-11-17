import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('ICU logbook maps the combined BHP/Linen Excel column to the 14.1 profile', () => {
  const importer = read('components/IcuExcelImportDialog.tsx')
  const workspace = read('components/QualityIndicatorWorkspace.tsx')
  const layout = JSON.parse(readFileSync(new URL('../data/quality-audit-layout-2026.json', import.meta.url), 'utf8'))
  const icu = layout.find((item) => item.roomId === 14)

  assert.match(importer, /code: '14\.1', header: 'Kekosongan BHP\/Linen'/)
  assert.match(importer, /source_bhp_linen:[\s\S]*indicator_code: '14\.1'/)
  assert.match(importer, /backfill_icu_logbook_bhp_linen_batch/)
  assert.ok(icu.indicators.includes('Kekosongan BHP/Linen'))
  assert.match(workspace, /'kekosongan bhp linen':'14\.1'/)
})

test('ICU categorical responses render as choices and are calculated from coded source answers', () => {
  const workspace = read('components/QualityIndicatorWorkspace.tsx')
  const engine = read('lib/aureka/quality-results-engine.ts')
  const migration = read('supabase/migrations/20261118100000_icu_categorical_form_and_bhp_linen_backfill.sql')

  assert.match(workspace, /isCategoricalResponseCapture\(p\)/)
  assert.match(workspace, /categoricalCapture\|\|shouldUseIndicatorDropdown/)
  assert.match(migration, /response_capture_mode/)
  assert.match(engine, /response_capture_mode/)
  assert.match(engine, /extractOptionObservation\(profile, response, month, inputAt\)/)
})

test('ICU source import retains exact Excel column coordinates and stores workbook privately', () => {
  const importer = read('components/IcuExcelImportDialog.tsx')
  const results = read('components/QualityResultsWorkspace.tsx')
  const storageMigration = read('supabase/migrations/20261118110000_secure_icu_source_workbook_storage.sql')
  const backfill = read('supabase/migrations/20261118103000_icu_backfill_all_source_headers.sql')

  assert.match(importer, /excelColumnLetter\(column\)/)
  assert.match(importer, /source_indicator_column_refs: row\.indicatorColumnRefs/)
  assert.match(importer, /\.from\('aureka-quality-source-workbooks'\)[\s\S]*?\.upload\(sourceStoragePath, file/)
  assert.match(importer, /sourceStoragePath/)
  assert.match(results, /source\.source_indicator_column_refs\?\.\[code\]/)
  assert.match(results, /cellRef: columnLetter[\s\S]*?source\.source_sheet/)
  assert.match(results, /createSignedUrl\(sourceProvenance\.storagePaths\[0\], 300\)/)
  assert.match(results, /Buka workbook privat/)
  assert.match(storageMigration, /public = false/)
  assert.match(storageMigration, /aureka_system\.has_quality_room_access/)
  assert.match(storageMigration, /current_role_code\(\) IN \('ADMIN', 'PMKP'\)/)
  assert.match(backfill, /source_storage_path/)
  assert.match(backfill, /source_indicator_column_refs/)
})

test('ICU BHP/Linen backfill preserves all other indicator data and skips already populated episodes', () => {
  const migration = read('supabase/migrations/20261118100000_icu_categorical_form_and_bhp_linen_backfill.sql')
  assert.match(migration, /IF nullif\(btrim\(v_existing_bhp\),''\) IS NOT NULL/)
  assert.match(migration, /coalesce\(v_existing_core->'indicator_values','\{\}'::jsonb\) \? '14\.1'/)
  assert.match(migration, /'Kekosongan BHP\/Linen', v_bhp->>'source_value'/)
  assert.match(migration, /jsonb_build_object\('14\.1', v_values->'14\.1'\)/)
  assert.match(migration, /ON CONFLICT \(record_id, indicator_id\) DO NOTHING/)
})
