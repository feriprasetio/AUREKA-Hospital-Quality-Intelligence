import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Satu instance Supabase untuk seluruh aplikasi. Beberapa instance dengan
// storage sesi yang sama dapat saling berebut refresh token
// ("Multiple GoTrueClient instances") sehingga sesi login tidak sinkron.
export const AUREKA_SUPABASE_URL = 'https://ktukmjscopggkzrkgnzp.supabase.co'
export const AUREKA_SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_6NWrr2xGApSApIjQ0irtvA_U05ZQlFX'

export const aurekaSupabase: SupabaseClient = createClient(AUREKA_SUPABASE_URL, AUREKA_SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
