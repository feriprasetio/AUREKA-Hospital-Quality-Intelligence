import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Satu instance Supabase untuk seluruh aplikasi. Beberapa instance dengan
// storage sesi yang sama dapat saling berebut refresh token
// ("Multiple GoTrueClient instances") sehingga sesi login tidak sinkron.
export const AUREKA_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ktukmjscopggkzrkgnzp.supabase.co'
export const AUREKA_SUPABASE_PUBLISHABLE_KEY = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_6NWrr2xGApSApIjQ0irtvA_U05ZQlFX'

// Bila token akses kedaluwarsa (mis. tab/HP baru bangun dari latar belakang),
// perbarui sesi sekali lalu ulangi permintaan data, alih-alih langsung gagal.
let refreshing: Promise<string | null> | null = null
const refreshAccessToken = (): Promise<string | null> => {
  if (!refreshing) {
    refreshing = aurekaSupabase.auth.refreshSession()
      .then(({ data }) => data.session?.access_token ?? null)
      .catch(() => null)
      .finally(() => { setTimeout(() => { refreshing = null }, 0) })
  }
  return refreshing
}
const fetchWithSessionRetry: typeof fetch = async (input, init) => {
  const response = await fetch(input, init)
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  if (response.status !== 401 || /\/auth\/v1\//.test(url)) return response
  const body = await response.clone().text().catch(() => '')
  if (!/jwt expired|PGRST301|PGRST303|invalid jwt|token is expired/i.test(body)) return response
  const token = await refreshAccessToken()
  if (!token) return response
  const headers = new Headers(init?.headers || (input instanceof Request ? input.headers : undefined))
  headers.set('Authorization', 'Bearer ' + token)
  return fetch(input, { ...init, headers })
}

export const aurekaSupabase: SupabaseClient = createClient(AUREKA_SUPABASE_URL, AUREKA_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  global: { fetch: fetchWithSessionRetry },
})
