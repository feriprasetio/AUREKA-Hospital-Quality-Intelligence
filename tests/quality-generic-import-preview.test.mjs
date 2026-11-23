import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('generic Excel importer has configurable, masked-by-omission staged row preview', () => {
  const src=read('components/QualityWorkbookImportPanel.tsx')
  const start=src.indexOf('className="qwiPreview"')
  const end=src.indexOf('preview?.issues?.length',start)
  assert.ok(start>=0 && end>start)
  const block=src.slice(start,end)
  assert.match(src,/useQualityWorkbookPreview\(preview\?\.rows \?\? \[\]\)/)
  assert.match(block,/<QualityWorkbookPreviewControls config=\{stagedPreview\}/)
  assert.match(block,/stagedPreview\.preview\.map/)
  assert.match(block,/record\.record_date/)
  assert.match(block,/record\.measurement_grain/)
  assert.match(block,/record\.review_required/)
  assert.doesNotMatch(block,/subject_json|patient_name|medical_record_no|subject_key/)
  const styles=read('app/quality-workbook-preview.css')
  assert.match(styles,/\.qwiPreviewScroll/)
  assert.match(styles,/max-height:min\(48dvh,480px\)/)
})

test('shared preview warning filter includes drafts and unvalidated generic import records', () => {
  const src=read('components/quality/QualityWorkbookPreviewControls.tsx')
  assert.match(src,/staged\?\.review_required === true/)
  assert.match(src,/staged\?\.status === 'draft'/)
  assert.match(src,/previewMode === 'history' && historical/)
  assert.match(src,/filtered\.slice\(0, previewSize\)/)
})
