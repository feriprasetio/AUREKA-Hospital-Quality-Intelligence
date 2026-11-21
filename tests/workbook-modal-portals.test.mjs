import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')
const importers = readdirSync(new URL('../components', import.meta.url)).filter(name => name.endsWith('ExcelImportDialog.tsx'))

test('all 23 Excel workbook import dialogs render above the workspace native navigation', () => {
  assert.equal(importers.length, 23)
  for (const file of importers) {
    const src = read('components/' + file)
    assert.match(src, /import \{ createPortal \} from 'react-dom'/, file)
    assert.match(src, /return createPortal\(/, file)
    assert.match(src, /document\.body/, file)
    assert.match(src, /useAccessibleDialog/, file)
    assert.match(src, /aria-modal="true"/, file)
    if (file === 'SpmExcelImportDialog.tsx') {
      assert.match(src, /className="spmPortal"/, file)
      assert.match(src, /className="spmWorkspace"/, file)
      assert.match(src, /className="spmOverlay"/, file)
    } else {
      assert.match(src, /className="aq aqPortal aqAuditWorkspace"/, file)
      assert.match(src, /className="aqBack"/, file)
      assert.match(src, /typeof document === 'undefined'/, file)
    }
  }
})

test('quality workbook archive/picker dialogs use body portal and keep focus handling', () => {
  const source = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(source, /pendingArchive&&typeof document!=='undefined'&&createPortal/)
  assert.match(source, /unitPickerOpen&&typeof document!=='undefined'&&createPortal/)
  assert.match(source, /ref=\{archiveConfirmDialogRef\}/)
  assert.match(source, /ref=\{unitPickerDialogRef\}/)
  assert.match(read('app/globals.css'), /:is\(\.moduleEnter, \.aq\.aqPortal\.aqAuditWorkspace\) \.aqDeleteConfirm/)
  assert.match(read('app/globals.css'), /:is\(\.moduleEnter, \.aq\.aqPortal\.aqAuditWorkspace\) \.aqUnitPicker/)
})
