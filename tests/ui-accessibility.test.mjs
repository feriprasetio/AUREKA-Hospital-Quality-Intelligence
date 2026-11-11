import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('shared dialog controller traps keyboard focus and restores focus', () => {
  const source = read('components/layout/useAccessibleDialog.ts')
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /event\.key !== 'Tab'/)
  assert.match(source, /lastElement\.focus\(\)/)
  assert.match(source, /firstElement\.focus\(\)/)
  assert.match(source, /previousFocus\.focus\(\)/)
})

test('mobile sidebar keeps Escape, traps focus in the drawer, and restores the visible invoking control', () => {
  const source = read('components/layout/useAccessibleSidebar.ts')
  const home = read('components/HomeClient.tsx')
  assert.match(source, /event\.key === 'Escape'/)
  assert.match(source, /event\.key !== 'Tab'/)
  assert.match(source, /panel\.contains\(activeElement\)/)
  assert.match(source, /focusOutsidePanel/)
  assert.match(source, /lastElement\.focus\(\)/)
  assert.match(source, /firstElement\.focus\(\)/)
  assert.match(source, /requestedTriggerRef/)
  assert.match(source, /restoreTarget\?\.focus\(\)/)
  assert.match(source, /getClientRects\(\)\.length === 0/)
  assert.match(home, /mobileSidebar\.open\(event\.currentTarget\)/)
})

test('patient safety incident fields expose labels and required-field validation', () => {
  const source = read('components/PatientSafetyWorkspace.tsx')
  assert.match(source, /htmlFor=\{\x60incident-field-\$\{field\.code\}\x60\}/)
  assert.match(source, /aria-labelledby=\{\x60incident-field-\$\{field\.code\}-label\x60\}/)
  assert.match(source, /aria-invalid=\{fieldInvalid \|\| undefined\}/)
  assert.match(source, /aria-describedby=\{fieldDescribedBy\}/)
  assert.match(source, /id=\{fieldErrorId\}/)
})

test('core administration search and row controls have accessible names', () => {
  const source = read('components/GeneralSettings.tsx')
  assert.match(source, /aria-label="Cari unit kerja"/)
  assert.match(source, /aria-label="Cari pengguna berdasarkan nama, username, email, atau unit"/)
  assert.match(source, /aria-label=\{\x60Unit utama untuk/)
  assert.match(source, /aria-label=\{\x60Role untuk/)
})

test('settings errors are announced as alerts while success stays polite', () => {
  const source = read('components/GeneralSettings.tsx')
  assert.match(source, /role=\{msgIsError \? 'alert' : 'status'\}/)
  assert.match(source, /aria-live=\{msgIsError \? 'assertive' : 'polite'\}/)
  assert.match(source, /role=\{pwMsg\.ok \? 'status' : 'alert'\}/)
})

test('quality metadata messages distinguish errors from successful updates', () => {
  const source = read('components/QualitySettings.tsx')
  assert.match(source, /role=\{\/gagal\|belum\|tidak ditemukan\|wajib\|sudah aktif\/i\.test\(msg\) \? 'alert' : 'status'\}/)
  assert.match(source, /aria-live=\{\/gagal\|belum\|tidak ditemukan\|wajib\|sudah aktif\/i\.test\(msg\) \? 'assertive' : 'polite'\}/)
})

test('key workspace dialogs declare an accessible role and focus controller', () => {
  const staff = read('components/StaffDirectoryWorkspace.tsx')
  const oppe = read('components/OppeAuditWorkspace.tsx')
  const risk = read('components/RiskManagementWorkspace.tsx')
  const safety = read('components/PatientSafetyWorkspace.tsx')
  assert.match(staff, /ref=\{editDialogRef\}[^>]*role="dialog"/)
  assert.match(oppe, /ref=\{ruleDialogRef\}[^>]*role="dialog"/)
  assert.match(risk, /ref=\{modalRef\}[^>]*role="dialog"/)
  assert.match(safety, /ref=\{dialogRef\}[^>]*role="dialog"/)
})
