export type UserFacingErrorOptions = {
  fallback?: string
}

const DEFAULT_FALLBACK = 'Operasi belum berhasil. Periksa koneksi dan hak akses, lalu coba kembali.'

const CODE_MESSAGES: Record<string, string> = {
  '23505': 'Data dengan identitas yang sama sudah tersedia. Periksa data sebelum mencoba lagi.',
  '23503': 'Data terkait tidak ditemukan atau sudah berubah. Muat ulang data, lalu coba kembali.',
  '23502': 'Masih ada kolom wajib yang belum diisi. Lengkapi data, lalu coba kembali.',
  '23514': 'Nilai tidak memenuhi aturan validasi. Periksa kembali isian Anda.',
  '22P02': 'Format salah satu nilai tidak sesuai. Periksa kembali isian Anda.',
  '42501': 'Anda tidak memiliki izin untuk melakukan tindakan ini. Hubungi administrator bila akses seharusnya tersedia.',
  'PGRST116': 'Data tidak ditemukan atau sudah berubah. Muat ulang halaman, lalu coba kembali.',
  'PGRST202': 'Fitur ini belum tersedia pada layanan saat ini. Hubungi administrator AUREKA.',
  'PGRST204': 'Struktur layanan belum siap untuk operasi ini. Hubungi administrator AUREKA.',
  'PGRST301': 'Sesi akses tidak lagi berlaku. Masuk kembali ke AUREKA.',
  '42P01': 'Layanan belum siap untuk operasi ini. Hubungi administrator AUREKA.',
  '42703': 'Layanan belum siap untuk operasi ini. Hubungi administrator AUREKA.',
  '42883': 'Fitur belum tersedia pada layanan saat ini. Hubungi administrator AUREKA.',
}

const TECHNICAL_OR_SENSITIVE = [
  /\b(?:PGRST|SQLSTATE)[0-9A-Z]+\b/i,
  /row[- ]level security|\bRLS\b/i,
  /permission denied for (?:schema|table|relation|function)/i,
  /relation .+ does not exist|column .+ does not exist|function .+ does not exist/i,
  /schema cache|postgrest|postgres(?:ql)?/i,
  /violates? (?:foreign key|unique|not[- ]null|check) constraint/i,
  /\b(?:insert into|update\s+\w+\s+set|select\s+.+\s+from|delete\s+from)\b/i,
  /https?:\/\/\S+/i,
  /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/i,
]

function readError(error: unknown): { message: string; code: string; status: number | null; isErrorInstance: boolean } {
  if (typeof error === 'string') {
    return { message: error.trim(), code: '', status: null, isErrorInstance: false }
  }

  if (!error || typeof error !== 'object') {
    return { message: '', code: '', status: null, isErrorInstance: false }
  }

  const value = error as Record<string, unknown>
  const message = error instanceof Error
    ? error.message.trim()
    : typeof value.message === 'string'
      ? value.message.trim()
      : ''

  const statusValue = Number(value.status ?? value.statusCode)
  return {
    message,
    code: typeof value.code === 'string' ? value.code.trim().toUpperCase() : '',
    status: Number.isFinite(statusValue) ? statusValue : null,
    isErrorInstance: error instanceof Error,
  }
}

/**
 * Converts technical failures into concise Indonesian guidance suitable for
 * operational users. Raw database messages, SQL fragments, URLs and UUIDs are
 * never returned to the interface.
 *
 * Safe application-created Error messages are preserved so existing
 * field-validation and workflow guidance remains useful.
 */
export function toUserFacingError(error: unknown, options: UserFacingErrorOptions = {}): string {
  const fallback = options.fallback?.trim() || DEFAULT_FALLBACK
  const { message, code, status, isErrorInstance } = readError(error)

  if (code && CODE_MESSAGES[code]) return CODE_MESSAGES[code]
  if (status === 401) return 'Sesi login tidak berlaku atau telah berakhir. Masuk kembali ke AUREKA.'
  if (status === 403) return 'Anda tidak memiliki izin untuk melakukan tindakan ini.'
  if (status === 429) return 'Permintaan terlalu sering. Tunggu beberapa saat, lalu coba kembali.'
  if (status !== null && status >= 500) return fallback

  if (!message) return fallback
  if (/invalid login credentials/i.test(message)) return 'Username/email atau password salah.'
  if (/email not confirmed/i.test(message)) return 'Email akun belum diverifikasi. Buka email Anda dan klik tautan verifikasi.'
  if (/already registered|already been registered/i.test(message)) return 'Email ini sudah terdaftar. Silakan masuk atau gunakan Lupa password.'
  if (/user not found|username not found/i.test(message)) return 'Akun tidak ditemukan. Periksa kembali identitas login Anda.'
  if (/rate limit|too many requests|too many attempts/i.test(message)) return 'Terlalu banyak percobaan. Tunggu beberapa menit, lalu coba kembali.'
  if (/failed to fetch|fetch failed|network error|network request failed|offline|internet disconnected/i.test(message)) {
    return 'Koneksi ke layanan AUREKA terputus. Periksa jaringan, lalu coba kembali.'
  }
  if (/timed? ?out|timeout|statement timeout/i.test(message)) {
    return 'Layanan membutuhkan waktu lebih lama dari biasanya. Coba kembali beberapa saat lagi.'
  }
  if (/jwt expired|token is expired|refresh token.*(not found|invalid)|session.*(expired|not found)/i.test(message)) {
    return 'Sesi login tidak lagi berlaku. Masuk kembali ke AUREKA.'
  }
  if (TECHNICAL_OR_SENSITIVE.some((pattern) => pattern.test(message))) return fallback

  // Plain PostgREST/Auth objects are treated as service errors, not trusted
  // application copy. Only curated Error instances may pass through.
  if (!isErrorInstance || message.length > 240) return fallback

  return message
}
/**
 * Final safety filter for legacy notifications that already contain text.
 * Safe Indonesian operator copy is retained; technical diagnostics and
 * excessively long payloads are replaced with the caller's fallback.
 */
export function sanitizeNotificationText(message: string, fallback: string): string {
  const text = String(message ?? '').trim()
  if (!text || text.length > 500) return fallback
  if (TECHNICAL_OR_SENSITIVE.some((pattern) => pattern.test(text))) return fallback
  if (/failed to fetch|fetch failed|network error|network request failed|request timed out|statement timeout/i.test(text)) return fallback
  return text
}
