'use client'
import { useCallback, useEffect, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'

/**
 * Database Pasien (Master Patient Index).
 * Satu baris per pasien dengan No. Rekam Medis sebagai kunci utama (format XX-XX-XX),
 * diisi otomatis dari Logbook episode pasien dan disiapkan untuk bridging SIMRS / SATUSEHAT.
 * Spesifikasi: docs/SPEC-BRIDGING-SIMRS.md
 */
type PatientRow = {
  no_rm: string
  nama_pasien: string | null
  nik: string | null
  no_ihs: string | null
  simrs_patient_id: string | null
  tanggal_lahir: string | null
  jenis_kelamin: string | null
  first_seen: string | null
  last_seen: string | null
  total_episode: number
  unit_terakhir: string | null
  diagnosis_terakhir: string | null
  bridging_status: string
  bridging_at: string | null
  total_count: number
}
type Summary = { total: number; kunjungan_berulang: number; dengan_nik: number; terhubung_simrs: number; terakhir_diperbarui: string | null }
type InvalidRm = { record_id: string; room_name: string; record_date: string | null; no_rm_asli: string | null }

const PAGE = 50
const BRIDGING_LABEL: Record<string, string> = {
  belum_terhubung: 'Belum terhubung', menunggu: 'Menunggu', terhubung: 'Terhubung', gagal: 'Gagal', konflik: 'Konflik data',
}
const fmt = (d: string | null) => d ? new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(d + 'T00:00:00')) : '—'
const maskName = (v: string | null) => (v || '').split(/\s+/).filter(Boolean).map((p) => p[0] + '•••').join(' ') || '—'
const maskNik = (v: string | null) => v ? v.slice(0, 4) + '••••••••' + v.slice(-4) : '—'

export default function PatientIndexTab({ isAdmin }: { isAdmin: boolean }) {
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState<PatientRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notReady, setNotReady] = useState(false)
  const [showIdentity, setShowIdentity] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [note, setNote] = useState('')
  const [invalid, setInvalid] = useState<InvalidRm[] | null>(null)
  const [showSpec, setShowSpec] = useState(false)

  useEffect(() => { const t = window.setTimeout(() => { setQuery(search.trim()); setPage(0) }, 400); return () => window.clearTimeout(t) }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const [list, sum] = await Promise.all([
      aurekaSupabase.rpc('aureka_patient_index_search', { p_query: query || null, p_limit: PAGE, p_offset: page * PAGE }),
      aurekaSupabase.rpc('aureka_patient_index_summary'),
    ])
    setLoading(false)
    const missing = (e: { code?: string; message?: string } | null) => Boolean(e && (e.code === 'PGRST202' || /Could not find the function|schema cache/i.test(e.message || '')))
    if (missing(list.error) || missing(sum.error)) { setNotReady(true); setRows([]); return }
    setNotReady(false)
    if (list.error) { setError(toUserFacingError(list.error, { fallback: 'Database pasien belum dapat dimuat.' })); setRows([]); return }
    setRows((list.data ?? []) as PatientRow[])
    if (!sum.error) setSummary(sum.data as Summary)
  }, [page, query])
  useEffect(() => { void load() }, [load])

  const total = rows[0]?.total_count ?? 0
  const sync = async () => {
    setSyncing(true); setNote('')
    const { data, error: e } = await aurekaSupabase.rpc('aureka_patient_index_sync')
    setSyncing(false)
    setNote(e ? toUserFacingError(e, { fallback: 'Sinkronisasi gagal.' }) : `Sinkron selesai: ${Number(data ?? 0).toLocaleString('id-ID')} pasien diperbarui dari Logbook.`)
    if (!e) void load()
  }
  const loadInvalid = async () => {
    const { data, error: e } = await aurekaSupabase.rpc('aureka_patient_index_invalid_rm', { p_limit: 100 })
    setInvalid(e ? [] : (data ?? []) as InvalidRm[])
  }

  if (notReady) return <section className="piPanel">
    <h3>Database Pasien belum diaktifkan</h3>
    <p>Struktur database pasien (No. Rekam Medis sebagai kunci utama) perlu dipasang sekali oleh pemilik Supabase: jalankan
      <code> supabase/migrations/20261111140000_patient_index.sql</code> di SQL Editor. Setelah itu daftar pasien terisi otomatis dari Logbook yang sudah ada.</p>
  </section>

  return <section className="piWrap">
    <header className="piHead">
      <div>
        <h3>Database Pasien</h3>
        <p>Indeks pasien unik dengan <b>No. Rekam Medis</b> sebagai kunci utama, diisi otomatis dari Logbook semua unit. Disiapkan untuk bridging SIMRS / SATUSEHAT.</p>
      </div>
      <div className="piActions">
        <button type="button" className="prButton" onClick={() => setShowIdentity((v) => !v)}>{showIdentity ? 'Samarkan identitas' : 'Tampilkan identitas'}</button>
        <button type="button" className="prButton" onClick={() => setShowSpec((v) => !v)}>{showSpec ? 'Tutup spesifikasi' : 'Spesifikasi bridging'}</button>
        {isAdmin && <button type="button" className="prButton primary" disabled={syncing} onClick={() => void sync()}>{syncing ? 'Menyinkronkan…' : 'Sinkron ulang dari Logbook'}</button>}
      </div>
    </header>
    {note && <div className="prAlert" role="status">{note}</div>}

    {showSpec && <div className="piPanel piSpec">
      <h4>Spesifikasi data &amp; bridging SIMRS</h4>
      <ul>
        <li><b>Kunci utama:</b> No. RM dinormalisasi ke 6 digit <code>XX-XX-XX</code> (nol depan dikembalikan; 36539 = 03-65-39). 7–12 digit disimpan angka saja.</li>
        <li><b>Ditolak sebagai No. RM:</b> nilai berisi huruf atau berbentuk tanggal (mis. hasil salah format Excel) — tampil di daftar &ldquo;No. RM bermasalah&rdquo;.</li>
        <li><b>Kolom dari AUREKA:</b> nama, kunjungan pertama/terakhir, jumlah episode, unit &amp; diagnosis terakhir.</li>
        <li><b>Kolom diisi SIMRS saat bridging:</b> NIK (16 digit), No. IHS SATUSEHAT, ID pasien SIMRS, tanggal lahir, jenis kelamin (L/P), alamat, telepon.</li>
        <li><b>Status bridging:</b> Belum terhubung → Menunggu → Terhubung / Gagal / Konflik data.</li>
        <li><b>Pemetaan FHIR (SATUSEHAT Patient):</b> identifier No. RM (sistem RS), identifier NIK &amp; IHS, name, gender, birthDate, address, telecom.</li>
        <li><b>Keamanan:</b> tabel hanya lewat fungsi berizin; pengguna unit hanya melihat pasien yang pernah dilayani di unitnya; identitas disamarkan secara bawaan.</li>
      </ul>
      <p className="prMuted">Dokumen lengkap: docs/SPEC-BRIDGING-SIMRS.md di repositori AUREKA.</p>
    </div>}

    <div className="prKpis">
      <div className="prKpi"><span>Pasien unik (No. RM)</span><strong>{(summary?.total ?? 0).toLocaleString('id-ID')}</strong></div>
      <div className="prKpi"><span>Kunjungan berulang</span><strong>{(summary?.kunjungan_berulang ?? 0).toLocaleString('id-ID')}</strong></div>
      <div className="prKpi"><span>Sudah ada NIK</span><strong>{(summary?.dengan_nik ?? 0).toLocaleString('id-ID')}</strong></div>
      <div className="prKpi"><span>Terhubung SIMRS</span><strong>{(summary?.terhubung_simrs ?? 0).toLocaleString('id-ID')}</strong></div>
    </div>

    <div className="prPanel prFilters">
      <label className="prSearch">Cari No. RM, nama, atau NIK
        <input type="search" name="aureka-patient-index-search" autoComplete="off" data-lpignore="true" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="mis. 03-65-39, 36539, atau nama pasien" />
      </label>
      <button type="button" className="prButton" onClick={() => void loadInvalid()}>No. RM bermasalah</button>
    </div>

    {invalid && <div className="piPanel">
      <h4>Episode dengan No. RM kosong / tidak valid ({invalid.length}{invalid.length >= 100 ? '+' : ''})</h4>
      {invalid.length ? <div className="prTableWrap"><table className="prTable"><thead><tr><th>Unit</th><th>Tanggal</th><th>Isi No. RM</th></tr></thead>
        <tbody>{invalid.map((r) => <tr key={r.record_id}><td>{r.room_name}</td><td>{fmt(r.record_date)}</td><td><code>{r.no_rm_asli || '(kosong)'}</code></td></tr>)}</tbody></table></div>
        : <p className="prMuted">Tidak ada. Semua episode punya No. RM yang valid.</p>}
      <p className="prMuted">Perbaiki di Logbook unit terkait; indeks pasien ikut diperbarui otomatis.</p>
    </div>}

    {error && <div className="prAlert" role="alert">{error}</div>}
    <div className="prPanel">
      <div className="prTableWrap">
        <table className="prTable">
          <thead><tr><th>No. RM</th><th>Nama Pasien</th><th>NIK</th><th>Kunjungan</th><th>Pertama</th><th>Terakhir</th><th>Unit terakhir</th><th>Diagnosis terakhir</th><th>Bridging SIMRS</th></tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={9}><div className="prEmpty">Memuat database pasien…</div></td></tr>
              : rows.length ? rows.map((r) => <tr key={r.no_rm}>
                <td><b className="piRm">{r.no_rm}</b></td>
                <td>{showIdentity ? r.nama_pasien || '—' : maskName(r.nama_pasien)}</td>
                <td>{showIdentity ? r.nik || '—' : maskNik(r.nik)}</td>
                <td>{r.total_episode.toLocaleString('id-ID')}</td>
                <td>{fmt(r.first_seen)}</td><td>{fmt(r.last_seen)}</td>
                <td>{r.unit_terakhir || '—'}</td><td>{r.diagnosis_terakhir || '—'}</td>
                <td><span className={'piBridge ' + r.bridging_status}>{BRIDGING_LABEL[r.bridging_status] || r.bridging_status}</span></td>
              </tr>) : <tr><td colSpan={9}><div className="prEmpty">{query ? 'Tidak ada pasien yang cocok.' : 'Belum ada pasien di database.'}</div></td></tr>}
          </tbody>
        </table>
      </div>
      <footer className="prFoot">
        <span className="prMuted">{total ? `Menampilkan ${page * PAGE + 1}–${page * PAGE + rows.length} dari ${total.toLocaleString('id-ID')} pasien` : ''}</span>
        <div className="prActions">
          <button className="prButton" type="button" disabled={page <= 0 || loading} onClick={() => setPage((v) => Math.max(0, v - 1))}>Sebelumnya</button>
          <span className="prMuted">Halaman {page + 1} / {Math.max(1, Math.ceil(total / PAGE))}</span>
          <button className="prButton" type="button" disabled={(page + 1) * PAGE >= total || loading} onClick={() => setPage((v) => v + 1)}>Berikutnya</button>
        </div>
      </footer>
    </div>
    <style>{`
      .piWrap{display:grid;gap:16px}.piHead{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start}
      .piHead h3{margin:0;font-size:20px}.piHead p{margin:6px 0 0;font-size:12.5px;color:#5b6b7c;max-width:640px;line-height:1.55}
      .piActions{display:flex;gap:8px;flex-wrap:wrap}
      .piPanel{padding:16px 18px;border-radius:16px;border:1px solid rgba(11,70,122,.14);background:rgba(255,255,255,.7)}
      .piPanel h3,.piPanel h4{margin:0 0 8px}.piPanel p{margin:6px 0;font-size:12.5px;line-height:1.55}
      .piSpec ul{margin:6px 0;padding-left:18px;font-size:12.5px;line-height:1.6}
      .piRm{font-variant-numeric:tabular-nums;letter-spacing:.02em}
      .piBridge{display:inline-flex;padding:4px 9px;border-radius:999px;font-size:10.5px;font-weight:800;background:#eef2f7;color:#4a5b6d;white-space:nowrap}
      .piBridge.terhubung{background:#e3f4ea;color:#1f6b43}.piBridge.menunggu{background:#fff4e0;color:#8a5a12}
      .piBridge.gagal,.piBridge.konflik{background:#fde8e8;color:#9b2c2c}
      html[data-mode="gelap"] .piPanel{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1)}
      html[data-mode="gelap"] .piHead p{color:#9fb3c8}
    `}</style>
  </section>
}
