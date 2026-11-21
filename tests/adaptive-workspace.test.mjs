import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import {
  AUREKA_ADAPTIVE_LAYOUTS,
  normalizeWorkspaceDensity,
  parseWorkspacePreference,
  resolveAdaptiveWorkspace,
  workspacePreferenceStorageKey,
} from '../lib/aureka/adaptive-workspace.ts'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('adaptive engine registers ten reusable layout archetypes', () => {
  assert.equal(AUREKA_ADAPTIVE_LAYOUTS.length, 10)
  assert.equal(new Set(AUREKA_ADAPTIVE_LAYOUTS.map((item) => item.id)).size, 10)
})

test('workplace resolver selects a layout from module and current operational page', () => {
  const cases = [
    ['home', 'Beranda', 'bento-grid'],
    ['nara', 'NARA AI', 'chat-artifact'],
    ['patients', 'Direktori Pasien', 'three-pane'],
    ['patients', 'Pola Perawatan', 'analytical'],
    ['clinical', 'Audit Realcost', 'analytical'],
    ['clinical', 'Audit Clinical Pathway', 'clinical-case'],
    ['quality', 'Form Logbook', 'three-pane'],
    ['quality', 'Monitoring Pelaporan Indikator Mutu', 'analytical'],
    ['quality', 'Standar Prosedur Operasional', 'document-intelligence'],
    ['secretariat', 'Kirim Undangan', 'workflow-kanban'],
    ['analytics', 'Program Kerja Tahunan', 'timeline-gantt'],
    ['safety', 'Budaya · Form Survei Tahunan', 'analytical'],
    ['safety', 'Insiden · Investigasi', 'clinical-case'],
    ['risk', 'Register Risiko · Daftar Risiko', 'risk-intelligence'],
    ['risk', 'FMEA · Analisis', 'workflow-kanban'],
    ['risk', 'FMEA · Mitigasi & RTP', 'timeline-gantt'],
    ['staff', 'Tenaga Kerja', 'three-pane'],
    ['staff', 'OPPE', 'clinical-case'],
    ['staff', 'Orientasi Mahasiswa', 'workflow-kanban'],
    ['settings', 'Legal dan Asset', 'document-intelligence'],
    ['settings', 'Audit Log', 'analytical'],
  ]
  for (const [moduleId, label, expected] of cases) {
    assert.equal(resolveAdaptiveWorkspace(moduleId, label).layout.id, expected, moduleId + ' / ' + label)
  }
})

test('workspace identifiers are stable and distinct by module and page', () => {
  const directory = resolveAdaptiveWorkspace('patients', 'Direktori Pasien')
  const patterns = resolveAdaptiveWorkspace('patients', 'Pola Perawatan')
  assert.notEqual(directory.workspaceId, patterns.workspaceId)
  assert.equal(directory.workspaceId, 'patients-direktori-pasien')
  assert.notEqual(
    workspacePreferenceStorageKey(directory.workspaceId),
    workspacePreferenceStorageKey(patterns.workspaceId),
  )
})

test('presentation density and persisted preference are normalized safely', () => {
  assert.equal(normalizeWorkspaceDensity('compact'), 'compact')
  assert.equal(normalizeWorkspaceDensity('spacious'), 'spacious')
  assert.equal(normalizeWorkspaceDensity('wide'), 'comfortable')
  assert.deepEqual(parseWorkspacePreference(null), { version: 1, density: 'comfortable' })
  assert.deepEqual(parseWorkspacePreference('{"version":1,"density":"compact"}'), { version: 1, density: 'compact' })
  assert.deepEqual(parseWorkspacePreference('{broken'), { version: 1, density: 'comfortable' })
  assert.deepEqual(parseWorkspacePreference('{"version":2,"density":"compact"}'), { version: 1, density: 'comfortable' })
})

test('adaptive shell is presentation-only and wraps existing module error handling', () => {
  const shell = read('components/workspace/AdaptiveWorkspaceShell.tsx')
  const home = read('components/HomeClient.tsx')
  const css = read('app/workspace-desk.css')
  assert.match(shell, /readAppearancePreferences\(\)\.density/)
  assert.match(shell, /APPEARANCE_EVENT/)
  assert.match(shell, /data-adaptive-density=\{density\}/)
  assert.doesNotMatch(shell, /workspaceDensityToggle|aria-pressed=\{density === 'compact'\}|createPortal/)
  assert.doesNotMatch(shell, /adaptiveWorkspaceHeader|adaptiveWorkspaceIntro|workspacePurpose/)
  assert.doesNotMatch(shell, /supabase|service_role|NEXT_PUBLIC_.*KEY/i)
  assert.match(home, /<AdaptiveWorkspaceShell/)
  assert.match(home, /<ModuleErrorBoundary/)
  assert.match(home, /id="workspace-main-content"/)
  assert.match(css, /\.adaptiveWorkspaceShell/)
  assert.match(css, /@media \(max-width: 720px\)/)
  assert.match(css, /prefers-reduced-motion/)
})
