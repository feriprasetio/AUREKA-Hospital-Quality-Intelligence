import { aurekaSupabase } from '@/lib/aureka/supabase'

// Kirim ringkasan error tampilan ke audit log (bila fungsi sudah dipasang di Supabase).
// Tidak pernah melempar error; dibatasi agar error berulang tidak membanjiri log.
const sent = new Map<string, number>()
export function reportClientError(moduleName: string, error: unknown) {
  try {
    const err = error instanceof Error ? error : new Error(String(error))
    const key = moduleName + '|' + err.message
    const now = Date.now()
    if ((sent.get(key) || 0) > now - 10 * 60 * 1000 || sent.size > 40) return
    sent.set(key, now)
    void aurekaSupabase.rpc('aureka_log_client_error', {
      p_module: moduleName,
      p_message: (err.name ? err.name + ': ' : '') + err.message,
      p_detail: {
        stack: String(err.stack || '').slice(0, 1500),
        path: typeof location !== 'undefined' ? location.pathname + location.hash : '',
        ua: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      },
    }).then(() => undefined, () => undefined)
  } catch { /* abaikan */ }
}
