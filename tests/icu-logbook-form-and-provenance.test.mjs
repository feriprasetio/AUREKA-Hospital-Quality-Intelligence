import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('ICU layout headers resolve to the published profile codes instead of blank unmatched cards', () => {
  const layouts = JSON.parse(read('data/quality-audit-layout-2026.json'))
  const icu = layouts.find((item) => Number(item.roomId) === 14)
  assert.ok(icu)
  assert.ok(icu.indicators.includes('Kekosongan BHP/Linen'))
  assert.ok(!icu.indicators.includes('Kekosongan Obat'))
  assert.ok(!icu.indicators.includes('Kekosongan Linen'))
  const workspace = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(workspace, /ICU_LAYOUT_PROFILE_CODE_ALIASES/)
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
    assert.match(workspace, new RegExp("'" + header + "':\\s*'" + code + "'"))
  }
})

test('ICU profiles use categorical capture even when the measurement engine classifies them as ratios', () => {
  const workspace = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(workspace, /function isCategoricalResponseCapture\(p:Profile\)/)
  assert.match(workspace, /if\(isCategoricalResponseCapture\(p\)\)return !!String\(r\.answer\?\?''\)\.trim\(\)/)
  assert.match(workspace, /if\(isCategoricalResponseCapture\(p\)\)return\{answer:'',code:null\}/)
  const start = workspace.indexOf('const indicatorEditor=')
  const end = workspace.indexOf('const reviewRecord=', start)
  const editor = workspace.slice(start, end)
  assert.match(editor, /categoricalCapture= isCategoricalResponseCapture|categoricalCapture=isCategoricalResponseCapture/)
  assert.match(editor, /!categoricalCapture&&kindNow==='ratio'/)
  assert.match(editor, /!categoricalCapture&&kindNow==='visit'/)
  assert.match(editor, /categoricalCapture\|\|shouldUseIndicatorDropdown/)
})

test('ICU importer requires BHP/Linen source mapping, stores exact header/value, and backfills old episodes', () => {
  const importer = read('components/IcuExcelImportDialog.tsx')
  assert.match(importer, /code: '14\.1', header: 'Kekosongan BHP\/Linen'/)
  assert.match(importer, /indicatorHeaders: Record<string, string>/)
  assert.match(importer, /source_indicator_columns: row\.indicatorHeaders/)
  assert.match(importer, /indicatorColumnRefs: Record<string, \{ header_text: string; column_letter: string; column_index: number \}>/)
  assert.match(importer, /source_indicator_column_refs: row\.indicatorColumnRefs/)
  assert.match(importer, /excelColumnLetter\(column\)/)
  assert.match(importer, /\.from\('aureka-quality-source-workbooks'\)[\s\S]*?\.upload\(sourceStoragePath, file/)
  assert.match(importer, /source_storage_bucket: 'aureka-quality-source-workbooks'/)
  assert.match(importer, /source_storage_path: sourceStoragePath/)
  assert.match(importer, /source_bhp_linen:/)
  assert.match(importer, /indicator_code: '14\.1'/)
  assert.match(importer, /Respons indikator Kekosongan BHP\/Linen \(14\.1\) kosong/)
  assert.match(importer, /backfill_icu_logbook_bhp_linen_batch/)
  assert.doesNotMatch(importer, /source_unmapped_indicator/)
  assert.doesNotMatch(importer, /not_mapped_combined_source_requires_review/)
})

test('results load provenance for every unit and offer a clickable source-column detail', () => {
  const results = read('components/QualityResultsWorkspace.tsx')
  assert.match(results, /indicator_values:core_data->indicator_values,source_import:core_data->source_import/)
  assert.match(results, /Sumber Excel · kolom/)
  assert.match(results, /source_indicator_columns\?\.\[code\]/)
  assert.match(results, /source_bhp_linen\?\.source_value/)
  assert.match(results, /source_indicator_column_refs\?\.\[code\]/)
  assert.match(results, /cellRef: columnLetter[\s\S]*?source\.source_sheet/)
  assert.match(results, /createSignedUrl\(sourceProvenance\.storagePaths\[0\], 300\)/)
  assert.match(results, /Buka workbook privat/)
  assert.match(results, /Referensi sel/)
  assert.match(results, /Baris Excel/)
  assert.match(results, /Header aktual belum direkam/)
})

test('database migration marks ICU responses categorical and backfills only an empty 14.1 field', () => {
  const migration = read('supabase/migrations/20261118100000_icu_categorical_form_and_bhp_linen_backfill.sql')
  assert.match(migration, /response_capture_mode/)
  assert.match(migration, /ARRAY\['14\.1','14\.2','14\.3','14\.4','14\.5','14\.6','14\.7','14\.8','14\.9'\]/)
  assert.match(migration, /backfill_icu_logbook_bhp_linen_batch/)
  assert.match(migration, /SECURITY DEFINER/)
  assert.match(migration, /aureka_system\.has_quality_room_access\(14\)/)
  assert.match(migration, /coalesce\(v_existing_core->'indicator_values','\{\}'::jsonb\) \? '14\.1'/)
  assert.match(migration, /v_backfilled/)
  assert.match(migration, /ON CONFLICT \(record_id, indicator_id\) DO NOTHING/)
  assert.match(migration, /source_indicator_columns/)
})


test('private source workbook policy scopes reads to authorized rooms and writes to Admin/PMKP', () => {
  const migration = read('supabase/migrations/20261118115000_icu_source_workbook_provenance_storage.sql')
  assert.match(migration, /'aureka-quality-source-workbooks'[\s\S]*?false/)
  assert.match(migration, /CREATE POLICY aureka_quality_source_workbooks_select/)
  assert.match(migration, /CREATE POLICY aureka_quality_source_workbooks_insert/)
  assert.match(migration, /current_role_code\(\) IN \('ADMIN', 'PMKP'\)/)
  assert.match(migration, /has_quality_room_access/)
  assert.match(migration, /source_indicator_column_refs/)
  assert.match(migration, /source_storage_path/)
})

test('monthly indicator cells open the exact Excel provenance for the selected month', () => {
  const results = read('components/QualityResultsWorkspace.tsx')
  assert.match(results, /const \[sourceMonth, setSourceMonth\] = useState<number \| null>\(null\)/)
  assert.match(results, /openSourceTrace\(result\.profile, month\.month\)/)
  assert.match(results, /className="qraSourceCell"/)
  assert.match(results, /sourceMonth == null \|\| operationalCalendarParts\(row\)\?\.month === sourceMonth/)
  assert.match(results, /cellRef: columnLetter && excelRow/)
  assert.match(results, /createSignedUrl\(sourceProvenance\.storagePaths\[0\], 300\)/)
  assert.match(results, /Worksheet:|Worksheet:/)\n  assert.match(results, /Baris Excel|cellRef/)
})
