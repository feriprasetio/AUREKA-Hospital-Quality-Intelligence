import { aurekaSupabase } from '@/lib/aureka/supabase'

export type RoomMonthCount = { room_id: number; month: number | null; measurement_grain: string; total: number }

/**
 * Jumlah catatan mutu per unit per bulan.
 * Utama: fungsi database `aureka_quality_room_month_counts` (cepat, dihitung di server).
 * Cadangan bila fungsi belum dipasang: baca bertahap dengan keyset (id > terakhir) — akurat,
 * tidak terpotong seperti paginasi offset yang kehabisan waktu setelah ±4.000 baris.
 */
const CACHE_MS = 10 * 60 * 1000
const cache = new Map<string, { at: number; rows: RoomMonthCount[] }>()

export async function fetchRoomMonthCounts(year: number, grain?: string): Promise<RoomMonthCount[]> {
  const cacheKey = year + '|' + (grain ?? '*')
  const hit = cache.get(cacheKey)
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.rows
  const rows = await loadRoomMonthCounts(year, grain)
  cache.set(cacheKey, { at: Date.now(), rows })
  return rows
}

async function loadRoomMonthCounts(year: number, grain?: string): Promise<RoomMonthCount[]> {
  const rpc = await aurekaSupabase.rpc('aureka_quality_room_month_counts', { p_year: year, p_grain: grain ?? null })
  if (!rpc.error && Array.isArray(rpc.data)) {
    return (rpc.data as RoomMonthCount[]).map((r) => ({ ...r, room_id: Number(r.room_id), total: Number(r.total) }))
  }
  const counts = new Map<string, RoomMonthCount>()
  let last: string | null = null
  for (let page = 0; page < 100; page++) {
    let q: any = aurekaSupabase.schema('aureka_quality').from('quality_records')
      .select('id,room_id,record_date,period_start,measurement_grain')
      .eq('profile_year', year).is('archived_at', null).neq('status', 'archived')
      .order('id', { ascending: true }).limit(1000)
    if (grain) q = q.eq('measurement_grain', grain)
    if (last) q = q.gt('id', last)
    const { data, error } = await q
    if (error || !data) break
    for (const row of data as { id: string; room_id: number; record_date: string | null; period_start: string | null; measurement_grain: string }[]) {
      const d = row.record_date || row.period_start || ''
      const month = d ? Number(d.slice(5, 7)) : null
      const key = row.room_id + '|' + month + '|' + row.measurement_grain
      const hit = counts.get(key)
      if (hit) hit.total++
      else counts.set(key, { room_id: Number(row.room_id), month, measurement_grain: row.measurement_grain, total: 1 })
    }
    if (data.length < 1000) break
    last = data[data.length - 1].id
  }
  return [...counts.values()]
}
