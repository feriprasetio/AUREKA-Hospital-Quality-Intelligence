import test from 'node:test'
import assert from 'node:assert/strict'
import { isReadRpc, trainingIntercept } from '../lib/aureka/training-mode.ts'

test('RPC baca diteruskan, RPC tulis dicegat', () => {
  for (const n of ['aureka_quality_room_reporting_status', 'aureka_gov_program_list', 'aureka_gov_infographics_summary_secure', 'aureka_get_my_profile', 'aureka_admin_list_users_v3', 'aureka_quality_month_review_status']) assert.equal(isReadRpc(n), true, n)
  for (const n of ['replace_indicator_profile_set', 'aureka_validator_review_quality_month', 'aureka_log_client_error', 'aureka_admin_update_user_profile', 'aureka_mark_reminder_read', 'aureka_set_my_username']) assert.equal(isReadRpc(n), false, n)
})

test('tanpa mode latihan tidak mencegat apa pun', () => {
  assert.equal(trainingIntercept('https://x.supabase.co/rest/v1/incidents', { method: 'POST', body: '{}' }), null)
})

test('dengan mode latihan: insert dijawab palsu, GET diteruskan', async () => {
  const store = new Map([['aureka-latihan', '1']])
  globalThis.window = { localStorage: { getItem: (k) => store.get(k) ?? null }, dispatchEvent() {} }
  globalThis.CustomEvent = class { constructor(t) { this.type = t } }
  try {
    assert.equal(trainingIntercept('https://x.supabase.co/rest/v1/incidents?select=*', { method: 'GET' }), null)
    const r = trainingIntercept('https://x.supabase.co/rest/v1/incidents?select=id', { method: 'POST', body: JSON.stringify({ summary: 'a' }), headers: { Prefer: 'return=representation', Accept: 'application/vnd.pgrst.object+json' } })
    assert.equal(r.status, 201)
    const row = await r.json()
    assert.equal(row.summary, 'a')
    assert.match(String(row.id), /^latihan-/)
    const p = trainingIntercept('https://x.supabase.co/rest/v1/incidents?id=eq.42', { method: 'PATCH', body: '{"status":"closed"}', headers: { Prefer: 'return=representation' } })
    assert.deepEqual((await p.json())[0].id, '42')
    assert.equal(trainingIntercept('https://x.supabase.co/auth/v1/token', { method: 'POST' }), null)
    assert.equal(trainingIntercept('https://x.supabase.co/rest/v1/rpc/aureka_gov_program_list', { method: 'POST' }), null)
    assert.equal((await trainingIntercept('https://x.supabase.co/rest/v1/rpc/replace_indicator_profile_set', { method: 'POST' }).json()), null)
  } finally { delete globalThis.window }
})
