import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const files = readdirSync(new URL('../components', import.meta.url))
  .filter(name => name.endsWith('ExcelImportDialog.tsx') && name !== 'SpmExcelImportDialog.tsx')
const shared = read('components/quality/QualityWorkbookPreviewControls.tsx')

test('all standard unit dialogs use the same preview control surface', () => {
  assert.equal(files.length, 22)
  for (const file of files) {
    const text = read('components/' + file)
    assert.match(text, /QualityWorkbookPreviewControls/, file)
    assert.match(text, /useQualityWorkbookPreview/, file)
    assert.match(text, /<QualityWorkbookPreviewControls config=/, file)
  }
})
test('shared preview controls contain actual functional filters and page size state', () => {
  assert.match(shared, /rows\.filter\(hasWarning\)/)
  assert.match(shared, /filtered\.slice\(0, previewSize\)/)
  assert.match(shared, /config\.setPreviewMode/)
  assert.match(shared, /config\.setPreviewSize/)
  assert.match(shared, /<option value=\{120\}>120 baris/)
  assert.match(shared, /if \(!config\.total\) return null/)
})
test('IGD keeps separate preview controls for its two linked import streams', () => {
  const src = read('components/IgdExcelImportDialog.tsx')
  assert.match(src, /useQualityWorkbookPreview\(mainRows\)/)
  assert.match(src, /useQualityWorkbookPreview\(consultRows\)/)
  assert.match(src, /<QualityWorkbookPreviewControls config=\{mainPreview\}/)
  assert.match(src, /<QualityWorkbookPreviewControls config=\{consultPreview\}/)
  assert.match(src, /mainPreview\.preview\.map/)
  assert.match(src, /consultPreview\.preview\.map/)
})
