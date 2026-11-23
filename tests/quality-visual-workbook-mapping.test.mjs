import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Excel mapping uses physical sheet columns as dropdown options, not free-text suggestions', () => {
  const mapping = read('components/QualityExcelMappingWorkspace.tsx')
  assert.match(mapping, /detectExcelHeaderColumns/)
  assert.match(mapping, /selectHeaderRow\(chosen, chosen.recommendedRow\)/)
  assert.match(mapping, /setDetectedColumns\(candidate\.columns\)/)
  assert.match(mapping, /Baris ini hanya berisi judul kolom/)
  assert.match(mapping, /savedRow !== headerRow/)
  assert.match(mapping, /<select aria-label=\{'Pilih kolom sumber Excel untuk '/)
  assert.match(mapping, /describeExcelSourceColumn\(column\)/)
  assert.match(mapping, /source_header: column\.header/)
  assert.match(mapping, /occurrence: column\.occurrence/)
  assert.match(mapping, /!workbookName \|\| !selectedSheet \|\| !detectedColumns\.length/)
  assert.doesNotMatch(mapping, /<input list="qem-detected-header-list"/)
  assert.doesNotMatch(mapping, /<datalist id="qem-detected-header-list"/)
})

test('profile module launches workbook-source picker without requiring profile replacement', () => {
  const profile = read('components/QualitySettings.tsx')
  assert.match(profile, /Pilih Kolom dari Excel/)
  assert.match(profile, /<QualityExcelMappingWorkspace rooms=\{rooms\}/)
  assert.match(profile, /role === 'ADMIN' \|\| role === 'PMKP'/)
  assert.match(profile, /!excelMappingOpen && !profileWorkspaceOpen/)
  assert.match(profile, /!excelMappingOpen && profileWorkspaceOpen/)
  assert.doesNotMatch(profile, /<textarea[^>]*value=\{model\._schema_text/)
  assert.doesNotMatch(profile, /<textarea[^>]*value=\{model\._options_text/)
  assert.match(profile, /<OptionsEditor text=\{model\._options_text/)
})

test('indicator and response options are configured as visual controls', () => {
  const mapping = read('components/QualityExcelMappingWorkspace.tsx')
  const options = read('components/quality/QualityOptionEditor.tsx')
  assert.match(mapping, /<QualityOptionEditor text=\{profileDraft\.options_text\}/)
  assert.match(mapping, /Arah penilaian indikator/)
  assert.match(mapping, /Tipe pengukuran/)
  assert.doesNotMatch(mapping, /<label>Schema JSON \(termasuk/)
  assert.doesNotMatch(mapping, /<label>Opsi klasifikasi JSON<textarea/)
  assert.match(options, /\['1', '2', '3'\]\.map/)
  assert.match(options, /Kode tersimpan/)
  assert.match(options, /<option value="">Tanpa kode<\/option>/)
  assert.match(options, /\.\.\.row, \.\.\.patch/)
  assert.match(options, /<fieldset key=\{i\} className="qoeRow">/)
  assert.match(options, /<label className="qoeCheck">\s*<input type="checkbox"/)
})

test('indicator popup keeps long fields and save actions reachable on narrow screens', () => {
  const profile = read('components/QualitySettings.tsx')
  const modal = read('app/modal.css')
  assert.match(profile, /form=\{editorFormId\}/)
  assert.match(profile, /<textarea rows=\{2\} required value=\{model\.title/)
  assert.match(profile, /className="qualityProfileError" role="alert"/)
  assert.match(modal, /\.qoeRow\s*\{[^}]*minmax\(min\(100%, 210px\), 1fr\)/)
  assert.match(modal, /\.qoeCheck > input\[type="checkbox"\]\s*\{[^}]*inline-size: 18px/)
  assert.match(modal, /\.akModalBody\s*\{[^}]*min-height: 0;[^}]*overflow: auto/)
})
