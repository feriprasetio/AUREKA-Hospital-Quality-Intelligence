import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const migration = read('supabase/migrations/20261118160000_quality_excel_unit_mapping_center.sql')
const mappingUi = read('components/QualityExcelMappingWorkspace.tsx')
const logbook = read('components/QualityIndicatorWorkspace.tsx')
const igd = read('components/IgdExcelImportDialog.tsx')
const icu = read('components/IcuExcelImportDialog.tsx')
const nicu = read('components/NicuExcelImportDialog.tsx')
const laboratory = read('components/LaboratoryExcelImportDialog.tsx')
const gizi = read('components/GiziExcelImportDialog.tsx')
const nara = read('supabase/functions/aureka-tanya/index.ts')

test('unit mappings are stored separately by room, year, workbook importer, and destination indicator', () => {
  assert.match(migration, /UNIQUE \(room_id, profile_year, importer_key, target_type, target_key\)/)
  assert.match(migration, /source_header text NOT NULL/)
  assert.match(migration, /occurrence integer NOT NULL DEFAULT 1/)
  assert.match(migration, /mapping_status text NOT NULL DEFAULT 'approved'/)
  assert.match(migration, /quality_excel_header_mapping_list/)
  assert.match(migration, /has_quality_room_access\(p_room_id\)/)
  assert.match(migration, /current_role_code\(\).*ADMIN.*PMKP|current_role_code\(\) NOT IN/s)
})

test('profile edits are separate from source-header mapping and write an audit record', () => {
  assert.match(migration, /quality_excel_indicator_profile_update/)
  assert.match(migration, /quality_excel_profile_audit/)
  assert.match(migration, /before_json,after_json,decision_note,actor_id/)
  assert.match(migration, /version=COALESCE\(version,1\)\+1/)
  assert.match(mappingUi, /Pengaturan per Indikator/)
  assert.match(mappingUi, /schema_json/)
  assert.match(mappingUi, /options_json/)
  assert.match(mappingUi, /Simpan revisi profil indikator/)
})

test('mapping workspace supports the 37-unit directory and keeps unsupported importers marked as initial setup', () => {
  assert.match(mappingUi, /Pemetaan Workbook Excel per Unit/)
  assert.match(mappingUi, /Pengaturan per Unit/)
  assert.match(mappingUi, /room_id: 37, key: 'unit-logbook', label: 'Workbook Logbook Verlos Kamer'/)
  assert.match(mappingUi, /connected: false/)
  assert.match(mappingUi, /Konfigurasi template unit tersedia, tetapi alur unggah khusus untuk unit ini belum terhubung/)
  assert.match(logbook, /Pengaturan Pemetaan Excel/)
  assert.match(logbook, /quality_excel_header_mapping_list/)
  assert.match(logbook, /hydrateInteractiveExcelHeaderMappings/)
})

test('IGD import no longer blocks a clinical profile just because its header_label is blank or different', () => {
  assert.match(igd, /indicator:' \+ indicator\.code/)
  assert.match(igd, /Header workbook is configured separately per unit\/importer/)
  assert.doesNotMatch(igd, /header !== indicator\.header \|\| header !== ACTIVE_HEADER_BY_CODE/)
  assert.match(igd, /resolveInteractiveExcelHeaderColumn/)
})

test('ICU, NICU, Laboratory and Gizi importers resolve per-unit indicator mappings', () => {
  assert.match(icu, /fieldKey: 'indicator:' \+ item\.code/)
  assert.match(nicu, /fieldKey: 'indicator:' \+ item\.code/)
  assert.match(laboratory, /fieldKey\?: string/)
  assert.match(laboratory, /indicator:' \+ indicator\.code/)
  assert.doesNotMatch(laboratory, /headerLabel !== indicator\.header/)
  assert.match(gizi, /fieldKey\?: string/)
  assert.match(gizi, /indicator:' \+ indicator\.code/)
})

test('NARA receives only header labels and indicator metadata, returns validated suggestions, and does not persist them', () => {
  assert.match(nara, /task === "excel_mapping_suggest"/)
  assert.match(nara, /available_excel_headers: headers/)
  assert.match(nara, /target_indicators: targets/)
  assert.match(nara, /quality_excel_mapping_ai_context/)
  assert.match(nara, /saved: false/)
  assert.match(nara, /source_header: sourceHeader/)
  assert.doesNotMatch(nara.slice(nara.indexOf('if (task === "excel_mapping_suggest")'), nara.indexOf('// AI-assisted ICD-10')), /upsert|insert\(|update\(/)
  assert.match(mappingUi, /NARA AI · Petakan massal/)
  assert.match(mappingUi, /Simpan aturan unit/)
  assert.match(mappingUi, /Periksa setiap usulan/)
})

test('mapping profile and bulk changes require explicit confirmation and a reason', () => {
  assert.match(mappingUi, /window\.confirm/)
  assert.match(mappingUi, /Alasan perubahan \/ catatan audit/)
  assert.match(migration, /length\(v_note\) < 10/)
  assert.match(migration, /quality_excel_mapping_audit/)
})

test('all 37 active units are listed with connected importer status separated from template-only units', () => {
  const roomIds = [...mappingUi.matchAll(/room_id: (\d+), key:/g)].map(match => Number(match[1]))
  for (let roomId = 1; roomId <= 37; roomId++) assert.ok(roomIds.includes(roomId), 'missing room ' + roomId)
  assert.match(mappingUi, /connected: true/)
  assert.match(mappingUi, /connected: false/)
  assert.match(mappingUi, /activeRoom/)
  assert.match(mappingUi, /Workbook logbook/)
})

test('unit mapping stores the physical worksheet, header row, column letter/index and duplicate occurrence', () => {
  assert.match(mappingUi, /type HeaderColumn = \{ header: string; index: number; letter: string; occurrence: number \}/)
  assert.match(mappingUi, /column_letter: selectedColumn\?\.letter/)
  assert.match(mappingUi, /sheet_name: selectedSheet/)
  assert.match(mappingUi, /header_row: detectedColumns\.length \? headerRow : null/)
  assert.match(mappingUi, /occurrence: finalOccurrence/)
  assert.match(mappingUi, /Pilih huruf kolom sumber/)
  assert.match(mappingUi, /header duplikat/)
})

test('exact profile header and aliases are prepared before NARA, while low-confidence AI suggestions are not auto-applied', () => {
  assert.match(mappingUi, /schema\.header_label/)
  assert.match(mappingUi, /schema\.excel_header_aliases/)
  assert.match(mappingUi, /item\.confidence >= 0\.8/)
  assert.match(mappingUi, /keyakinan ≥80%/)
  assert.match(mappingUi, /Tidak ada perubahan tersimpan sebelum konfirmasi/)
})

test('IGD main and consultation workbooks map base fields separately from indicator responses', () => {
  assert.match(mappingUi, /key: 'igd-consult', label: 'Audit konsultasi DPJP/)
  assert.match(mappingUi, /unitFieldCatalog/)
  assert.match(mappingUi, /consult:registrationAt/)
  assert.match(mappingUi, /target_type: 'field'/)
  assert.match(igd, /'field:' \+ key, 'igd'/)
  assert.match(igd, /'field:consult:' \+ key/)
  assert.match(igd, /'igd-consult'/)
  assert.match(igd, /schema\.excel_header_aliases/)
})

test('reconciliation workspace contains queue, unit mapping and indicator profile settings tabs', () => {
  const reconciliation = read('components/QualityReconciliationWorkspace.tsx')
  assert.match(reconciliation, /Antrean Rekonsiliasi/)
  assert.match(reconciliation, /Pengaturan per Unit/)
  assert.match(reconciliation, /Pengaturan per Indikator/)
  assert.match(reconciliation, /<QualityExcelMappingWorkspace/)
  assert.match(reconciliation, /initialTab="indicator"/)
})

test('only approved server mappings are used by importers; stale saved headers can fall back to profile aliases', () => {
  const resolver = read('lib/aureka/interactive-header-mapping.ts')
  assert.match(resolver, /row\.mapping_status !== 'approved'/)
  assert.match(resolver, /staleSavedHeader/)
  assert.match(resolver, /serverSaved\?\.normalizedHeader/)
  assert.match(resolver, /Pusat Rekonsiliasi → Pengaturan per Unit/)
})

