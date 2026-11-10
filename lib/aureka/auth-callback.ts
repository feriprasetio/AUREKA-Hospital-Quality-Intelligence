export type AuthCallbackError = { message: string; code: string; description: string }

/** Reads Supabase Auth error callbacks from either the URL fragment or query string. */
export function parseAuthCallbackError(hash: string, search = ''): AuthCallbackError | null {
  for (const raw of [hash, search]) {
    const value = raw.replace(/^[?#]/, '')
    if (!value) continue
    const params = new URLSearchParams(value)
    const code = params.get('error_code') ?? ''
    const description = params.get('error_description') ?? ''
    const error = params.get('error') ?? ''
    if (!code && !description && !error) continue

    const detail = `${code} ${description} ${error}`.toLowerCase()
    const expired = /otp_expired|expired|already[_ ]been[_ ]used|invalid[_ ]token/.test(detail)
    return {
      code,
      description,
      message: expired
        ? 'Tautan dari email sudah kedaluwarsa atau sudah pernah dipakai (tautan hanya berlaku sekali dan sementara). Minta tautan baru lewat “Lupa password?”, atau hubungi Super Admin.'
        : 'Tautan dari email tidak dapat diproses. Silakan coba lagi atau hubungi Super Admin.',
    }
  }
  return null
}
