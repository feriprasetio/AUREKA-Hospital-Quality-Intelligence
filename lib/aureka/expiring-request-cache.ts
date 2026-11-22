/**
 * Shares a single in-flight read and a short-lived successful result.
 * Only use for information that is safe to reuse across visitors (e.g. approved
 * public portal aggregates). Do not cache authenticated or patient data here.
 */
export function createExpiringRequestCache<T>(
  loader: () => Promise<T>,
  ttlMs: number,
  now: () => number = Date.now,
): { load: () => Promise<T> } {
  if (!Number.isFinite(ttlMs) || ttlMs < 0) {
    throw new RangeError('ttlMs must be a finite, non-negative number')
  }

  let cached: { value: T; expiresAt: number } | null = null
  let inFlight: Promise<T> | null = null

  return {
    load(): Promise<T> {
      if (cached && now() < cached.expiresAt) return Promise.resolve(cached.value)
      if (inFlight) return inFlight

      let request: Promise<T>
      request = Promise.resolve()
        .then(loader)
        .then(value => {
          cached = { value, expiresAt: now() + ttlMs }
          return value
        })
        .finally(() => {
          if (inFlight === request) inFlight = null
        })

      inFlight = request
      return request
    },
  }
}
