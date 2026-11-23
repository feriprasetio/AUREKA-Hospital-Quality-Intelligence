import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const ibs = read('components/IbsExcelImportDialog.tsx')
const css = read('app/globals.css')
const visible = ibs.slice(ibs.indexOf('return createPortal('))

test('IBS import is preview-first with controls and an accessible visible table', () => {
  assert.match(visible, /className="ciImportGrid"/)
  assert.match(visible, /className="ciSidePanel"/)
  assert.match(visible, /className="ciMainPanel"/)
  assert.match(visible, /<QualityWorkbookPreviewControls config=\{ibsPreview\}/)
  assert.match(visible, /className="ciTable" role="region" tabIndex=\{0\}/)
  assert.match(visible, /shownPreviewRows\.map\(row =>/)
  assert.match(visible, /maskIbsPatientName\(row.patientName\)/)
  assert.match(visible, /maskIbsMedicalRecord\(row.medicalRecordNo\)/)





  assert.match(visible, /role="progressbar" aria-valuenow=\{progress\}/)
  const shared = read('components/quality/QualityWorkbookPreviewControls.tsx')
  assert.match(shared, /<option value="history">Lintas tahun/)
  assert.match(shared, /<option value=\{120\}>120 baris/)
  assert.match(shared, /config\.setPreviewMode/)
  assert.match(shared, /config\.setPreviewSize/)
  assert.match(visible, /disabled=\{!eligible \|\| !authorized \|\| !rows\.length \|\| errors\.length > 0 \|\| parsing \|\| importing \|\| !!result\}/)
})
test('IBS import keeps warnings and excluded rows accessible without top-heavy system instructions', () => {
  assert.match(visible, /<details className="ciReviewDetails">/)
  assert.match(visible, /excludedRows\.slice\(0, 30\)/)
  assert.match(visible, /warningRows\.slice\(0, 20\)/)
  assert.match(visible, /Nilai kosong dipertahankan sesuai sumber/)
  assert.doesNotMatch(visible, /Sistem membaca sheet/)
  assert.doesNotMatch(visible, /Batch awal 20 baris/)
  assert.doesNotMatch(visible, /repositori GitHub/)
  assert.doesNotMatch(visible, /kunci sumber Excel yang stabil/)
})
test('all classic unit Excel import dialogs are positioned centrally, with scrollable tables', () => {
  assert.match(css, /Centered Excel import workspace — shared by clinical unit dialogs/)
  assert.match(css, /\.aqBack:has\(> \.aqDrawer\[class\*="Import"\]\)/)
  assert.match(css, /justify-content: center !important/)
  assert.match(css, /align-items: center !important/)
  assert.match(css, /width: min\(1320px, calc\(100vw - 32px\)\) !important/)
  assert.match(css, /\.aqDrawer\[class\*="Import"\] \.ciTable/)
  assert.match(css, /min-height: 240px !important/)
  assert.match(css, /overflow: auto !important/)
  assert.match(css, /\.aqIbsImport \.ciImportGrid/)
  assert.match(css, /grid-template-columns: minmax\(245px, 285px\) minmax\(0, 1fr\)/)
  assert.match(css, /\.aqIbsImport \.ciTable/)
  assert.match(css, /min-height: 260px !important/)
})
