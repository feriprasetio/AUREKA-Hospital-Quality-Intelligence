import { readWorkspaceHash } from '../lib/aureka/workspace-route.ts'
import { readAurekaPortfolioSummary } from '../lib/aureka/metric-contracts.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Dashboard combines the operational landing, Visual Intelligence and NARA AI without extra sidebar trees', () => {
  const home = read('components/HomeClient.tsx')
  const landing = read('components/HomeLandingWorkspace.tsx')
  const registry = read('lib/aureka/module-registry.ts')
  const navStart = registry.indexOf('export const AUREKA_NAVIGATION_GROUPS')
  const navEnd = registry.indexOf('] as const', navStart)
  const nav = registry.slice(navStart, navEnd)
  assert.ok(registry.includes("id:'insights', label:'Analitik Rumah Sakit', group:'command_center'"))
  assert.ok(registry.includes("routeHash:'#beranda'"))
  assert.ok(home.includes("active==='home'?<>"))
  assert.ok(home.includes('<HomeLandingWorkspace'))
  assert.ok(home.includes('<InfographicsDashboard mode="full"'))
  assert.match(home, /\.filter\(\(\{id\}\)=>id!=='nara'&&id!=='insights'\)/)
  const dashboardStart = nav.indexOf("{ id:'command_center'")
  const patientStart = nav.indexOf("{ id:'patient_registry'", dashboardStart)
  const dashboard = nav.slice(dashboardStart, patientStart)
  assert.match(dashboard, /id:'dashboard', label:'Dashboard', moduleId:'home'/)
  assert.doesNotMatch(dashboard, /nara_ai|cross_domain_analytics|insights/)
  assert.ok(landing.includes('onAskNara'))
  assert.ok(landing.includes('NARA'))
  assert.equal(readWorkspaceHash("#analitik-laporan").module, "home")
  assert.doesNotMatch(home, /homeTab|setHomeTab/)
})

test('Annual Program appears under Sekretariat and workforce remains independent', () => {
  const home = read('components/HomeClient.tsx')
  assert.match(home, /active==='analytics'&&programTab!=='recommendations'\?'secretariat':active/)
  assert.match(home, /<AnnualProgramWorkspace/)
  assert.match(home, /active==='staff'\?<MetadataStatisticsWorkspace/)
  assert.match(home, /qualityMonitorTab==='pic'&&permissionFlags.readPicPerformance\?<PicPerformanceWorkspace/)
  assert.match(home, /\[staffTab,setStaffTab\]=useState/)
  assert.match(home, /\[programTab,setProgramTab\]=useState/)
})

test('shared metric contracts preserve unavailable states and reuse secured sources', () => {
  const metrics = read('lib/aureka/metric-contracts.ts')
  const kpis = read('components/HomeKpis.tsx')
  const dashboard = read('components/governance/InfographicsDashboard.tsx')
  for (const fn of ['readAurekaPortfolioSummary','readAurekaQualityRoomReportingStatus','readAurekaOverdueIncidents','readAurekaProgramList']) {
    assert.ok(metrics.includes(fn), 'Missing shared contract ' + fn)
  }
  assert.match(metrics, /type MetricReadStatus = 'complete' \| 'unavailable'/)
  assert.match(metrics, /data: null/)
  assert.match(metrics, /aureka_gov_infographics_summary_secure/)
  assert.match(metrics, /aureka_quality_room_reporting_status/)
  assert.match(kpis, /dataStatus/)
  assert.match(kpis, /done\?'-'/)
  assert.match(kpis, /<time dateTime=\{t.retrievedAt\}/)
  assert.match(dashboard, /readAurekaPortfolioSummary/)
  assert.match(dashboard, /Analisis dengan NARA/)
})

test('a missing portfolio section becomes unavailable before reaching Dashboard charts', async () => {
  const readSummary = data => readAurekaPortfolioSummary({ rpc: async () => ({ data, error: null }) }, 2026, null)
  const complete = { quality: {}, clinical: {}, incidents: {}, risk: {}, program: {} }
  assert.equal((await readSummary(complete)).status, 'complete')
  for (const payload of [[], { ...complete, quality: null }, { ...complete, risk: [] }]) {
    const result = await readSummary(payload)
    assert.equal(result.status, 'unavailable')
    assert.equal(result.data, null)
  }
})

test('NARA accepts contextual handoff and exposes response provenance', () => {
  const home = read('components/HomeClient.tsx')
  const workspace = read('components/NaraAIWorkspace.tsx')
  const chat = read('components/TanyaAureka.tsx')
  const edge = read('supabase/functions/aureka-tanya/index.ts')
  assert.match(home, /openNaraWithContext/)
  assert.match(home, /initialPrompt=\{naraPendingPrompt\|\|undefined\}/)
  assert.match(workspace, /initialPrompt\?: string/)
  assert.match(workspace, /onInitialPromptConsumed/)
  assert.match(chat, /historyReady/) 
  assert.match(chat, /type NaraIntelligence/)
  assert.match(chat, /naraEvidenceMeta/)
  assert.match(edge, /snapshot_status:/)
  assert.match(edge, /generated_at:/)
})

test('Home and reminder handoffs retain global role scope and explicit send confirmation', () => {
  const home = read('components/HomeClient.tsx')
  const landing = read('components/HomeLandingWorkspace.tsx')
  const chat = read('components/TanyaAureka.tsx')
  assert.match(home, /role==='DEWAN_PENGAWAS'\|\|\(manager&&!admin\)\?null/)
  assert.match(landing, /isAdmin\|\|manager/)
  assert.match(chat, /Konfirmasi pengiriman pengingat/)
  assert.match(chat, /await aurekaConfirm/)
})
