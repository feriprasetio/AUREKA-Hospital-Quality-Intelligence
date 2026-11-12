import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
const landing = source('../components/PublicLandingPage.tsx')
const home = source('../components/HomeClient.tsx')
const css = source('../app/aureka-refined.css')

test('module discovery filters real module metadata and offers an empty-state reset', () => {
  assert.match(landing, /modules\.filter/)
  assert.match(landing, /module\.title.*module\.description.*module\.tags/)
  assert.match(landing, /visibleModules\.map/)
  assert.match(landing, /type="search" value=\{moduleQuery\}/)
  assert.match(landing, /visibleModules\.length === 0/)
  assert.match(landing, /setModuleQuery\(''\)/)
  assert.match(landing, /aria-live="polite"/)
})

test('the refined theme reaches every operational module without recoloring clinical bands', () => {
  for (const selector of ['.ovPanel', '.aqBtn', '.psPanel', '.rmPanel', '.cpPanel', '.oppePanel', '.fppePanel', '.acdPanel', '.sdPanel', '.stPanel', '.mswPanel', '.qraPanel']) {
    assert.ok(css.includes(selector), `Missing shared module styling: ${selector}`)
  }
  assert.doesNotMatch(css, /data-band|--aureka-risk-|\.lvl-(very|high|low|moderate)/)
  assert.match(css, /overflow-x: auto/)
  assert.match(css, /:focus-visible/)
  assert.match(css, /prefers-reduced-motion/)
  assert.match(css, /@media \(max-width: 640px\)/)
})

test('workspace header stays compact while retaining the actual navigation and data controls', () => {
  assert.match(home, /workspacePageIntro/)
  assert.doesNotMatch(home, /Gambaran yang jelas|Pencatatan, pemeriksaan, dan evaluasi mutu pelayanan/)
  for (const control of ['selectSidebarChild', 'triggerWorkspaceExport', 'dispatchWorkspaceSearch', 'saveFirstPassword', 'resendVerify', 'sendReset']) {
    assert.ok(home.includes(control), `Missing workflow: ${control}`)
  }
})

test('assets and account return URLs follow the configured deployment base path', () => {
  assert.match(source('../next.config.mjs'), /NEXT_PUBLIC_BASE_PATH: basePath/)
  assert.match(home, /const LOGO=`\$\{BASE_PATH\}\/logo-aureka-v2\.png`/)
  assert.doesNotMatch(home, /logo-aureka\.jpg/)
  assert.doesNotMatch(home, /\$\{window\.location\.origin\}\/AUREKA-Hospital-Quality-Intelligence\//)
  assert.match(source('../components/FppeEvaluationWorkspace.tsx'), /NEXT_PUBLIC_BASE_PATH/)
})

test('disabled preview backend remains authentication-gated without technical UI notices', () => {
  assert.match(home, /PREVIEW_ONLY=process\.env\.NEXT_PUBLIC_SUPABASE_URL==='https:\/\/preview-disabled\.invalid'/)
  assert.doesNotMatch(home, /authPreviewNotice|Koneksi Supabase dinonaktifkan/)
  assert.match(home, /signInWithPassword/)
  assert.doesNotMatch(home, /if\(PREVIEW_ONLY\).*setView\('workspace'\)/)
})
