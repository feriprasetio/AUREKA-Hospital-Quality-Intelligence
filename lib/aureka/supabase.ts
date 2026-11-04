import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// One Supabase client instance is shared by the application. Configuration is
// intentionally fail-closed: a build without an explicitly selected project
// must fail instead of silently connecting to the live hospital database.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabasePublishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabasePublishableKey) {
  throw new Error(
    'Konfigurasi Supabase belum tersedia. Isi NEXT_PUBLIC_SUPABASE_URL dan ' +
      'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY pada environment build yang sesuai (staging atau production).',
  )
}

// Preserve the named exports for compatibility while removing production fallbacks.
export const AUREKA_SUPABASE_URL = supabaseUrl
export const AUREKA_SUPABASE_PUBLISHABLE_KEY = supabasePublishableKey

export const aurekaSupabase: SupabaseClient = createClient(supabaseUrl, supabasePublishableKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
