'use client'

import { useEffect, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'

type Row = { no_rm: string; nama_pasien: string | null; total_episode: number; unit_terakhir: string | null; diagnosis_terakhir: string | null; last_seen: string | null; readmisi_30: number; readmisi_terakhir: string | null; total_count: number }
const PAGE = 50
const fmtDate = (d: string | null) => d ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(d + 'T00:00:00')) : '—'

/** Tab Readmisi pada Pola Perawatan: pasien dengan rawat inap ulang ≤30 hari (perkiraan dari Logbook). */
export default function PatientReadmissionPanel({ room, year }: { room: string; year: string }) {
  const [page, setPage] = useState(0)
  const [revision, setRevision] = useState(0)
  const [result, setResult] = useState<{ request: string; rows: Row[]; error?: string } | null>(null)
  const request = JSON.stringify([room, year, page, revision])
  const current = result?.request === request ? result : null
  const loading = current === null
  const error = current?.error
  const rows = current?.rows ?? []
  const total = rows[0]?.total_count ?? 0

  useEffect(() => {
    const controller = new AbortController()
    void (async () => {
      try {
        const { data, error } = await aurekaSupabase.rpc('aureka_patient_index_search_v2', {
          p_query: null, p_filter: 'readmisi30', p_room: room ? Number(room) : null,
          p_from: `${year}-01-01`, p_to: `${year}-12-31`, p_limit: PAGE, p_offset: page * PAGE,
        }).abortSignal(controller.signal)
        if (error) throw error
        if (!Array.isArray(data) || !data.every(row =>
          row && typeof row.no_rm === 'string' &&
          Number.isSafeInteger(row.readmisi_30) && row.readmisi_30 > 0 &&
          Number.isSafeInteger(row.total_count) && row.total_count >= data.length
        )) throw new Error('Daftar readmisi belum tersedia.')
        if (controller.signal.aborted) return
        if (data.length === 0 && page > 0) {
          setPage(0)
          return
        }
        setResult({ request, rows: data as Row[] })
      } catch (cause) {
        if (!controller.signal.aborted) {
          setResult({ request, rows: [], error: toUserFacingError(cause, { fallback: 'Data readmisi belum dapat dimuat.' }) })
        }
      }
    })()
    return () => controller.abort()
  }, [request, room, year, page])

  const events = rows.reduce((s, r) => s + r.readmisi_30, 0)

  return <div className="pmaReadmit">
    <div className="pmaKpis pmaKpis3">
      <article><span>Pasien dengan readmisi ≤30 hari</span><strong>{loading ? '…' : error ? '-' : total.toLocaleString('id-ID')}</strong><small>Kunjungan terakhir di {year}</small></article>
      <article><span>Kejadian readmisi (halaman ini)</span><strong>{loading ? '…' : error ? '-' : events.toLocaleString('id-ID')}</strong><small>Jumlah jeda 1–30 hari antar rawat inap</small></article>
      <article><span>Definisi</span><strong className="pmaDef">≤ 30 hari</strong><small>Dua episode rawat inap pasien yang sama berjarak 1–30 hari</small></article>
    </div>
    {error && <div className="prAlert" role="alert">{error}</div>}
    <section className="prPanel">
      <h3>Daftar pasien readmisi</h3>
      <button type="button" className="prButton" disabled={loading} onClick={() => setRevision(value => value + 1)}>
        {loading ? 'Memuat…' : 'Muat ulang'}
      </button>
      <p>Diurutkan dari kunjungan terakhir. Ini perkiraan dari Logbook (episode yang punya tanggal keluar), bukan pengganti indikator readmisi resmi SIMRS. Telusuri kasusnya untuk menilai apakah readmisi direncanakan atau tidak.</p>
      {loading && !rows.length ? <p className="prEmpty">Memuat…</p> : rows.length ? <div className="prTableWrap"><table className="prTable">
        <thead><tr><th>No. RM</th><th>Nama</th><th>Readmisi</th><th>Readmisi terakhir</th><th>Unit terakhir</th><th>Diagnosis terakhir</th><th>Total episode</th></tr></thead>
        <tbody>{rows.map((r) => <tr key={r.no_rm}><td><b>{r.no_rm}</b></td><td>{r.nama_pasien || '—'}</td><td><span className="pmaReadmitBadge">{r.readmisi_30}×</span></td><td>{fmtDate(r.readmisi_terakhir)}</td><td>{r.unit_terakhir || '—'}</td><td>{r.diagnosis_terakhir || '—'}</td><td>{r.total_episode}</td></tr>)}</tbody>
      </table></div> : !error && <p className="prEmpty">Tidak ada pasien dengan readmisi ≤30 hari pada filter ini.</p>}
      {total > PAGE && <div className="pmaPager">
        <button type="button" className="prButton" disabled={page === 0 || loading} onClick={() => setPage((p) => p - 1)}>Sebelumnya</button>
        <span>{page * PAGE + 1}–{Math.min(total, (page + 1) * PAGE)} dari {total.toLocaleString('id-ID')}</span>
        <button type="button" className="prButton" disabled={(page + 1) * PAGE >= total || loading} onClick={() => setPage((p) => p + 1)}>Berikutnya</button>
      </div>}
    </section>
  </div>
}
