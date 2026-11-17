import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8')

test('Infographics is a standalone Analytics workspace, not a Beranda tab', () => {
  const home = read('components/HomeClient.tsx')
  const landing = read('components/HomeLandingWorkspace.tsx')
  const registry = read('lib/aureka/module-registry.ts')
  assert.ok(registry.includes("id:'insights', label:'Analitik & Infografis'"))
  assert.ok(registry.includes("id:'analytics', label:'Program & RTL'"))
  assert.ok(home.includes("active==='insights'?<InfographicsDashboard mode=\"full\""))
  assert.doesNotMatch(home, /homeTab|setHomeTab/)
  assert.doesNotMatch(landing, /InfographicsDashboard|initialTab|onTabChange/)
  assert.ok(home.includes('beranda/infografis'))
  assert.ok(home.includes("'infografis':'insights'") || home.includes("'infografis':'insights'"))
  assert.ok(home.includes('pasien/statistik'))
})

test('Program and Workforce have independent active navigation and workspace renderers', () => {
  const home = read('components/HomeClient.tsx')
  assert.match(home, /setActive\(id\)/)
  assert.match(home, /setActive\(moduleId\)/)
  assert.match(home, /if\(id==='staff'\)return active==='staff'/)
  assert.match(home, /if\(id==='analytics'\)return active==='analytics'/)
  assert.ok(home.includes("active==='analytics'&&analyticsTab==='programs'?<AnnualProgramWorkspace"))
  assert.ok(home.includes("active==='staff'&&analyticsTab==='pic-performance'?<PicPerformanceWorkspace"))
  assert.ok(home.includes("active==='staff'?<MetadataStatisticsWorkspace"))
})

test('shared metric contracts preserve unavailable states and reuse secured sources', () => {
  const metrics = read('lib/aureka/metric-contracts.ts')
  const kpis = read('components/HomeKpis.tsx')
  const dashboard = read('components/governance/InfographicsDashboard.tsx')
  for (const fn of ['readAurekaPortfolioSummary','readAurekaQualityRoomReportingStatus','readAurekaOverdueIncidents','readAurekaProgramList']) {
    assert.ok(metrics.includes(fn), 'Missing shared contract ' + fn)
  }
  assert.match(metrics, /status: 'complete' \| 'unavailable'/)
  assert.match(metrics, /data: null/)
  assert.match(metrics, /aureka_gov_infographics_summary_secure/)
  assert.match(metrics, /aureka_quality_room_reporting_status/)
  assert.match(kpis, /dataStatus/)
  assert.match(kpis, /Nilai yang tidak tersedia ditampilkan sebagai - dan tidak dianggap nol/)
  assert.match(dashboard, /readAurekaPortfolioSummary/)
  assert.match(dashboard, /Analisis dengan NARA/)
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
