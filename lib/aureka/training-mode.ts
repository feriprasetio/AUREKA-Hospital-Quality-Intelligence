// Mode latihan: semua penulisan data ke server dicegat dan dijawab "berhasil" secara pura-pura,
// sehingga staf bisa mencoba mengisi formulir tanpa mengotori data asli. Pembacaan data tetap normal.
// Disimpan per perangkat (localStorage) dan selalu ditandai dengan pita oranye di layar.

const KEY = 'aureka-latihan'
export const TRAINING_EVENT = 'aureka-training-change'

export function isTrainingMode(): boolean {
  try { return typeof window !== 'undefined' && window.localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setTrainingMode(on: boolean) {
  try { if (on) window.localStorage.setItem(KEY, '1'); else window.localStorage.removeItem(KEY) } catch { /* abaikan */ }
  window.dispatchEvent(new CustomEvent(TRAINING_EVENT, { detail: on }))
}

// RPC yang hanya membaca data tetap diteruskan ke server. Selain itu dianggap menulis.
const READ_RPC = /(^|_)(list|get|status|summary|search|available|lookup|count|catalog|options|my_profile|my_account|login_email|infographics|reporting|stats)(_|$)/i
const WRITE_RPC = /(^|_)(create|insert|update|upsert|delete|remove|save|submit|set|add|replace|import|review|approve|validate|log|mark|send|assign|reset|archive|retire|close|publish|sync|transfer|copy|link|unlink|complete|change|register|record|apply|bulk)(_|$)/i

const READ_SUFFIX = /_(list|status|summary|search|count|options|stats|lookup|catalog)(_v\d+|_secure)?$/i

export function isReadRpc(name: string) { return READ_SUFFIX.test(name) || (READ_RPC.test(name) && !WRITE_RPC.test(name)) }

let seq = 0
const fakeId = () => 'latihan-' + Date.now().toString(36) + '-' + (++seq)

/** Kembalikan Response palsu bila permintaan ini menulis data dan mode latihan aktif; null bila harus diteruskan. */
export function trainingIntercept(url: string, init?: RequestInit): Response | null {
  if (!isTrainingMode()) return null
  const method = String(init?.method || 'GET').toUpperCase()
  if (method === 'GET' || method === 'HEAD') return null
  if (/\/auth\/v1\//.test(url)) return null
  const json = (body: unknown, status = 200) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const rpc = url.match(/\/rest\/v1\/rpc\/([a-zA-Z0-9_]+)/)
  if (rpc) {
    if (isReadRpc(rpc[1])) return null
    notify()
    return json(null)
  }
  if (/\/storage\/v1\//.test(url)) { notify(); return json({ Key: 'latihan/' + fakeId() }) }
  if (!/\/rest\/v1\//.test(url)) return null

  notify()
  const headers = new Headers(init?.headers)
  const single = /vnd\.pgrst\.object/.test(headers.get('Accept') || '')
  const minimal = /return=minimal/.test(headers.get('Prefer') || '') || !/return=representation/.test(headers.get('Prefer') || '')
  let body: any = null
  try { body = typeof init?.body === 'string' ? JSON.parse(init.body) : null } catch { body = null }
  const idEq = new URL(url).searchParams.get('id')?.replace(/^eq\./, '')
  let rows: any[] = []
  if (method === 'POST') rows = (Array.isArray(body) ? body : [body || {}]).map((r: any) => ({ id: fakeId(), ...r, created_at: new Date().toISOString() }))
  else if (method === 'PATCH' || method === 'PUT') rows = [{ ...(body || {}), id: idEq ?? fakeId(), updated_at: new Date().toISOString() }]
  else if (method === 'DELETE') rows = []
  if (minimal) return new Response(null, { status: method === 'POST' ? 201 : 204 })
  return json(single ? (rows[0] ?? {}) : rows, method === 'POST' ? 201 : 200)
}

let last = 0
function notify() {
  const now = Date.now()
  if (now - last < 1500) return
  last = now
  try { window.dispatchEvent(new CustomEvent('aureka-training-write')) } catch { /* abaikan */ }
}
