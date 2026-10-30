export const DEFAULT_IMPORT_BATCH_SIZE = 20
export const MIN_IMPORT_BATCH_SIZE = 5

/** Detect PostgreSQL statement_timeout errors returned by PostgREST/Supabase RPC. */
export function isStatementTimeout(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as { code?: unknown; message?: unknown; details?: unknown }
  if (String(candidate.code ?? '') === '57014') return true
  const message = [candidate.message, candidate.details]
    .map(value => String(value ?? ''))
    .join(' ')
    .toLowerCase()
  return /statement timeout|canceling statement|query timeout|timed out/.test(message)
}

/** Return a smaller retry size only for a confirmed timeout; never silently retry validation/auth errors. */
export function nextBatchSizeAfterTimeout(
  error: unknown,
  currentSize: number,
  minimumSize = MIN_IMPORT_BATCH_SIZE,
): number | null {
  if (!isStatementTimeout(error) || !Number.isInteger(currentSize) || !Number.isInteger(minimumSize)) return null
  if (currentSize <= minimumSize || minimumSize < 1) return null
  return Math.max(minimumSize, Math.floor(currentSize / 2))
}
