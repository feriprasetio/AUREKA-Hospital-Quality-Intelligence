/**
 * Isolated UI regression check against the existing dev server.
 * Requires Node 22 and a headless Chromium CDP endpoint (default :9222).
 * Every Supabase request is intercepted; these fixtures never reach a backend.
 * This is NOT an authentication, RLS, RPC, or production-data acceptance test.
 */
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'

const appUrl = process.env.AUREKA_UI_URL || 'http://localhost:3000/'
const cdpUrl = process.env.AUREKA_CDP_URL || 'http://localhost:9222'
const artifacts = process.env.AUREKA_UI_ARTIFACTS || '/tmp/aureka-workspace-ui'
mkdirSync(artifacts, { recursive: true })
const pages = await (await fetch(cdpUrl + '/json')).json()
const page = pages.find(item => item.type === 'page')
assert.ok(page, 'A Chromium page must be available through CDP')
const socket = new WebSocket(page.webSocketDebuggerUrl)
await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
let sequence = 0
const pending = new Map()
const exceptions = []
const requests = []
const checks = []
const measurements = []
const interceptions = new Set()
let stopping = false
let stopRequests
const requestsStopped = new Promise(resolve => { stopRequests = resolve })
const isCancelledInterception = error => stopping && /Fetch domain is not enabled|Invalid InterceptionId|Invalid interceptionId|Invalid request id|No resource with given identifier|Target closed|Session closed/.test(error.message)
let testRole = 'ADMIN'
let failQualityReads = false
let failQualitySave = false
let failFppeWrites = false
let fppeWriteGate = null
let fppeRecords = []
let pathwayTemplates = []
const testWidths = process.env.AUREKA_UI_WIDTHS?.split(',').map(Number) || [1440, 1366, 1024, 768, 390, 375, 320]
assert.ok(testWidths.length && testWidths.every(width => Number.isInteger(width) && width >= 320 && width <= 2560), 'UI widths must be integers from 320 to 2560')
const uid = '11111111-1111-4111-8111-111111111111'
const user = {
  id: uid, aud: 'authenticated', role: 'authenticated', email: 'workspace-ui@example.invalid',
  app_metadata: { provider: 'email', providers: ['email'] },
  user_metadata: { full_name: 'Pengguna Uji Antarmuka' }, created_at: '2026-01-01T00:00:00Z',
}
const token = [
  { alg: 'HS256', typ: 'JWT' },
  { sub: uid, exp: Math.floor(Date.now() / 1000) + 86400, aud: 'authenticated', role: 'authenticated' },
].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.') + '.isolated-ui-test'
const rooms = [
  { id: 1, name: 'Informasi dan Pengaduan', code: 'INFO', is_active: true },
  { id: 5, name: 'Instalasi Farmasi', code: 'FARM', is_active: true },
  { id: 11, name: 'Instalasi Rawat Jalan', code: 'RAJAL', is_active: true },
]
const profiles = ['Respon Komplain', 'Mengerti Informasi'].map((title, index) => ({
  id: `20000000-0000-4000-8000-00000000000${index + 1}`,
  code: `1.${index + 1}`, title, room_id: 1, profile_year: 2026,
  status: 'published', is_active: true, measurement_grain: 'event',
  schema_json: { measurement_type: 'compliance', header_label: title },
  options_json: [{ label: 'Sesuai', code: 1 }, { label: 'Tidak sesuai', code: 2 }],
  target_text: '≥ 75%',
}))
let qualityRecords = Array.from({ length: 14 }, (_, index) => ({
  id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  room_id: 1, profile_year: 2026, measurement_grain: 'event', status: 'ready', entered_by: uid,
  record_date: `2026-10-${String(index + 1).padStart(2, '0')}`,
  created_at: '2026-10-15T00:00:00Z', updated_at: '2026-10-16T00:00:00Z',
  core_data: {
    patient_name: `Catatan Uji ${String(index + 1).padStart(2, '0')}`,
    medical_record_no: `UI-${String(index + 1).padStart(4, '0')}`,
    unit_name: rooms[0].name, admission_at: `2026-10-${String(index + 1).padStart(2, '0')}T08:00`,
    form_fields: {
      'Nama Pasien': `Catatan Uji ${String(index + 1).padStart(2, '0')}`,
      'No. Rekam Medis': `UI-${String(index + 1).padStart(4, '0')}`,
      'Unit Pelayanan': 'Unit Uji', 'Level Masalah': 'Ringan',
      'Tanggal Aduan': `2026-10-${String(index + 1).padStart(2, '0')}T08:00`,
      'Tanggal Tindak Lanjut': `2026-10-${String(index + 1).padStart(2, '0')}T09:00`,
      'Kronologis Ringkas': 'Data sintetis untuk pengujian antarmuka, bukan rekam pasien.',
    },
    indicator_values: { '1.1': { answer: 'Sesuai', code: 1 }, '1.2': { answer: 'Sesuai', code: 1 } },
  },
}))
const risks = Array.from({ length: 19 }, (_, index) => ({
  id: `40000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
  risk_code: `UI-RISK-${index + 1}`, risk_event: `Risiko sintetis ${index + 1}`,
  unit_id: 1, unit_name: rooms[0].name, likelihood: 1, impact: 1, risk_score: 1,
  risk_level: 'Sangat Rendah', category: 'Operasional', status: 'Open',
  causes: 'Skenario uji antarmuka', created_at: '2026-10-01T00:00:00Z', created_by: uid,
}))
const incidents = [{
  id: '50000000-0000-4000-8000-000000000001', incident_code: 'UI-IKP-001',
  incident_date: '2026-10-15', incident_time: '08:00', unit_name: rooms[0].name,
  incident_type: 'KNC', summary: 'Insiden sintetis untuk pengujian antarmuka', status: 'draft',
  form_data: {}, created_at: '2026-10-15T00:00:00Z',
}]
const staff = [{
  id: '60000000-0000-4000-8000-000000000001', employee_code: 'UI-STAF-001',
  display_name: 'Tenaga Uji Antarmuka', profession_group: 'Dokter', position_title: 'Dokter Umum',
  directory_status: 'available', verification_status: 'verified', is_active: true,
}]

const send = (method, params = {}) => new Promise((resolve, reject) => {
  const id = ++sequence
  pending.set(id, { resolve, reject })
  socket.send(JSON.stringify({ id, method, params }))
})
const fulfill = (requestId, data, code = 200, extra = []) => send('Fetch.fulfillRequest', {
  requestId, responseCode: code,
  responseHeaders: [
    { name: 'Content-Type', value: 'application/json' },
    { name: 'Access-Control-Allow-Origin', value: '*' },
    { name: 'Access-Control-Allow-Headers', value: '*' },
    { name: 'Access-Control-Allow-Methods', value: 'GET,POST,PATCH,DELETE,HEAD,OPTIONS' },
    ...extra,
  ],
  body: Buffer.from(JSON.stringify(data)).toString('base64'),
})

const handlePausedRequest = async ({ request, requestId }) => {
  const url = new URL(request.url)
  if (url.origin === new URL(appUrl).origin) {
    await send('Fetch.continueRequest', { requestId })
    return
  }
  if (!/^\/(auth|rest|storage)\/v1(?:\/|$)/.test(url.pathname)) {
    await send('Fetch.failRequest', { requestId, errorReason: 'BlockedByClient' })
    return
  }
  const resource = url.pathname.split('/').at(-1)
  const body = request.postData ? JSON.parse(request.postData) : {}
  requests.push({ resource, method: request.method, role: testRole })
  try {
    if (request.method === 'OPTIONS') return await fulfill(requestId, {})
    if (url.pathname.includes('/auth/v1/token')) return await fulfill(requestId, { access_token: token, token_type: 'bearer', expires_in: 86400, refresh_token: 'isolated-ui-test', user })
    if (url.pathname.includes('/auth/v1/user')) return await fulfill(requestId, user)
    if (resource === 'aureka_get_my_profile') return await fulfill(requestId, [{
      user_id: uid, full_name: user.user_metadata.full_name, email: user.email, username: 'workspace.ui',
      primary_room_id: 1, role_id: testRole.toLowerCase(), role_code: testRole,
      is_active: true, must_change_password: false,
    }])
    if (resource === 'aureka_get_my_account') return await fulfill(requestId, [{ username: 'workspace.ui', email: user.email }])
    if (resource === 'save_quality_logbook') {
      if (failQualitySave) return await fulfill(requestId, { message: 'Penyimpanan ditolak pada skenario uji', code: '42501' }, 403)
      const id = body.p_record_id || '30000000-0000-4000-8000-999999999999'
      qualityRecords = [{ id, ...body.p_payload, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, ...qualityRecords.filter(row => row.id !== id)]
      return await fulfill(requestId, id)
    }
    if (resource === 'archive_quality_logbook') {
      qualityRecords = qualityRecords.filter(row => row.id !== body.p_record_id)
      return await fulfill(requestId, true)
    }
    if (resource === 'oppe_fppe_evaluations' && ['POST', 'PATCH'].includes(request.method)) {
      if (failFppeWrites) return await fulfill(requestId, { message: 'Penyimpanan FPPE ditolak pada uji antarmuka', code: '42501' }, 403)
      if (fppeWriteGate) {
        const gate = fppeWriteGate
        fppeWriteGate = null
        gate.started()
        await Promise.race([gate.wait, requestsStopped])
        if (stopping) return
      }
      const id = request.method === 'POST' ? '70000000-0000-4000-8000-000000000001' : url.searchParams.get('id')?.replace(/^eq\./, '')
      const row = { ...fppeRecords.find(record => record.id === id), id, ...body, updated_at: new Date().toISOString() }
      fppeRecords = [row, ...fppeRecords.filter(record => record.id !== id)]
      return await fulfill(requestId, request.method === 'POST' ? row : null)
    }
    if (resource === 'clinical_pathway_templates' && request.method === 'POST') {
      for (const row of Array.isArray(body) ? body : [body]) {
        pathwayTemplates = [...pathwayTemplates.filter(template => template.code !== row.code), { id: `80000000-0000-4000-8000-${String(pathwayTemplates.length + 1).padStart(12, '0')}`, ...row }]
      }
      return await fulfill(requestId, null)
    }
    if (failQualityReads && resource === 'indicator_profiles') return await fulfill(requestId, { message: 'Sumber data sengaja tidak tersedia pada uji antarmuka', code: 'PGRST000' }, 503)
    const sources = {
      master_rooms: rooms, indicator_profiles: profiles, quality_records: qualityRecords,
      risk_register: risks, incidents, staff_directory: staff, oppe_fppe_evaluations: fppeRecords,
      clinical_pathway_templates: pathwayTemplates,
      staff_team_assignments: [{ staff_id: staff[0].id, room_id: 1, assignment_status: 'active', is_locked: true }],
    }
    let rows = sources[resource] || []
    for (const [key, value] of url.searchParams) {
      if (value.startsWith('eq.') && rows.some(row => key in row)) rows = rows.filter(row => String(row[key]) === value.slice(3))
    }
    const total = rows.length
    const offset = Number(url.searchParams.get('offset') || 0)
    const limit = Number(url.searchParams.get('limit') || rows.length || 1)
    rows = rows.slice(offset, offset + limit)
    const accept = Object.entries(request.headers).find(([key]) => key.toLowerCase() === 'accept')?.[1] || ''
    const data = accept.includes('vnd.pgrst.object') ? rows[0] || null : rows
    await fulfill(requestId, data, 200, [{ name: 'Content-Range', value: rows.length ? `${offset}-${offset + rows.length - 1}/${total}` : `*/${total}` }])
  } catch (error) {
    if (isCancelledInterception(error)) return
    exceptions.push('Mock handler: ' + error.message)
    await fulfill(requestId, { message: 'Isolated UI fixture failed' }, 500)
  }
}

socket.addEventListener('message', event => {
  const message = JSON.parse(event.data)
  if (message.id) {
    const task = pending.get(message.id)
    if (task) {
      pending.delete(message.id)
      message.error ? task.reject(new Error(JSON.stringify(message.error))) : task.resolve(message.result)
    }
    return
  }
  if (message.method === 'Runtime.exceptionThrown' && !stopping) {
    exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text)
  }
  if (message.method !== 'Fetch.requestPaused' || stopping) return
  const operation = handlePausedRequest(message.params)
    .catch(error => { if (!isCancelledInterception(error)) exceptions.push('Request interception: ' + error.message) })
    .finally(() => interceptions.delete(operation))
  interceptions.add(operation)
})

const evaluate = async expression => {
  const response = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text)
  return response.result.value
}
const wait = async (expression, description = expression) => {
  const deadline = Date.now() + 40000
  while (Date.now() < deadline) {
    if (typeof expression === 'function' ? await expression() : await evaluate(`Boolean(${expression})`)) return
    await new Promise(resolve => setTimeout(resolve, 120))
  }
  throw new Error('Timed out: ' + description)
}
const click = async selector => {
  assert.ok(await evaluate(`Boolean(document.querySelector(${JSON.stringify(selector)}))`), 'Missing control: ' + selector)
  await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`)
}
const clickText = async (selector, text) => {
  const found = await evaluate(`(()=>{const e=Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find(el=>el.textContent.includes(${JSON.stringify(text)}));if(!e)return false;e.click();return true})()`)
  assert.ok(found, 'Missing action: ' + text)
}
const fill = (selector, value, tag = 'HTMLInputElement') => evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw Error('Missing field');Object.getOwnPropertyDescriptor(${tag}.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event(${tag === 'HTMLSelectElement' ? "'change'" : "'input'"},{bubbles:true}));})()`)
const key = async (key, code = key) => {
  const windowsVirtualKeyCode = { Enter: 13, Tab: 9, Escape: 27, ArrowDown: 40, ArrowUp: 38, Home: 36, End: 35 }[key] || 0
  const event = { key, code, windowsVirtualKeyCode }
  await send('Input.dispatchKeyEvent', { type: 'keyDown', ...event, ...(key === 'Enter' ? { text: '\r', unmodifiedText: '\r' } : {}) })
  await send('Input.dispatchKeyEvent', { type: 'keyUp', ...event })
}
const check = async (name, action) => {
  await action()
  checks.push(name)
  console.log('PASS ' + name)
}
const viewport = (width, height = 900) => send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: width <= 720 })
const screenshot = async name => {
  await evaluate("Promise.all(Array.from(document.querySelectorAll('[role=\"dialog\"]')).flatMap(e=>e.getAnimations({subtree:true})).filter(a=>Number.isFinite(a.effect?.getTiming().iterations)).map(a=>a.finished.catch(()=>{}))).then(()=>undefined)")
  const image = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false })
  writeFileSync(`${artifacts}/${name}.png`, Buffer.from(image.data, 'base64'))
}
const layout = async label => {
  const sizes = await evaluate(`(()=>{const root=document.querySelector('.workspaceRoot'),content=document.querySelector('.workspaceContent');return{viewport:innerWidth,document:document.documentElement.scrollWidth,available:document.documentElement.clientWidth,root:root.getBoundingClientRect().width,content:content.getBoundingClientRect().width}})()`)
  measurements.push({ label, ...sizes })
  assert.ok(sizes.document <= sizes.viewport + 1, label + ' horizontal overflow: ' + JSON.stringify(sizes))
  if (sizes.viewport <= 720) assert.ok(sizes.content >= sizes.available - 2, label + ' leaves an unused page column: ' + JSON.stringify(sizes))
  assert.ok(sizes.content > 300 || sizes.viewport < 340, label + ' content is unusably narrow')
  const clippedControls = await evaluate(`Array.from(document.querySelectorAll('.moduleEnter button,.moduleEnter input,.moduleEnter select,.moduleEnter textarea,.workspaceHeaderProfile')).filter(e=>e.getClientRects().length&&!e.closest('.workspaceTableViewport,[role="dialog"],.oppePrintOnly')).filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&(r.right>innerWidth+1||r.left<0)}).map(e=>({label:e.getAttribute('aria-label')||e.title||e.textContent.slice(0,70)||e.tagName,className:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}))`)
  assert.deepEqual(clippedControls, [], label + ' has clipped controls')
}
const goModule = async (id, label) => {
  await evaluate('window.scrollTo(0,0)')
  if (await evaluate('innerWidth <= 720')) {
    await click('.workspaceSidebarMenuButton')
    await wait("document.querySelector('.sidebar.mobileOpen')")
  }
  await click(`.sidebarNavGroup > button[title="${label}"]`)
  if (await evaluate("Boolean(document.querySelector('.sidebar.mobileOpen'))")) await click('.workspaceDrawerClose')
  await wait(`document.querySelector('.moduleEnter')?.dataset.workspaceContainer===${JSON.stringify(id)}`)
  await wait("!document.querySelector('.moduleEnter > .aurekaAsyncState.loading')")
  await layout(label)
}
const goSection = async (id, label) => {
  await evaluate('window.scrollTo(0,0)')
  if (await evaluate('innerWidth <= 720')) await fill('.workspaceContextSelect select', id, 'HTMLSelectElement')
  else await clickText('.workspaceContextNav button', label)
  await wait(`document.querySelector('.workspaceContextSelect select')?.value===${JSON.stringify(id)}`)
}
const goView = async (selector, value, label) => {
  if (await evaluate('innerWidth <= 720')) await fill(selector + ' select', value, 'HTMLSelectElement')
  else await clickText(selector + ' button', label)
  await wait(`document.querySelector(${JSON.stringify(selector + ' select')})?.value===${JSON.stringify(value)}`)
}
const login = async role => {
  testRole = role
  await send('Storage.clearDataForOrigin', { origin: new URL(appUrl).origin, storageTypes: 'all' })
  await send('Page.navigate', { url: appUrl })
  await wait("document.querySelector('.a2-button-workspace')")
  await wait("document.documentElement.dataset.theme==='solid'", 'React hydration before clicking the login action')
  await click('.a2-button-workspace')
  await wait("document.querySelector('#password')")
  await fill('#email', user.email)
  await fill('#password', 'isolated-ui-test-only')
  await evaluate("document.querySelector('.authForm').requestSubmit()")
  await wait("document.querySelector('.workspaceDesk')")
}

let stopInterceptionPromise
const stopInterception = () => stopInterceptionPromise ??= (async () => {
  stopping = true
  stopRequests()
  // Unload the test document before unmocking so background refreshes cannot reach a backend.
  await send('Page.navigate', { url: 'about:blank' })
  await Promise.all([...interceptions])
  await send('Fetch.disable')
  await send('Network.setBlockedURLs', { urls: [] })
})()

try {
  await send('Page.enable')
  await send('Runtime.enable')
  await send('Network.enable')
  await send('Network.setBlockedURLs', { urls: ['wss://*'] })
  await send('Fetch.enable', { patterns: [{ urlPattern: '*' }] })
  await viewport(1366)
  await login('ADMIN')
  await wait("document.querySelector('.ovPanel')")
  await check('authenticated desktop frame', () => layout('Overview'))
  await screenshot('overview-1366')
  await goModule('quality', 'Mutu Klinis')
  await wait("document.querySelectorAll('.aqHideStatus tbody tr').length===14")
  await check('logbook has a usable multi-row viewport', async () => {
    const height = await evaluate("document.querySelector('.aqHideStatus .aqWrap').getBoundingClientRect().height")
    assert.ok(height >= 260, 'Table collapsed to ' + height + 'px')
  })
  await screenshot('logbook-1366')
  await check('data remains visible on the reference-sized 1308×666 screen', async () => {
    await viewport(1308, 666)
    const visibleRows = await evaluate(`(()=>{const t=document.querySelector('.aqHideStatus table'),r=t.querySelector('tbody tr');return Math.floor((innerHeight-t.getBoundingClientRect().top-t.querySelector('thead').getBoundingClientRect().height)/r.getBoundingClientRect().height)})()`)
    assert.ok(visibleRows >= 3, 'Too much stacked chrome above the register')
    await screenshot('logbook-1308-666')
    await viewport(1366)
  })
  await check('unit metrics remain available through progressive disclosure', async () => {
    assert.equal(await evaluate("document.querySelector('.aqMetricsSummary').open"), false)
    await click('.aqMetricsSummary > summary')
    assert.ok(await evaluate("document.querySelector('.aqComplaintKpi').getBoundingClientRect().height>50"))
    await click('.aqMetricsSummary > summary')
  })
  await check('density changes actual row spacing', async () => {
    const normal = await evaluate("getComputedStyle(document.querySelector('.aqHideStatus td')).paddingTop")
    await click('.workspaceDensityToggle')
    const compact = await evaluate("getComputedStyle(document.querySelector('.aqHideStatus td')).paddingTop")
    assert.notEqual(normal, compact)
    await click('.workspaceDensityToggle')
  })
  await check('local search and period filters affect real rendered rows', async () => {
    await fill('.aqLocalSearch input', 'Catatan Uji 01')
    await wait("document.querySelectorAll('.aqHideStatus tbody tr').length===1")
    assert.ok(await evaluate("document.querySelector('.aqHideStatus tbody').textContent.includes('Catatan Uji 01')"))
    await fill('.aqLocalSearch input', '')
    await fill('select[aria-label="Bulan pengamatan"]', '9', 'HTMLSelectElement')
    await wait("document.querySelector('.aqHideStatus tbody').textContent.includes('Belum ada catatan')")
    await fill('select[aria-label="Bulan pengamatan"]', '0', 'HTMLSelectElement')
    await wait("document.querySelectorAll('.aqHideStatus tbody tr').length===14")
  })
  await check('header search exposes results and supports keyboard navigation', async () => {
    await fill('#workspaceGlobalSearchInput', 'Catatan Uji 02')
    await wait("document.querySelector('#workspace-search-results [role=\"option\"]')")
    await evaluate("document.querySelector('#workspaceGlobalSearchInput').focus()")
    await key('ArrowDown')
    assert.equal(await evaluate("document.activeElement.getAttribute('role')"), 'option')
    await key('Escape')
    await wait("!document.querySelector('#workspace-search-results')")
    await wait("document.querySelectorAll('.aqHideStatus tbody tr').length===14")
  })
  await check('logbook modal protects edits and traps keyboard focus', async () => {
    await click('.aqHideStatus tbody tr')
    await wait("document.querySelector('.aqPortal [role=\"dialog\"]')")
    await fill('.aqPortal input[aria-label="Nama Pasien"]', 'Catatan Uji Diubah')
    await screenshot('logbook-editor-1366')
    await key('Escape')
    await wait("document.querySelector('[aria-labelledby=\"aqCloseConfirmTitle\"]')")
    await clickText('[aria-labelledby="aqCloseConfirmTitle"] button', 'Lanjut mengisi')
    await wait("!document.querySelector('[aria-labelledby=\"aqCloseConfirmTitle\"]')")
    assert.equal(await evaluate("document.querySelector('.aqPortal input[aria-label=\"Nama Pasien\"]').value"), 'Catatan Uji Diubah')
    await evaluate("Array.from(document.querySelectorAll('.aqPortal [role=\"dialog\"] button')).at(-1).focus()")
    await key('Tab')
    assert.ok(await evaluate("document.querySelector('.aqPortal [role=\"dialog\"]').contains(document.activeElement)"))
  })
  await check('failed save keeps the draft; success waits for the server response', async () => {
    failQualitySave = true
    await clickText('.aqPortal .aqFoot button', 'Simpan Laporan')
    await wait("document.querySelector('.aqPortal .workspaceFeedback')?.textContent.includes('Belum tersimpan')")
    assert.equal(await evaluate("document.querySelector('.aqPortal input[aria-label=\"Nama Pasien\"]').value"), 'Catatan Uji Diubah')
    failQualitySave = false
    await clickText('.aqPortal .aqFoot button', 'Simpan Laporan')
    await wait("!document.querySelector('.aqPortal')")
    assert.ok(await evaluate("document.querySelector('.aqHideStatus tbody').textContent.includes('Catatan Uji Diubah')"))
    assert.ok(requests.some(request => request.resource === 'save_quality_logbook'))
  })
  await check('unavailable logbook source has a functioning retry', async () => {
    failQualityReads = true
    await click('.aqTableFooter button')
    await wait("document.querySelector('.aq > .aurekaAsyncState.error')")
    failQualityReads = false
    await click('.aq > .aurekaAsyncState.error button')
    await wait("!document.querySelector('.aq > .aurekaAsyncState.error') && document.querySelectorAll('.aqHideStatus tbody tr').length===14")
  })
  await check('keyboard archive action does not also open the patient editor', async () => {
    await evaluate("document.querySelector('.aqHideStatus tbody button').focus()")
    await key('Enter')
    await wait("document.querySelector('[aria-labelledby=\"aqDeleteConfirmTitle\"]')")
    assert.equal(await evaluate("Boolean(document.querySelector('.aqPortal'))"), false)
    await clickText('[aria-labelledby="aqDeleteConfirmTitle"] button', 'Batal')
    await wait("!document.querySelector('[aria-labelledby=\"aqDeleteConfirmTitle\"]')")
  })
  await check('workbook dialog keeps its guarded import and dismiss flow', async () => {
    await click('.aqImportButton')
    await wait("document.querySelector('[role=\"dialog\"]')")
    assert.ok(await evaluate("Boolean(document.querySelector('[role=\"dialog\"] input[type=\"file\"]'))"))
    await key('Escape')
    await wait("!document.querySelector('[role=\"dialog\"]')")
  })
  await check('quality views and Clinical Pathway return navigation remain wired', async () => {
    await clickText('.qualityWorkspaceTabs button', 'Hasil Capaian')
    await wait("document.querySelector('.qraRoot') || document.querySelector('.qra')")
    await clickText('.qualityWorkspaceTabs button', 'Form Logbook')
    await wait("document.querySelector('.aqHideStatus')")
    await goSection('audit-pathway', 'Audit Clinical Pathway')
    await wait("document.querySelector('.cpRoot')")
    await wait("document.querySelectorAll('.cpTile').length===6")
    await click('.cpTile')
    await clickText('.cpActions button', 'Audit pasien baru')
    await wait("document.querySelector('.cpAuditTable')")
    await layout('Clinical Pathway editor')
    await screenshot('pathway-editor-1366')
    await click('.cpChoiceToggle input')
    await click('.cpCell .cpMark')
    await wait("document.querySelector('.cpCell .cpMark.done')")
    await click('.cpCell .cpCellEdit')
    await wait("document.querySelector('.cpCellDetail')")
    await layout('Clinical Pathway item detail')
    await clickText('.cpCellDetail button', 'Tutup rincian')
    await evaluate("document.querySelector('.cpAuditWrap').scrollIntoView({block:'center'})")
    await screenshot('pathway-checklist-1366')
    await wait("Array.from(document.querySelectorAll('.cpRoot button')).some(e=>e.textContent.includes('Audit Indikator Mutu'))")
    await clickText('.cpRoot button', 'Audit Indikator Mutu')
    await wait("document.querySelector('.aqHideStatus')")
  })
  await goModule('safety', 'Keselamatan Pasien')
  await wait("document.querySelector('.psSectionHead')")
  await check('in-module safety navigation synchronizes the shell and URL', async () => {
    await clickText('.psBtn', 'Lihat Semua')
    await wait("location.hash==='#keselamatan-pasien/incidents' && document.querySelector('.workspacePageHead h1').textContent==='Laporan IKP'")
    assert.equal(await evaluate("document.querySelector('.workspaceSummary').open"), false)
    await clickText('.psBtn', 'Laporan Baru')
    await wait("document.querySelector('.psModalSheet')")
    await screenshot('incident-editor-1366')
    await key('Escape')
    await wait("!document.querySelector('.psModalSheet')")
    await goSection('survey', 'Survei Budaya')
    await wait("location.hash==='#keselamatan-pasien/survey'")
    await evaluate('history.back()')
    await wait("location.hash==='#keselamatan-pasien/incidents' && document.querySelector('.workspaceContextSelect select').value==='incidents'")
  })
  await goModule('risk', 'Manajemen Risiko')
  await wait("document.querySelector('.rmSectionHead')")
  await check('risk register navigation, selection, pagination, and editor remain usable', async () => {
    await clickText('.rmButton', 'Lihat register')
    await wait("location.hash==='#manajemen-risiko/register'")
    await fill('select[aria-label="Ruangan atau kelompok sumber"]', 'all', 'HTMLSelectElement')
    await wait("document.querySelectorAll('.rmTable tbody tr').length===15")
    await click('input[aria-label="Pilih semua pada halaman"]')
    await wait("document.querySelector('.rmSelectionBar')?.textContent.includes('15 risiko dipilih')")
    await clickText('.rmTableFooter button', 'Berikutnya')
    await wait("document.querySelector('.rmTableFooter').textContent.includes('Halaman 2')")
    await clickText('.rmButton', 'Tambah risiko')
    await wait("document.querySelector('.rmModalSheet')")
    await screenshot('risk-editor-1366')
    await key('Escape')
    assert.ok(await evaluate("Boolean(document.querySelector('.rmModalSheet'))"), 'Risk editor intentionally requires its explicit close action')
    await clickText('.rmModalSheet button', 'Batal')
    await wait("!document.querySelector('.rmModalSheet')")
  })
  await goModule('staff', 'Tenaga Klinis')
  await goSection('oppe', 'OPPE / FPPE')
  await wait("document.querySelector('.oppeTabs')")
  await wait("!document.querySelector('.oppeFilterMeta')?.textContent.includes('Memuat')")
  await check('OPPE filter metadata stays inside its available column', async () => {
    const fits = await evaluate("(()=>{const e=document.querySelector('.oppeFilterMeta');return e.scrollWidth<=e.clientWidth+1})()")
    assert.ok(fits, 'OPPE filter summary overflows its grid column')
    await layout('OPPE')
  })
  await check('clinical OPPE interpretation notes remain visible', async () => {
    assert.ok(await evaluate("document.querySelector('.oppeHeaderNotes.workspaceClinicalDisclaimer').getBoundingClientRect().height>0"))
    const visible = await evaluate("Array.from(document.querySelectorAll('.oppeHeaderNotes.workspaceClinicalDisclaimer > span')).filter(e=>e.getBoundingClientRect().height>0).map(e=>e.textContent)")
    assert.ok(visible.includes('Skor bukan keputusan otomatis kewenangan klinis'))
    assert.ok(visible.includes('Indikator otomatis: wajib memiliki aturan atribusi aktif'))
  })
  await screenshot('oppe-1366')
  await clickText('.oppeTabs button', 'FPPE terfokus')
  await wait("document.querySelector('.fppeWorkspace')")
  await check('FPPE is still mounted through the authorized OPPE workspace', () => layout('FPPE'))
  await check('FPPE receives the canonical roster through its existing frame bridge', async () => {
    await wait(`document.querySelector('.fppeFramePanel iframe')?.contentDocument?.querySelector('#staffPicker option[value="${staff[0].id}"]')`)
    const identity = await evaluate(`(()=>{const f=document.querySelector('.fppeFramePanel iframe'),d=f.contentDocument,p=d.getElementById('staffPicker');p.value=${JSON.stringify(staff[0].id)};p.dispatchEvent(new f.contentWindow.Event('change',{bubbles:true}));return{name:d.getElementById('staffName').value,code:d.getElementById('staffId').value,unit:d.getElementById('unit').value}})()`)
    assert.equal(identity.name, staff[0].display_name)
    assert.equal(identity.code, staff[0].employee_code)
    assert.equal(identity.unit, rooms[0].name)
  })
  await check('FPPE submit retains its required-field validation', async () => {
    const before = requests.filter(request => request.resource === 'oppe_fppe_evaluations' && request.method === 'POST').length
    await evaluate("document.querySelector('.fppeFramePanel iframe').contentDocument.getElementById('submitFppeBtn').click()")
    await wait("document.querySelector('.fppeFramePanel iframe').contentDocument.getElementById('integrationStatus').textContent.includes('Belum dapat diajukan')")
    assert.equal(requests.filter(request => request.resource === 'oppe_fppe_evaluations' && request.method === 'POST').length, before)
  })
  await check('FPPE keeps edits on a rejected save and waits for the server before success', async () => {
    failFppeWrites = true
    await evaluate("document.querySelector('.fppeFramePanel iframe').contentDocument.getElementById('saveFppeBtn').click()")
    await wait("document.querySelector('.fppeError') && !document.querySelector('.fppeBusyOverlay')")
    assert.equal(await evaluate("document.querySelector('.fppeFramePanel iframe').contentDocument.getElementById('staffName').value"), staff[0].display_name)
    failFppeWrites = false
    let started = false
    let release
    fppeWriteGate = { started: () => { started = true }, wait: new Promise(resolve => { release = resolve }) }
    await evaluate("document.querySelector('.fppeFramePanel iframe').contentDocument.getElementById('saveFppeBtn').click()")
    await wait(() => started, 'FPPE write reached the isolated server gate')
    assert.ok(await evaluate("Boolean(document.querySelector('.fppeBusyOverlay'))"))
    assert.equal(await evaluate("Boolean(document.querySelector('.fppeSuccess'))"), false)
    release()
    await wait("document.querySelector('.fppeSuccess')?.textContent.includes('tersimpan') && !document.querySelector('.fppeBusyOverlay')")
    assert.equal(fppeRecords[0].staff_id, staff[0].id)
    assert.equal(fppeRecords[0].status, 'draft')
  })
  await check('FPPE archive disclosure retains its real search and exports', async () => {
    await click('.fppeHistorySummary > summary')
    await wait("document.querySelector('.fppeHistoryItem')")
    await fill('.fppeLocalSearch', 'tidak-ada-tenaga-ini')
    await wait("!document.querySelector('.fppeHistoryItem')")
    await fill('.fppeLocalSearch', staff[0].display_name)
    await wait("document.querySelector('.fppeHistoryItem')")
    assert.equal(await evaluate("document.querySelectorAll('.fppeHistoryExportActions button').length"), 2)
    await fill('.fppeLocalSearch', '')
    if (await evaluate("document.querySelector('.fppeHistorySummary').open")) await click('.fppeHistorySummary > summary')
  })
  await screenshot('fppe-1366')
  await goModule('settings', 'Administrasi')
  await clickText('.settingsDestination', 'Pengaturan Umum')
  await wait("document.querySelector('#settings-active-panel')")
  await check('settings tabs support keyboard selection and linked panels', async () => {
    await evaluate("document.querySelector('#settings-tab-profile').focus()")
    await key('End')
    await wait("document.querySelector('#settings-tab-security[aria-selected=\"true\"]')")
    assert.equal(await evaluate("document.querySelector('#settings-active-panel').getAttribute('aria-labelledby')"), 'settings-tab-security')
    assert.equal(await evaluate("document.querySelectorAll('.pwForm input[type=\"password\"]').length"), 3)
    await screenshot('settings-1366')
  })
  await check('command palette filters and executes authorized destinations', async () => {
    await click('.commandPaletteTrigger')
    await wait("document.querySelector('#aureka-command-dialog')")
    await fill('.commandPaletteSearch input', 'Risk Register')
    await wait("Array.from(document.querySelectorAll('.commandPaletteOption strong')).some(e=>e.textContent==='Risk Register')")
    await evaluate("document.querySelector('.commandPaletteSearch input').focus()")
    const index = await evaluate("Array.from(document.querySelectorAll('.commandPaletteOption')).findIndex(e=>e.querySelector('strong')?.textContent==='Risk Register')")
    for (let step = 0; step < index; step++) await key('ArrowDown')
    assert.equal(await evaluate("document.querySelector('.commandPaletteOption[aria-selected=\"true\"] strong')?.textContent"), 'Risk Register')
    await key('Enter')
    await wait("!document.querySelector('#aureka-command-dialog') && location.hash==='#manajemen-risiko/register'")
  })
  await check('popover dismisses with Escape', async () => {
    await click('[data-workspace-popover-trigger="notifications"]')
    await wait("document.querySelector('.workspaceNotificationPanel')")
    await key('Escape')
    await wait("!document.querySelector('.workspaceNotificationPanel')")
  })
  await check('collapsed rail retains direct context navigation', async () => {
    await click('.workspaceSidebarMenuButton')
    await wait("document.querySelector('.sidebarIsCollapsed')")
    await goSection('fmea', 'FMEA')
    await wait("location.hash==='#manajemen-risiko/fmea'")
    await click('.workspaceSidebarMenuButton')
  })
  for (const width of testWidths) {
    await viewport(width, width <= 720 ? 844 : 900)
    await check(`responsive module layout at ${width}px`, async () => {
      for (const [id, label] of [
        ['home', 'Ringkasan'], ['quality', 'Mutu Klinis'], ['safety', 'Keselamatan Pasien'],
        ['risk', 'Manajemen Risiko'], ['staff', 'Tenaga Klinis'],
        ['analytics', 'Analitik & Laporan'], ['settings', 'Administrasi'],
      ]) {
        await goModule(id, label)
        if (id === 'home') {
          await wait("document.querySelector('.ovCell')")
          const matrixFits = await evaluate("(()=>{const e=document.querySelector('.ovMatrix'),p=e.closest('.ovPanel'),r=e.getBoundingClientRect(),b=p.getBoundingClientRect();return r.left>=b.left&&r.right<=b.right})()")
          assert.ok(matrixFits, 'Overview risk matrix is clipped by its card')
          await evaluate("Promise.all(Array.from(document.querySelectorAll('.ovKpi,.ovPanel')).flatMap(e=>e.getAnimations()).filter(a=>Number.isFinite(a.effect.getTiming().iterations)).map(a=>a.finished.catch(()=>{})))")
          await screenshot(`overview-${width}`)
        }
        const sections = await evaluate("Array.from(document.querySelector('.workspaceContextSelect select')?.options||[]).map(e=>({id:e.value,label:e.textContent}))")
        for (const section of sections) {
          await goSection(section.id, section.label)
          await wait("!document.querySelector('.moduleEnter .aurekaAsyncState.loading')")
          await evaluate("new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))")
          await layout(label + ' / ' + section.label)
          if (id === 'quality') {
            await clickText('.qualityWorkspaceTabs button', 'Hasil Capaian')
            await wait("document.querySelector('.qra')")
            await layout(label + ' / ' + section.label + ' / Hasil Capaian')
            await clickText('.qualityWorkspaceTabs button', 'Form Logbook')
            await wait("!document.querySelector('.moduleEnter .aurekaAsyncState.loading')")
            if (section.id === 'audit-pathway') {
              await wait("document.querySelectorAll('.cpTile').length===6")
              await click('.cpTile')
              await clickText('.cpActions button', 'Audit pasien baru')
              await wait("document.querySelector('.cpAuditTable')")
              await layout('Clinical Pathway editor')
              const dayWidth = await evaluate("document.querySelector('.cpAuditTable th.cpDayCol').getBoundingClientRect().width")
              assert.ok(dayWidth >= 80, 'Clinical Pathway days are squeezed below a usable control width')
              await screenshot(`pathway-editor-${width}`)
              const controlsFit = await evaluate("Array.from(document.querySelectorAll('.cpCellControls')).every(e=>e.scrollWidth<=e.clientWidth+1)")
              assert.ok(controlsFit, 'Clinical Pathway status and detail controls overlap')
              const schedule = await evaluate("(()=>{const r=document.querySelector('.cpCell.required'),c=document.querySelector('.cpCell.conditional'),b=document.querySelector('.cpChoiceToggle input').getBoundingClientRect();return{required:r&&getComputedStyle(r).backgroundColor,conditional:c&&getComputedStyle(c).backgroundColor,checkbox:b.width}})()")
              assert.equal(schedule.required, 'rgba(145, 203, 81, 0.25)', 'Required CP days lost their original clinical color')
              if (schedule.conditional) assert.equal(schedule.conditional, 'rgba(255, 225, 53, 0.28)', 'Conditional CP days lost their original clinical color')
              assert.ok(schedule.checkbox >= 14 && schedule.checkbox <= 20, 'A generic field rule oversized the CP checkbox')
              const scoresFit = await evaluate("Array.from(document.querySelectorAll('.cpScoreGrid .cpScore')).every(e=>e.scrollWidth<=e.clientWidth+1&&e.querySelector('small').getBoundingClientRect().height>0)")
              assert.ok(scoresFit, 'Clinical Pathway results must fit and retain their clinical denominator/target context')
              await evaluate("document.querySelector('.cpAuditWrap').scrollIntoView({block:'center'})")
              await screenshot(`pathway-checklist-${width}`)
            }
          }
          if (id === 'analytics' && section.id === 'metadata') {
            for (const [value, label] of [['profiles', 'Kamus indikator'], ['review', 'Review “Lainnya”'], ['programs', 'Program kerja']]) {
              await goView('.metadataTabs', value, label)
              await layout('Metadata / ' + label)
              await screenshot(`metadata-${value}-${width}`)
            }
          }
        }
        if (id === 'settings') {
          await clickText('.settingsDestination', 'Pengaturan Umum')
          await wait("document.querySelector('#settings-active-panel')")
          await goView('.settingsTabs', 'security', 'Keamanan & Password')
          await layout('Pengaturan / Keamanan')
        }
      }
    })
    await goModule('staff', 'Tenaga Klinis')
    await goSection('oppe', 'OPPE / FPPE')
    await wait("document.querySelector('.oppeTabs')")
    await check(`all OPPE destinations and counts remain available at ${width}px`, async () => {
      const destinations = await evaluate("Array.from(document.querySelector('.oppeTabs select').options).map(e=>({value:e.value,label:e.textContent}))")
      assert.deepEqual(destinations.map(item => item.value), ['assessment', 'fppe', 'rules', 'history'])
      assert.ok(destinations.find(item => item.value === 'rules').label.includes('(0)'))
      assert.ok(destinations.find(item => item.value === 'history').label.includes('(0)'))
      for (const [value, label] of [['rules', 'Pemetaan indikator'], ['history', 'Riwayat penilaian'], ['assessment', 'Form & output OPPE']]) {
        await goView('.oppeTabs', value, label)
        await layout('OPPE / ' + label)
      }
      const filtersFit = await evaluate("(()=>{const e=document.querySelector('.oppeFilters');return e.scrollWidth<=e.clientWidth+1})()")
      assert.ok(filtersFit, 'OPPE scope filters overflow their available grid')
      await wait("!document.querySelector('.oppeFilterMeta').textContent.includes('Memuat')")
      if (width <= 1100) {
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.oppeWorkGrid')).gridTemplateColumns.split(' ').length"), 1, 'OPPE squeezed its form into desktop columns')
        assert.equal(await evaluate("getComputedStyle(document.querySelector('.oppeAside')).gridTemplateColumns.split(' ').length"), 1, 'OPPE score cards must remain readable on narrow screens')
      }
      assert.ok(await evaluate("Array.from(document.querySelectorAll('.oppeScorePanel')).every(e=>e.scrollWidth<=e.clientWidth+1)"), 'An OPPE score card clips its text')
      await screenshot(`oppe-${width}`)
    })
    await goView('.oppeTabs', 'fppe', 'FPPE terfokus')
    await wait("document.querySelector('.fppeWorkspace')")
    await wait("document.querySelector('.fppeFramePanel iframe')?.contentDocument?.getElementById('staffPicker')")
    await wait("document.querySelector('.fppeFramePanel iframe').contentDocument.querySelectorAll('#staffPicker option').length>1")
    await check(`FPPE layout remains usable at ${width}px`, async () => {
      await layout('FPPE')
      const frame = await evaluate("(()=>{const f=document.querySelector('.fppeFramePanel iframe');return{viewport:f.contentWindow.innerWidth,document:f.contentDocument.documentElement.scrollWidth}})()")
      assert.ok(frame.document <= frame.viewport + 1, 'FPPE form itself overflows: ' + JSON.stringify(frame))
    })
    await screenshot(`fppe-${width}`)
    await goModule('quality', 'Mutu Klinis')
    await wait(`document.querySelectorAll('.aqHideStatus tbody tr').length===${qualityRecords.length}`)
    await screenshot(`logbook-${width}`)
    await check(`table columns remain reachable at ${width}px`, async () => {
      const selector = '.aqHideStatus .workspaceTableViewport'
      const overflowing = await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollWidth > document.querySelector(${JSON.stringify(selector)}).clientWidth + 1`)
      if (overflowing) {
        await click('.aqHideStatus .workspaceTableHint button:last-child')
        await wait(`document.querySelector(${JSON.stringify(selector)}).scrollLeft > 0`)
        await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollLeft=0`)
      } else {
        assert.ok(await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});return e.querySelector('tbody tr td:last-child').getBoundingClientRect().right<=e.getBoundingClientRect().right+1})()`), 'The final column must be visible when no scroll controls are needed')
      }
    })
    if (width <= 720) {
      await check(`logbook editor fits the phone at ${width}px`, async () => {
        await click('.aqHideStatus tbody tr')
        await wait("document.querySelector('.aqPortal [role=\"dialog\"]')")
        await screenshot(`logbook-editor-${width}`)
        const fits = await evaluate(`(()=>{const d=document.querySelector('.aqEditorDialog').getBoundingClientRect(),f=document.querySelector('.aqPortal .aqFoot').getBoundingClientRect();return d.left>=0&&d.right<=innerWidth+1&&d.top>=0&&f.bottom<=innerHeight+1})()`)
        assert.ok(fits, 'Dialog or save actions are outside the phone viewport')
        await key('Escape')
        await wait("!document.querySelector('.aqPortal')")
      })
      await check(`phone drawer focus and Escape at ${width}px`, async () => {
        await click('.workspaceSidebarMenuButton')
        await wait("document.querySelector('.sidebar.mobileOpen')")
        await wait("(()=>{const r=document.querySelector('.sidebar').getBoundingClientRect();return r.left>=-.5&&r.right<=innerWidth})()")
        assert.ok(await evaluate("document.querySelector('.sidebar').contains(document.activeElement)"))
        await screenshot(`drawer-${width}`)
        await key('Escape')
        await wait("!document.querySelector('.sidebar.mobileOpen')")
        assert.ok(await evaluate("document.activeElement===document.querySelector('.workspaceSidebarMenuButton')"))
      })
      await goSection('audit-clinical-death', 'Audit Klinis dan Kematian')
      await wait("document.querySelector('.acd')")
      await layout('Clinical death mobile')
    }
  }
  await check('patient form values are not persisted in browser storage', async () => {
    assert.equal(await evaluate("Object.values(localStorage).some(value=>value.includes('Catatan Uji')||value.includes('Kronologis Ringkas'))"), false)
  })
  for (const role of ['PIC', 'VALIDATOR']) {
    await viewport(1366)
    await login(role)
    await check(`${role} menu visibility and guarded logbook controls`, async () => {
      assert.equal(await evaluate("Boolean(document.querySelector('.sidebarNavGroup > button[title=\"Analitik & Laporan\"]'))"), false)
      await goModule('quality', 'Mutu Klinis')
      await wait("document.querySelector('.aqHideStatus')")
      if (role === 'VALIDATOR') {
        assert.equal(await evaluate("Boolean(document.querySelector('.aqAddButton') || document.querySelector('.aqImportButton'))"), false)
      } else {
        assert.equal(await evaluate("document.querySelector('select[aria-label=\"Unit\"]').disabled"), true)
      }
    })
    await check(`${role} logout remains functional`, async () => {
      await click('.sidebarFooter .liquidButton button')
      await wait("document.querySelector('.a2-landing')")
    })
  }
  await stopInterception()
  assert.deepEqual(exceptions, [], 'Browser runtime or interception exceptions')
  const report = { mode: 'isolated Supabase fixtures; no backend acceptance', checks, measurements, requestCount: requests.length, runtimeExceptions: exceptions }
  writeFileSync(`${artifacts}/report.json`, JSON.stringify(report, null, 2))
  console.log(`Passed ${checks.length} browser checks; ${requests.length} mocked requests; no runtime exceptions.`)
  console.log('Artifacts: ' + artifacts)
} catch (error) {
  await screenshot('failure').catch(() => {})
  writeFileSync(`${artifacts}/failure.json`, JSON.stringify({ error: error.message, checks, exceptions, measurements: measurements.slice(-8) }, null, 2))
  throw error
} finally {
  try {
    await stopInterception()
  } finally {
    socket.close()
  }
}
