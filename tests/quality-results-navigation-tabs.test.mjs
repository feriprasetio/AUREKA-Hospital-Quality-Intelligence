import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { readWorkspaceHash } from '../lib/aureka/workspace-route.ts'

const source = readFileSync(new URL('../components/HomeClient.tsx', import.meta.url), 'utf8')
const reconciliation = readFileSync(new URL('../components/QualityReconciliationWorkspace.tsx', import.meta.url), 'utf8')

test('results share one primary navigation with two nested tabs and preserve deep links', () => {
  const nav = source.slice(source.indexOf('const sidebarChildGroups'), source.indexOf('const currentContainer'))
  assert.match(nav, /\{id:'quality-results',label:'Hasil Capaian dan Analitik',children:\[/)
  assert.match(nav, /\{id:'result-unit',label:'Per Unit'\}/)
  assert.match(nav, /\{id:'result-category',label:'Per Kategori'\}/)
  assert.equal((nav.match(/id:'quality-results'/g) ?? []).length, 1)
  assert.deepEqual(readWorkspaceHash('#indikator-mutu/hasil-capaian/unit-keseluruhan'),{module:'quality',section:'result-unit'})
  assert.deepEqual(readWorkspaceHash('#indikator-mutu/hasil-capaian/kategori-indikator'),{module:'quality',section:'result-category'})
  assert.match(source,/group\?\.children\?\.\[0\]\?\.id\|\|id/)
})
test('validation and reconciliation retains its protected route and source audit controls', () => {
  assert.match(source, /section==='quality-reconciliation'&&!admin&&role!=='PMKP'/)
  assert.match(source, /label:'Validasi dan Rekonsiliasi'/)
  assert.deepEqual(readWorkspaceHash('#indikator-mutu/rekonsiliasi'), {module:'quality',section:'quality-reconciliation'})
  assert.match(reconciliation, /<h2>Validasi dan Rekonsiliasi<\/h2>/)
  assert.match(reconciliation,/quality_reconciliation_apply_bulk/)
  assert.match(reconciliation,/quality_reconciliation_review_warning/)
  assert.match(reconciliation,/Riwayat rekonsiliasi/)
})
test('logbook does not render redundant results and result filter changes do not remount the results screen', () => {
  const start=source.indexOf(":active==='quality'&&qualityOpen?<QualityIndicatorWorkspace")
  const end=source.indexOf(":active==='quality'?<InfographicsDashboard",start)
  assert.ok(start>=0&&end>start)
  assert.doesNotMatch(source.slice(start,end), /QualityResultsWorkspace/)
  assert.match(source, /key=\{qualityResultsView\+'-'\+String\(activeWorkspaceRoomId\?\?'profile'\)\}/)
  assert.doesNotMatch(source, /key=\{qualityResultsView\+'-'\+qualityResultsGroup/)
})
