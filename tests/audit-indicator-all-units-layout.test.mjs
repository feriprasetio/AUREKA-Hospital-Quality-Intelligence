import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Every registered room uses the same Audit Indikator Mutu workspace', () => {
  const home = read('components/HomeClient.tsx')
  const workspace = read('components/QualityIndicatorWorkspace.tsx')
  assert.match(home, /<QualityIndicatorWorkspace[\s\S]*?rooms=\{roomsList\}/)
  assert.match(workspace, /rooms\.map\(r=><option key=\{r\.id\} value=\{r\.id\}>\{r\.name\}<\/option>\)/)
  assert.match(workspace, /setRoomId\(next\)/)
  assert.match(workspace, /return <div className="aq aqAuditWorkspace">/)
  assert.match(workspace, /createPortal\([\s\S]*?className="aq aqPortal aqAuditWorkspace"/)
})

test('Late global styles enforce the balanced table, modal, and compact sidebar across unit workspaces', () => {
  const css = read('app/globals.css')
  assert.match(css, /AUREKA Audit Indikator Mutu — shared presentation contract for every registered unit/)
  assert.match(css, /\.moduleEnter>\.aq\.aqAuditWorkspace>\.aqFilters \.aqGrid\{[\s\S]*grid-template-columns:minmax\(220px,1\.4fr\)/)
  assert.match(css, /\.moduleEnter>\.aq\.aqAuditWorkspace table\.aqData\{[\s\S]*min-width:1050px!important/)
  assert.match(css, /\.aq\.aqPortal\.aqAuditWorkspace \.aqEditorDialog\{[\s\S]*width:min\(1120px/)
  assert.match(css, /\.workspaceRoot \.sidebar \.sidebarNavGroup>button,[\s\S]*min-height:34px!important/)
  assert.match(css, /@media\(max-width:760px\)[\s\S]*\.aq\.aqPortal\.aqAuditWorkspace \.aqEditorDialog/)
})

test('The all-unit presentation change does not alter indicator calculation or persistence implementations', () => {
  const workspace = read('components/QualityIndicatorWorkspace.tsx')
  const results = read('components/QualityResultsWorkspace.tsx')
  const engine = read('lib/aureka/quality-results-engine.ts')
  assert.match(workspace, /const save=async\(\)=>/)
  assert.match(workspace, /reviewRecord\(/)
  assert.match(workspace, /openImportDialog\(/)
  assert.match(results, /calculateIndicatorResultsForProfiles\(/)
  assert.match(engine, /export function calculateIndicatorResult\(/)
  assert.match(results, /aggregateClinicalPathwayRows\(/)
})
