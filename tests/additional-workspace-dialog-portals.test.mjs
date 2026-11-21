import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('standalone editors portal to body and retain accessible focus, beyond shared modal', () => {
  const cases = [
    ['components/CertificateTemplateEditor.tsx', 'certificateEditorBackdrop', 'templateDialogRef'],
    ['components/ClinicalDeathAuditWorkspace.tsx', 'acdDrawerBack', 'clinicalAuditDialogRef'],
    ['components/InHouseTrainingWorkspace.tsx', 'ihtBackdrop', 'trainingDialogRef'],
    ['components/ReactiveFmeaWorkspace.tsx', 'rfmeaBackdrop', 'reactiveDialogRef'],
    ['components/StaffCrossModuleProfilePanel.tsx', 'scProfileBackdrop', 'profileDialogRef'],
  ]
  for (const [path, backdrop, ref] of cases) {
    const src = read(path)
    assert.match(src, /import \{ createPortal \} from 'react-dom'/, path)
    assert.match(src, /useAccessibleDialog/, path)
    assert.match(src, /createPortal\(/, path)
    assert.match(src, /document\.body/, path)
    assert.ok(src.includes(backdrop), path)
    assert.ok(src.includes('ref={' + ref + '}'), path)
    assert.match(src, /aria-modal="true"/, path)
    assert.match(src, /z-index:var\(--aureka-z-dialog/, path)
  }
})

test('patient index and indicator proposal panels honor the same shared elevation', () => {
  const patient = read('components/patient-registry/PatientIndexTab.tsx')
  const proposal = read('components/IndicatorProposalWorkspace.tsx')
  assert.match(patient, /\.ptBackdrop\{position:fixed;inset:0;z-index:var\(--aureka-z-dialog/)
  assert.match(proposal, /\.ipOverlay\{position:fixed;inset:0;z-index:var\(--aureka-z-dialog/)
  const shell = read('app/aureka-navigation-system.css')
  for (const backdrop of ['certificateEditorBackdrop','acdDrawerBack','ihtBackdrop','rfmeaBackdrop','scProfileBackdrop','ipOverlay','ptBackdrop']) {
    assert.ok(shell.includes('.' + backdrop), backdrop)
  }
})
