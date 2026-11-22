export type PageResponse<T> = {
  data: T[] | null
  error: unknown | null
}

export type PageReader<T> = (from: number, to: number) => PromiseLike<PageResponse<T>>

/**
 * Reads a complete, deterministically ordered Supabase query in bounded pages.
 * The caller must add stable order clauses before applying range(from, to).
 */
export async function readAllPages<T>(readPage: PageReader<T>, pageSize = 500): Promise<T[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError('pageSize harus berupa bilangan bulat positif.')
  }

  const rows: T[] = []
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await readPage(from, from + pageSize - 1)
    if (error) throw error

    const batch = data ?? []
    if (!Array.isArray(batch)) {
      throw new TypeError('Hasil query berpaginasi bukan berupa array.')
    }

    rows.push(...batch)
    if (batch.length < pageSize) return rows
  }
}

/** Read at most a fixed number of rows and distinguish an exact fit from a truncated result. */
export async function readPagesWithLimit<T>(
  readPage: PageReader<T>,
  limit: number,
  pageSize = 500,
): Promise<{ rows: T[]; capped: boolean }> {
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1) {
    throw new RangeError('Batas data dan ukuran halaman harus berupa bilangan bulat positif.')
  }

  const rows: T[] = []
  for (let from = 0; from < limit; from += pageSize) {
    const count = Math.min(pageSize, limit - from)
    const { data, error } = await readPage(from, from + count - 1)
    if (error) throw error
    rows.push(...(data ?? []))
    if ((data?.length ?? 0) < count) return { rows, capped: false }
  }

  const { data, error } = await readPage(limit, limit)
  if (error) throw error
  return { rows, capped: !!data?.length }
}
