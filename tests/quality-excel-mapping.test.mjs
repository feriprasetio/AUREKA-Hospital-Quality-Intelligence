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

test('mapping workspace supports the 37-unit directory and exposes the common workbook flow from the 37-unit directory', () => {
  assert.match(mappingUi, /Pemetaan Workbook Excel per Unit/)
  assert.match(mappingUi, /Pengaturan per Unit/)
  assert.match(mappingUi, /Tautkan kolom atau impor tabel/)
  assert.match(mappingUi, /alur unggah perlu dihubungkan ke importer sebelum digunakan otomatis/)
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
  assert.match(mappingUi, /Simpan aturan resmi/)
  assert.match(mappingUi, /Simpan draf di browser/)
  assert.match(mappingUi, /activeProfiles.length === 0 && ready && detectedColumns.length > 0/)
  assert.match(mappingUi, /provisionalRows.map\(row =>/)
  assert.match(mappingUi, /proposeWorkbookIndicatorMappings/)
  assert.match(mappingUi, /window.localStorage.setItem/)
  assert.match(mappingUi, /source_header: column.header/)
  assert.match(mappingUi, /occurrence: column.occurrence/)
  assert.match(mappingUi, /Periksa setiap usulan/)
})

test('mapping profile and bulk changes require explicit confirmation and a reason', () => {
  assert.match(mappingUi, /await aurekaConfirm\(/)
  assert.match(mappingUi, /Alasan perubahan \/ catatan audit/)
  assert.match(migration, /length\(v_note\) < 10/)
  assert.match(migration, /quality_excel_mapping_audit/)
})
