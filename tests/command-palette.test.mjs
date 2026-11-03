import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Command Palette is a labelled modal with an accessible visual trigger', () => {
  const source = read('components/CommandPalette.tsx')
  assert.match(source, /aria-haspopup="dialog"/)
  assert.match(source, /aria-expanded=\{open\}/)
  assert.match(source, /min-height: 44px;/)
  assert.match(source, /width: 44px; min-width: 44px; min-height: 44px;/)
  assert.match(source, /aria-controls="aureka-command-dialog"/)
  assert.match(source, /role="dialog"/)
  assert.match(source, /aria-modal="true"/)
  assert.match(source, /aria-labelledby="aureka-command-title"/)
  assert.match(source, /data-dialog-autofocus/)
  assert.match(source, /useAccessibleDialog<HTMLDivElement>/)
})

test('Command Palette supports Ctrl+K and Command+K with arrow and Enter navigation', () => {
  const source = read('components/CommandPalette.tsx')
  assert.match(source, /event\.ctrlKey \|\| event\.metaKey/)
  assert.match(source, /event\.key\.toLowerCase\(\) === 'k'/)
  assert.match(source, /event\.key === 'ArrowDown'/)
  assert.match(source, /event\.key === 'ArrowUp'/)
  assert.match(source, /event\.key === 'Enter'/)
  assert.match(source, /aria-activedescendant/)
})

test('Command Palette uses the shared dialog focus trap and Escape close behavior', () => {
  const palette = read('components/CommandPalette.tsx')
  const dialog = read('components/layout/useAccessibleDialog.ts')
  assert.match(palette, /onClose: \(\) => setOpen\(false\)/)
  assert.match(dialog, /event\.key === 'Escape'/)
  assert.match(dialog, /event\.key !== 'Tab'/)
  assert.match(dialog, /previousFocus\?\.isConnected/)
  assert.match(dialog, /lastElement\.focus\(\)/)
  assert.match(dialog, /firstElement\.focus\(\)/)
})

test('Command navigation is generated only from role-filtered modules and available sidebar children', () => {
  const source = read('components/HomeClient.tsx')
  assert.match(source, /const visibleMods=useMemo\(\(\)=>AUREKA_PRIMARY_NAV\.filter\(\(\{requiredRoles\}\)=>requiredRoles\.includes/)
  assert.match(source, /const commandItems=useMemo<CommandPaletteItem\[\]>\(\(\)=>/)
  assert.match(source, /for\(const \[moduleId,moduleLabel\] of visibleMods\)/)
  assert.match(source, /const children=sidebarChildGroups\[moduleId\]/)
  assert.match(source, /onSelect:\(\)=>selectSidebarChild\(moduleId,child\.id\)/)
})

test('Data search is limited to visible record-like content in the active workspace', () => {
  const source = read('components/HomeClient.tsx')
  assert.match(source, /\.moduleEnter\[data-workspace-container\]/)
  assert.match(source, /table tbody tr:not\(\.aqInlineEditorRow\)/)
  assert.match(source, /node\.closest\('\[aria-hidden="true"\]'\)/)
  assert.match(source, /style\.display==='none'\|\|style\.visibility==='hidden'/)
  assert.match(source, /searchResultsQuery!==globalSearch\.trim\(\)/)
  assert.match(source, /Data di Modul Aktif/)
  assert.match(source, /onSearchChange=\{dispatchWorkspaceSearch\}/)
})

test('Quick export reuses an available visible workspace button and unit action never changes account assignment', () => {
  const source = read('components/HomeClient.tsx')
  assert.match(source, /const triggerWorkspaceExport=\(\)=>/)
  assert.match(source, /root\?\.querySelectorAll<HTMLButtonElement>\('button:\not\(\[disabled\]\)'\)/)
  assert.match(source, /target\.click\(\)/)
  assert.match(source, /window\.getComputedStyle\(button\)/)
  assert.match(source, /const focusWorkspaceUnitSelector=\(\)=>/)
  assert.match(source, /window\.getComputedStyle\(select\)/)
  assert.match(source, /querySelectorAll<HTMLSelectElement>\('select:\not\(\[disabled\]\)'\)/)
  assert.match(source, /target\.focus\(\)/)
  assert.match(source, /Unit utama akun dan hak akses tidak diubah/)
})
