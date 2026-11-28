import { AUREKA_SUPABASE_URL, AUREKA_SUPABASE_PUBLISHABLE_KEY } from './supabase'

type AuthAction = 'login' | 'recover' | 'resend'
type LoginTokens = { access_token: string; refresh_token: string }
export async function requestUsernameAuth(action: 'login', username: string, password: string): Promise<LoginTokens>
export async function requestUsernameAuth(action: 'recover' | 'resend', username: string): Promise<void>
export async function requestUsernameAuth(action: AuthAction, username: string, password?: string): Promise<LoginTokens | void> {
  const normalized = username.trim().toLowerCase()
  if (!/^[a-z0-9][a-z0-9._-]{2,29}$/.test(normalized)) throw new Error('Username tidak valid.')
  const response = await fetch(AUREKA_SUPABASE_URL + '/functions/v1/aureka-username-auth', {
    method: 'POST', cache: 'no-store', credentials: 'omit',
    headers: { apikey: AUREKA_SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, username: normalized, ...(action === 'login' ? { password } : {}) }),
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(response.status === 429 ? 'Too many requests' :
    data.error === 'Email not confirmed' ? 'Email not confirmed' :
    response.status === 401 ? 'Invalid login credentials' : 'Layanan autentikasi belum tersedia.')
  if (action === 'login') {
    if (typeof data.access_token !== 'string' || typeof data.refresh_token !== 'string') throw new Error('Invalid login credentials')
    return { access_token: data.access_token, refresh_token: data.refresh_token }
  }
}
