'use client'

import { useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { fetchRoomMonthCounts, type RoomMonthCount } from '@/lib/aureka/quality-counts'

/**
 * Pasien › Statistik (Blueprint v2 §12): volume pasien vs episode, pola per bulan, unit, dan diagnosis.
 * Jumlah PASIEN (No. RM unik) dan jumlah EPISODE dipisahkan agar tidak terjadi double counting.
 * Baca-saja; seluruh angka dihitung di database sesuai hak akses unit.
 */
type Room = { id: number; name: string }
type UnitStats = { allowed?: boolean; episodes: number; active: number; avg_los: number | null; los_count: number; months: { month: number; count: number }[]; top: { code: string; diagnosis: string; count: number }[] }
type IndexSummary = { total: number; kunjungan_berulang: number; dengan_nik: number; terhubung_simrs: number; terakhir_diperbarui: string | null }

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const fmt = (n: number | null | undefined) => (n == null ? '—' : Number(n).toLocaleString('id-ID'))

export default function PatientStatsTab({ rooms, roomId, year, onYearChange }: { rooms: Room[]; roomId: number | null; year: number; onYearChange: (y: number) => void }) {
  const [counts, setCounts] = useState<RoomMonthCount[]>([])
  const [unit, setUnit] = useState<UnitStats | null>(null)
  const [summary, setSummary] = useState<IndexSummary | null>(null)
  const [loading, setLoading] = useState({ counts: true, summary: true, unit: true })
  const [error, setError] = useState('')
  const roomName = useMemo(() => new Map(rooms.map((r) => [Number(r.id), r.name])), [rooms])

  // Tiga sumber dimuat paralel dan ditampilkan begitu masing-masing selesai (tidak saling menunggu).
  useEffect(() => {
    let cancelled = false
    setLoading({ counts: true, summary: true, unit: Boolean(roomId) })
    setError('')
    const done = (k: 'counts' | 'summary' | 'unit') => { if (!cancelled) setLoading((l) => ({ ...l, [k]: false })) }
    const summaryKey = 'aureka-ps-summary'
    try { const c = JSON.parse(sessionStorage.getItem(summaryKey) || 'null'); if (c && Date.now() - c.at < 10 * 60 * 1000) { setSummary(c.data); done('summary') } } catch { /* abaikan */ }
    aurekaSupabase.rpc('aureka_patient_index_summary').then(({ data, error: e }) => {
      if (cancelled) return
      setSummary(!e && data ? (data as IndexSummary) : null)
      try { if (!e && data) sessionStorage.setItem(summaryKey, JSON.stringify({ at: Date.now(), data })) } catch { /* abaikan */ }
      done('summary')
    })
    fetchRoomMonthCounts(year, 'patient_episode').then((all) => {
      if (cancelled) return
      setCounts(all.filter((r) => r.measurement_grain === 'patient_episode' || !r.measurement_grain)); done('counts')
    }).catch((e) => { if (!cancelled) { setError(e instanceof Error ? e.message : 'Statistik belum dapat dimuat.'); done('counts') } })
    if (roomId) aurekaSupabase.rpc('aureka_patient_episode_stats', { p_room: roomId, p_year: year }).then(({ data, error: e }) => {
      if (cancelled) return
      setUnit(!e && data && (data as UnitStats).allowed !== false ? (data as UnitStats) : null); done('unit')
    })
    else setUnit(null)
    return () => { cancelled = true }
  }, [roomId, year])

  const scoped = roomId ? counts.filter((r) => r.room_id === roomId) : counts
  const episodes = scoped.reduce((a, r) => a + r.total, 0)
  const byMonth = MONTHS.map((_, i) => scoped.filter((r) => r.month === i + 1).reduce((a, r) => a + r.total, 0))
  const maxMonth = Math.max(1, ...byMonth)
  const byUnit = Array.from(scoped.reduce((m, r) => m.set(r.room_id, (m.get(r.room_id) || 0) + r.total), new Map<number, number>())).sort((a, b) => b[1] - a[1])
  const maxUnit = Math.max(1, ...byUnit.map(([, n]) => n))

  return (
    <section className="psStats" aria-label="Statistik pasien">
      <div className="psStatsHead">
        <div>
          <h3>Statistik Pasien</h3>
          <p>Jumlah <b>pasien</b> (No. RM unik) dan jumlah <b>episode</b> (kunjungan) dihitung terpisah. Satu pasien bisa memiliki beberapa episode.</p>
        </div>
        <label className="psStatsYear">Tahun
          <select value={year} onChange={(e) => onYearChange(Number(e.target.value))}>
            {[0, 1, 2, 3].map((d) => new Date().getFullYear() - d).map((y) => <option key={y} value={y}>{y}</option>)}
          </select>
        </label>
      </div>

      {error && <div className="psStatsNote error" role="alert">{error}</div>}
      {<>
        <div className="prKpis">
          <div className="prKpi"><span>Pasien unik (No. RM) · semua unit yang dapat Anda akses</span><strong>{loading.summary ? <span className="psSkel" /> : fmt(summary?.total)}</strong></div>
          <div className="prKpi"><span>Pasien dengan kunjungan berulang</span><strong>{loading.summary ? <span className="psSkel" /> : fmt(summary?.kunjungan_berulang)}</strong></div>
          <div className="prKpi"><span>Episode {year}{roomId ? ' · ' + (roomName.get(roomId) || 'unit') : ' · semua unit'}</span><strong>{loading.counts ? <span className="psSkel" /> : fmt(episodes)}</strong></div>
          {unit ? <div className="prKpi"><span>Rerata lama rawat (hari) · {fmt(unit.los_count)} episode berdata LOS</span><strong>{unit.avg_los == null ? '—' : unit.avg_los.toFixed(1).replace('.', ',')}</strong></div>
            : <div className="prKpi"><span>{roomId ? 'Rerata lama rawat (hari)' : 'Unit dengan episode ' + year}</span><strong>{(roomId ? loading.unit : loading.counts) ? <span className="psSkel" /> : roomId ? '—' : fmt(byUnit.length)}</strong></div>}
        </div>
        {!summary && !loading.summary && <div className="psStatsNote">Jumlah pasien unik tersedia setelah Database Pasien (indeks No. RM) dipasang.</div>}

        <div className="psStatsCard">
          <h4>Episode per bulan · {year}{loading.counts && <small className="psLoadingHint"> · memuat…</small>}</h4>
          <div className="psStatsBars" role="img" aria-label={'Episode per bulan ' + byMonth.map((n, i) => MONTHS[i] + ' ' + n).join(', ')}>
            {byMonth.map((n, i) => <div key={i} className="psStatsBar" title={MONTHS[i] + ': ' + fmt(n) + ' episode'}><i style={{ height: (n / maxMonth * 100) + '%' }} /><span>{MONTHS[i]}</span><b>{n ? fmt(n) : ''}</b></div>)}
          </div>
        </div>

        {!roomId && <div className="psStatsCard">
          <h4>Episode per unit · {year}</h4>
          <div className="psStatsRows">
            {byUnit.length ? byUnit.map(([id, n]) => <div key={id} className="psStatsRow"><span>{roomName.get(id) || 'Unit ' + id}</span><div><i style={{ width: (n / maxUnit * 100) + '%' }} /></div><b>{fmt(n)}</b></div>) : <p className="psStatsNote">Belum ada episode pada tahun ini.</p>}
          </div>
        </div>}

        {unit && unit.top?.length > 0 && <div className="psStatsCard">
          <h4>Diagnosis terbanyak · {roomName.get(roomId || 0) || 'unit'} · {year}</h4>
          <table className="psStatsTable"><thead><tr><th>Kode</th><th>Diagnosis</th><th>Episode</th></tr></thead><tbody>
            {unit.top.map((t, i) => <tr key={i}><td>{t.code}</td><td>{t.diagnosis}</td><td>{fmt(t.count)}</td></tr>)}
          </tbody></table>
        </div>}
        {!roomId && <div className="psStatsNote">Pilih satu unit untuk melihat lama rawat dan diagnosis terbanyak.</div>}
      </>}
    </section>
  )
}
