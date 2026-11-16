'use client'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import { requestSensitiveAccess } from '@/lib/aureka/sensitive-access'

/**
 * Database Pasien (Master Patient Index).
 * Satu baris per pasien dengan No. Rekam Medis sebagai kunci utama (format XX-XX-XX),
 * diisi otomatis dari Logbook episode pasien dan disiapkan untuk bridging SIMRS / SATUSEHAT.
 * Spesifikasi: docs/SPEC-BRIDGING-SIMRS.md
 *
 * v2 (bila migrasi 20261115090000 sudah dijalankan): filter cepat, penanda readmisi ≤30 hari,
 * dan ringkasan seluruh populasi. Tanpa migrasi itu halaman tetap jalan dengan fungsi v1.
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
  readmisi_30?: number | null
  readmisi_terakhir?: string | null
  total_count: number
}
type Summary = {
  total: number; kunjungan_berulang: number; dengan_nik: number; terhubung_simrs: number; terakhir_diperbarui: string | null
  readmisi_30?: number; dengan_ihs?: number; dengan_simrs_id?: number; dengan_nama?: number; bridging?: Record<string, number>
}
type InvalidRm = { record_id: string; room_name: string; record_date: string | null; no_rm_asli: string | null }
type Episode = { id: string; unit: string | null; record_date: string | null; masuk: string | null; keluar: string | null; diagnosis: string | null; dpjp: string | null; los: string | null; rawat_inap: boolean | null; no_rm_norm: string | null }
type Room = { id: number; name: string }
type Filter = 'semua' | 'berulang' | 'readmisi30'

const PAGE = 50
const BRIDGING = [
  { key: 'belum_terhubung', label: 'Belum terhubung' },
  { key: 'menunggu', label: 'Menunggu' },
  { key: 'terhubung', label: 'Terhubung' },
  { key: 'gagal', label: 'Gagal' },
  { key: 'konflik', label: 'Konflik data' },
]
const BRIDGING_LABEL: Record<string, string> = Object.fromEntries(BRIDGING.map((b) => [b.key, b.label]))
const toDate = (d: string) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(d) ? d + 'T00:00:00' : d)
const fmt = (d: string | null) => {
  if (!d) return '-'
  const date = toDate(d)
  return Number.isNaN(date.getTime()) ? d : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}
const fmtShort = (d: string | null) => d ? new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' }).format(toDate(d)) : '-'
const maskName = (v: string | null) => (v || '').split(/\s+/).filter(Boolean).map((p) => p[0] + '•••').join(' ') || '-'
const maskNik = (v: string | null) => v ? v.slice(0, 4) + '••••••••' + v.slice(-4) : '-'
const isMissingFn = (e: { code?: string; message?: string } | null) => Boolean(e && (e.code === 'PGRST202' || /Could not find the function|schema cache/i.test(e.message || '')))
const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 86_400_000)

export default function PatientIndexTab({ isAdmin, rooms = [] }: { isAdmin: boolean; rooms?: Room[] }) {
  const [search, setSearch] = useState('')
  useEffect(() => { const receive = (event: Event) => { const detail = (event as CustomEvent<{ query?: string }>).detail; setSearch(String(detail?.query ?? '')); setPage(0) }; window.addEventListener('aureka:workspace-search', receive); return () => window.removeEventListener('aureka:workspace-search', receive) }, [])
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [filter, setFilter] = useState<Filter>('semua')
  const [roomId, setRoomId] = useState<number | null>(null)
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [rows, setRows] = useState<PatientRow[]>([])
  const [summary, setSummary] = useState<Summary | null>(null)
  const [v2, setV2] = useState<boolean | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notReady, setNotReady] = useState(false)
  const [showIdentity, setShowIdentity] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [note, setNote] = useState('')
  const [invalid, setInvalid] = useState<InvalidRm[] | null>(null)
  const [showSpec, setShowSpec] = useState(false)
  const [detail, setDetail] = useState<PatientRow | null>(null)

  useEffect(() => { const t = window.setTimeout(() => { setQuery(search.trim()); setPage(0) }, 400); return () => window.clearTimeout(t) }, [search])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const useV2 = v2 !== false
    const [list, sum] = await Promise.all([
      useV2
        ? aurekaSupabase.rpc('aureka_patient_index_search_v2', { p_query: query || null, p_filter: filter, p_room: roomId, p_from: from || null, p_to: to || null, p_limit: PAGE, p_offset: page * PAGE })
        : aurekaSupabase.rpc('aureka_patient_index_search', { p_query: query || null, p_limit: PAGE, p_offset: page * PAGE }),
      useV2 ? aurekaSupabase.rpc('aureka_patient_index_overview') : aurekaSupabase.rpc('aureka_patient_index_summary'),
    ])
    if (useV2 && (isMissingFn(list.error) || isMissingFn(sum.error))) { setV2(false); return } // muat ulang lewat v1
    if (useV2 && v2 === null) setV2(true)
    setLoading(false)
    if (isMissingFn(list.error) || isMissingFn(sum.error)) { setNotReady(true); setRows([]); return }
    setNotReady(false)
    if (list.error) { setError(toUserFacingError(list.error, { fallback: 'Database pasien belum dapat dimuat.' })); setRows([]); return }
    setRows((list.data ?? []) as PatientRow[])
    if (!sum.error) setSummary(sum.data as Summary)
  }, [page, query, filter, roomId, from, to, v2])
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
  const toggleIdentity = async () => {
    if (showIdentity) { setShowIdentity(false); return }
    if (await requestSensitiveAccess('patient_identity', 'metadata-pasien', 'Tampilkan identitas pasien')) setShowIdentity(true)
  }

  // Kolom yang seluruh isinya kosong (SIMRS belum tersambung) disembunyikan; muncul lagi otomatis saat datanya ada.
  const showNik = Boolean((summary?.dengan_nik ?? 0) > 0 || rows.some((r) => r.nik))
  const showBridge = Boolean((summary?.terhubung_simrs ?? 0) > 0 || rows.some((r) => r.bridging_status && r.bridging_status !== 'belum_terhubung'))
  const colCount = 5 + (showNik ? 1 : 0) + (showBridge ? 1 : 0)
  const setFilterAndReset = (next: Filter) => { setFilter(next); setPage(0) }

  // Ringkasan: v2 menghitung seluruh populasi; v1 hanya halaman tabel (diberi label jelas).
  const population = v2 === true && summary?.bridging != null
  const base = population ? Math.max(1, summary?.total ?? 0) : Math.max(1, rows.length)
  const bridgeCounts = BRIDGING.map((b) => ({ ...b, count: population ? Number(summary?.bridging?.[b.key] ?? 0) : rows.filter((r) => r.bridging_status === b.key).length }))
  const completeness = population
    ? [
        { label: 'Nama pasien', count: summary?.dengan_nama ?? 0 },
        { label: 'NIK', count: summary?.dengan_nik ?? 0 },
        { label: 'No. IHS', count: summary?.dengan_ihs ?? 0 },
        { label: 'ID pasien SIMRS', count: summary?.dengan_simrs_id ?? 0 },
      ]
    : [
        { label: 'Nama pasien', count: rows.filter((r) => Boolean(r.nama_pasien?.trim())).length },
        { label: 'NIK', count: rows.filter((r) => Boolean(r.nik?.trim())).length },
        { label: 'No. IHS', count: rows.filter((r) => Boolean(r.no_ihs?.trim())).length },
        { label: 'ID pasien SIMRS', count: rows.filter((r) => Boolean(r.simrs_patient_id?.trim())).length },
      ]
  const pct = (n: number) => Math.round((n / base) * 1000) / 10

  if (notReady) return <section className="piPanel">
    <h3>Metadata Pasien belum diaktifkan</h3>
    <p>Struktur database pasien (No. Rekam Medis sebagai kunci utama) perlu dipasang sekali oleh pemilik Supabase: jalankan
      <code> supabase/migrations/20261111140000_patient_index.sql</code> di SQL Editor. Setelah itu daftar pasien terisi otomatis dari Logbook yang sudah ada.</p>
  </section>

  const chips: { key: Filter; label: string; count?: number; needsV2?: boolean }[] = [
    { key: 'semua', label: 'Semua pasien', count: summary?.total },
    { key: 'berulang', label: 'Kunjungan berulang', count: summary?.kunjungan_berulang, needsV2: true },
    { key: 'readmisi30', label: 'Readmisi ≤30 hari', count: summary?.readmisi_30, needsV2: true },
  ]

  return <section className="piWrap">
    <header className="piHead">
      <p className="psStatsLead" title="Diisi otomatis dari Logbook semua unit. Disiapkan untuk bridging SIMRS / SATUSEHAT.">Satu baris per pasien, dikelompokkan menurut No. Rekam Medis</p>
      <div className="piActions">
        <button type="button" className="prButton" onClick={() => void toggleIdentity()}>{showIdentity ? 'Samarkan identitas' : 'Tampilkan identitas'}</button>
        <button type="button" className="prButton" onClick={() => setShowSpec((v) => !v)}>{showSpec ? 'Tutup spesifikasi' : 'Spesifikasi bridging'}</button>
        {isAdmin && <button type="button" className="prButton primary" disabled={syncing} onClick={() => void sync()}>{syncing ? 'Menyinkronkan…' : 'Sinkron ulang dari Logbook'}</button>}
      </div>
    </header>
    {note && <div className="prAlert" role="status">{note}</div>}

    {showSpec && <div className="piPanel piSpec">
      <h4>Spesifikasi data &amp; bridging SIMRS</h4>
      <ul>
        <li><b>Kunci utama:</b> No. RM dinormalisasi ke 6 digit <code>XX-XX-XX</code> (nol depan dikembalikan; 36539 = 03-65-39). 7–12 digit disimpan angka saja.</li>
        <li><b>Ditolak sebagai No. RM:</b> nilai berisi huruf atau berbentuk tanggal (mis. hasil salah format Excel), tampil di daftar &ldquo;No. RM bermasalah&rdquo;.</li>
        <li><b>Kolom dari AUREKA:</b> nama, kunjungan pertama/terakhir, jumlah episode, unit &amp; diagnosis terakhir.</li>
        <li><b>Kolom diisi SIMRS saat bridging:</b> NIK (16 digit), No. IHS SATUSEHAT, ID pasien SIMRS, tanggal lahir, jenis kelamin (L/P), alamat, telepon.</li>
        <li><b>Status bridging:</b> Belum terhubung → Menunggu → Terhubung / Gagal / Konflik data.</li>
        <li><b>Readmisi ≤30 hari:</b> dua episode rawat inap (punya tanggal keluar) pasien yang sama berselisih 1–30 hari menurut tanggal Logbook. Perkiraan untuk penelusuran mutu, bukan pengganti indikator resmi.</li>
        <li><b>Pemetaan FHIR (SATUSEHAT Patient):</b> identifier No. RM (sistem RS), identifier NIK &amp; IHS, name, gender, birthDate, address, telecom.</li>
        <li><b>Keamanan:</b> tabel hanya lewat fungsi berizin; pengguna unit hanya melihat pasien yang pernah dilayani di unitnya; identitas disamarkan secara bawaan.</li>
      </ul>
      <p className="prMuted">Dokumen lengkap: docs/SPEC-BRIDGING-SIMRS.md di repositori AUREKA.</p>
    </div>}

    <div className="prKpis">
      <div className="prKpi"><span>Pasien unik (No. RM)</span><strong>{(summary?.total ?? 0).toLocaleString('id-ID')}</strong></div>
      <div className="prKpi"><span>Kunjungan berulang</span><strong>{(summary?.kunjungan_berulang ?? 0).toLocaleString('id-ID')}</strong></div>
      {v2 === true
        ? <div className="prKpi piKpiWarn"><span>Readmisi ≤30 hari</span><strong>{(summary?.readmisi_30 ?? 0).toLocaleString('id-ID')}</strong></div>
        : <div className="prKpi"><span>Sudah ada NIK</span><strong>{(summary?.dengan_nik ?? 0).toLocaleString('id-ID')}</strong></div>}
      <div className="prKpi"><span>Terhubung SIMRS</span><strong>{(summary?.terhubung_simrs ?? 0).toLocaleString('id-ID')}</strong></div>
    </div>

    <div className="piAnalytics" aria-label="Analisis metadata pasien">
      <section className="piAnalyticsCard">
        <div className="piAnalyticsHead"><div><h4>Status bridging SIMRS</h4><p>{population ? 'Seluruh pasien yang dapat Anda akses.' : 'Hanya baris di halaman tabel ini. Ringkasan seluruh pasien aktif setelah pembaruan database.'}</p></div><b>n = {(population ? summary?.total ?? 0 : rows.length).toLocaleString('id-ID')}</b></div>
        {loading && !summary ? <p className="prMuted">Memuat distribusi…</p> : <div className="piBars">{bridgeCounts.map((item) => <div className="piBarRow" key={item.key}><span>{item.label}</span><div className="piBarTrack"><i style={{ width: pct(item.count) + '%' }} /></div><b>{pct(item.count)}%</b></div>)}</div>}
      </section>
      <section className="piAnalyticsCard">
        <div className="piAnalyticsHead"><div><h4>Kelengkapan elemen metadata</h4><p>{population ? 'Persentase pasien yang elemennya sudah terisi.' : 'Hanya baris di halaman tabel ini.'}</p></div><b>n = {(population ? summary?.total ?? 0 : rows.length).toLocaleString('id-ID')}</b></div>
        {loading && !summary ? <p className="prMuted">Memuat kelengkapan…</p> : <div className="piBars">{completeness.map((item) => <div className="piBarRow" key={item.label}><span>{item.label}</span><div className="piBarTrack"><i style={{ width: pct(item.count) + '%' }} /></div><b>{pct(item.count)}%</b></div>)}</div>}
      </section>
    </div>

    <div className="piToolbar">
      <div className="piChips" role="group" aria-label="Filter pasien">
        {chips.map((c) => {
          const disabled = Boolean(c.needsV2 && v2 === false)
          return <button key={c.key} type="button" className={'piChip' + (filter === c.key ? ' active' : '') + (c.key === 'readmisi30' ? ' warn' : '')} aria-pressed={filter === c.key} disabled={disabled} title={disabled ? 'Butuh migrasi 20261115090000 di Supabase' : undefined} onClick={() => setFilterAndReset(c.key)}>
            {c.label}{c.count != null && <span>{c.count.toLocaleString('id-ID')}</span>}
          </button>
        })}
        <button type="button" className={'piChip' + (invalid !== null ? ' active' : '')} aria-expanded={invalid !== null} aria-controls="pi-invalid-rm" onClick={() => { if (invalid !== null) setInvalid(null); else void loadInvalid() }}>{invalid !== null ? 'Tutup No. RM bermasalah' : 'No. RM bermasalah'}</button>
      </div>
      <div className="piFilters">
        <label className="piSelect"><span className="piSr">Unit</span>
          <select value={roomId ?? ''} disabled={v2 === false} onChange={(e) => { setRoomId(e.target.value ? Number(e.target.value) : null); setPage(0) }} aria-label="Filter unit">
            <option value="">Semua unit</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </label>
        <label className="piDate"><span>Datang terakhir</span>
          <input type="date" value={from} max={to || undefined} disabled={v2 === false} onChange={(e) => { setFrom(e.target.value); setPage(0) }} aria-label="Kunjungan terakhir dari tanggal" />
          <i aria-hidden="true">–</i>
          <input type="date" value={to} min={from || undefined} disabled={v2 === false} onChange={(e) => { setTo(e.target.value); setPage(0) }} aria-label="Kunjungan terakhir sampai tanggal" />
        </label>
        {(filter !== 'semua' || roomId != null || from || to) && <button type="button" className="piReset" onClick={() => { setFilter('semua'); setRoomId(null); setFrom(''); setTo(''); setPage(0) }}>Reset filter</button>}
      </div>
      {v2 === false && <p className="piHint">Filter unit, tanggal, kunjungan berulang, dan readmisi akan aktif setelah pembaruan database oleh admin AUREKA. Untuk mencari No. RM atau nama, pakai kotak cari di bagian atas.</p>}
    </div>

    {invalid && <div className="piPanel" id="pi-invalid-rm">
      <div className="piPanelHead"><h4>Episode dengan No. RM kosong / tidak valid ({invalid.length}{invalid.length >= 100 ? '+' : ''})</h4><button type="button" className="prButton" onClick={() => setInvalid(null)} aria-label="Tutup daftar No. RM bermasalah">Tutup</button></div>
      {invalid.length ? <div className="prTableWrap"><table className="prTable"><thead><tr><th>Unit</th><th>Tanggal</th><th>Isi No. RM</th></tr></thead>
        <tbody>{invalid.map((r) => <tr key={r.record_id}><td>{r.room_name}</td><td>{fmt(r.record_date)}</td><td><code>{r.no_rm_asli || '(kosong)'}</code></td></tr>)}</tbody></table></div>
        : <p className="prMuted">Tidak ada. Semua episode punya No. RM yang valid.</p>}
      <p className="prMuted">Perbaiki di Logbook unit terkait; indeks pasien ikut diperbarui otomatis.</p>
    </div>}

    {error && <div className="prAlert" role="alert">{error}</div>}
    <div className="prPanel">
      {(!showNik || !showBridge) && <p className="piColNote">Kolom NIK dan status bridging disembunyikan karena SIMRS belum terhubung. Kolom itu muncul sendiri begitu datanya masuk.</p>}
      <div className="prTableWrap">
        <table className="prTable piTable" data-ak-sort="off">
          <thead><tr><th>No. RM</th><th>Nama Pasien</th>{showNik && <th>NIK</th>}<th>Kunjungan</th><th>Unit terakhir</th><th>Diagnosis terakhir</th>{showBridge && <th>Bridging SIMRS</th>}</tr></thead>
          <tbody>
            {loading ? <tr><td colSpan={colCount}><div className="prEmpty">Memuat database pasien…</div></td></tr>
              : rows.length ? rows.map((r) => <tr key={r.no_rm} className="piRow" tabIndex={0} role="button" aria-label={'Lihat riwayat pasien ' + r.no_rm} onClick={() => setDetail(r)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(r) } }}>
                <td><b className="piRm">{r.no_rm}</b></td>
                <td>{showIdentity ? r.nama_pasien || '-' : maskName(r.nama_pasien)}</td>
                {showNik && <td>{showIdentity ? r.nik || '-' : maskNik(r.nik)}</td>}
                <td className="piVisits">
                  {r.total_episode > 1
                    ? <><b>{r.total_episode}×</b> <span>{fmtShort(r.first_seen)} – {fmt(r.last_seen)}</span></>
                    : <span>{fmt(r.last_seen)}</span>}
                  {(r.readmisi_30 ?? 0) > 0 && <em className="piReadmit" title={'Kembali dirawat inap ≤30 hari' + (r.readmisi_terakhir ? ' · terakhir ' + fmt(r.readmisi_terakhir) : '')}>Readmisi 30 hari</em>}
                </td>
                <td>{r.unit_terakhir || '-'}</td>
                <td><span className="piDiag" title={r.diagnosis_terakhir || undefined}>{r.diagnosis_terakhir || '-'}</span></td>
                {showBridge && <td><span className={'piBridge ' + r.bridging_status}>{BRIDGING_LABEL[r.bridging_status] || r.bridging_status}</span></td>}
              </tr>) : <tr><td colSpan={colCount}><div className="prEmpty">{query || filter !== 'semua' || roomId || from || to ? 'Tidak ada pasien yang cocok dengan filter ini.' : 'Belum ada pasien di database.'}</div></td></tr>}
          </tbody>
        </table>
      </div>
      <footer className="prFoot">
        <span className="prMuted">{total ? `Menampilkan ${page * PAGE + 1}–${page * PAGE + rows.length} dari ${total.toLocaleString('id-ID')} pasien · klik baris untuk melihat riwayat` : ''}</span>
        <div className="prActions">
          <button className="prButton" type="button" disabled={page <= 0 || loading} onClick={() => setPage((v) => Math.max(0, v - 1))}>Sebelumnya</button>
          <span className="prMuted">Halaman {page + 1} / {Math.max(1, Math.ceil(total / PAGE))}</span>
          <button className="prButton" type="button" disabled={(page + 1) * PAGE >= total || loading} onClick={() => setPage((v) => v + 1)}>Berikutnya</button>
        </div>
      </footer>
    </div>

    {detail && <PatientTimeline patient={detail} showIdentity={showIdentity} onToggleIdentity={() => void toggleIdentity()} onClose={() => setDetail(null)} />}

    <style>{`
      .piWrap{display:grid;gap:16px}.piHead{display:flex;justify-content:space-between;gap:14px;flex-wrap:wrap;align-items:flex-start}
      .piHead h3{margin:0;font-size:20px}.piHead p{margin:6px 0 0;font-size:13px;color:#5b6b7c;max-width:640px;line-height:1.55}
      .piActions{display:flex;gap:8px;flex-wrap:wrap}
      .piPanel{padding:16px 18px;border-radius:16px;border:1px solid rgba(11,70,122,.14);background:rgba(255,255,255,.7)}
      .piPanel h3,.piPanel h4{margin:0 0 8px}.piPanelHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.piPanel p{margin:6px 0;font-size:13px;line-height:1.55}
      .piSpec ul{margin:6px 0;padding-left:18px;font-size:13px;line-height:1.6}
      .piRm{font-variant-numeric:tabular-nums;letter-spacing:.02em}
      .piBridge{display:inline-flex;padding:4px 9px;border-radius:999px;font-size:12px;font-weight:800;background:#eef2f7;color:#4a5b6d;white-space:nowrap}
      .piBridge.terhubung{background:#e3f4ea;color:#1f6b43}.piBridge.menunggu{background:#fff4e0;color:#8a5a12}
      .piBridge.gagal,.piBridge.konflik{background:#fde8e8;color:#9b2c2c}
      .piKpiWarn strong{color:#a15c07}
      .piAnalytics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}
      .piAnalyticsCard{min-width:0;padding:15px 17px;border:1px solid rgba(11,70,122,.14);border-radius:15px;background:#fff}
      .piAnalyticsHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.piAnalyticsHead h4{margin:0;font-size:14px}.piAnalyticsHead p{margin:5px 0 0;color:#64748b;font-size:12px;line-height:1.45}.piAnalyticsHead>b{font-size:12px;white-space:nowrap;color:#315b80}
      .piBars{display:grid;gap:10px;margin-top:14px}.piBarRow{display:grid;grid-template-columns:minmax(100px,1fr) minmax(60px,2fr) 48px;align-items:center;gap:9px;font-size:12px}.piBarRow>span{color:var(--ink,#0b1f33)}.piBarRow>b{text-align:right;font-variant-numeric:tabular-nums}
      .piBarTrack{height:9px;overflow:hidden;border-radius:99px;background:#e8eef4}.piBarTrack i{display:block;height:100%;border-radius:inherit;background:#236a9b;transition:width .5s cubic-bezier(.22,1,.36,1)}
      .piToolbar{display:grid;gap:10px;padding:14px 16px;border-radius:16px;border:1px solid rgba(11,70,122,.12);background:rgba(255,255,255,.7)}
      .piChips{display:flex;flex-wrap:wrap;gap:6px}
      .piChip{display:inline-flex;align-items:center;gap:8px;min-height:38px;padding:0 14px;border-radius:999px;border:1px solid rgba(31,36,48,.12);background:#fff;color:#334155;font:inherit;font-size:13px;font-weight:700;cursor:pointer;transition:background-color .15s ease,color .15s ease,border-color .15s ease}
      .piChip span{min-width:22px;padding:2px 7px;border-radius:999px;background:rgba(31,36,48,.07);font-size:12px;font-variant-numeric:tabular-nums}
      .piChip:hover:not(:disabled){border-color:rgba(14,116,144,.45)}
      .piChip.active{background:#1f2430!important;border-color:#1f2430!important;color:#fff!important}.piChip.active span{background:rgba(255,255,255,.2)!important;color:#fff!important}
      .piChip.warn:not(.active) span{background:#fff1d6;color:#8a5207}
      .piChip:disabled{opacity:.45;cursor:not-allowed}
      .piFilters{display:flex;flex-wrap:wrap;gap:8px;align-items:center;justify-content:flex-start}
      .piSearch{flex:1 1 260px;min-width:0}.piSearch input,.piSelect select,.piDate input{width:100%;min-height:40px;padding:0 12px;border-radius:12px;border:1.5px solid #d9e4ef;background:#f5f8fc;font:inherit;font-size:13px;color:#1f2430}
      .piSelect{flex:0 1 220px;min-width:160px}
      .piDate{display:flex;align-items:center;gap:6px;flex:0 1 auto;font-size:12px;font-weight:700;color:#4b5565}.piDate input{width:auto;min-width:138px}.piDate i{font-style:normal;color:#94a3b8}
      .piReset{min-height:40px;padding:0 12px;border:0;border-radius:12px;background:transparent;color:#0e7490;font:inherit;font-size:13px;font-weight:700;cursor:pointer}.piReset:hover{background:rgba(14,116,144,.08)}
      .piHint{margin:0;font-size:12px;color:#64748b}.piHint code{font-size:12px}
      .piSr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
      .piColNote{margin:0 0 10px;padding:8px 12px;border-radius:10px;background:#f2f6fa;color:#4b5565;font-size:12px}
      .piRow{cursor:pointer;transition:background-color .12s ease}.piRow:hover td,.piRow:focus-visible td{background:rgba(94,196,207,.09)}.piRow:focus-visible{outline:2px solid rgba(34,211,238,.6);outline-offset:-2px}
      .piVisits{white-space:nowrap}.piVisits b{font-variant-numeric:tabular-nums}.piVisits span{color:#4b5565}
      .piReadmit{display:inline-block;margin-left:8px;padding:2px 8px;border-radius:999px;background:#fff1d6;color:#8a5207;font-style:normal;font-size:12px;font-weight:800}
      .piDiag{display:-webkit-box;-webkit-line-clamp:1;-webkit-box-orient:vertical;overflow:hidden;max-width:420px}
      html[data-mode="gelap"] .piAnalyticsCard,html[data-mode="gelap"] .piToolbar{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.12)}html[data-mode="gelap"] .piAnalyticsHead p{color:#a8b8ca}html[data-mode="gelap"] .piBarTrack{background:#26364a}
      html[data-mode="gelap"] .piChip{background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.14);color:#dbe3ee}html[data-mode="gelap"] .piChip.active{background:#eef2f7!important;color:#0f1218!important}html[data-mode="gelap"] .piChip.active span{background:rgba(15,18,24,.12)!important;color:#0f1218!important}
      html[data-mode="gelap"] :is(.piSearch input,.piSelect select,.piDate input){background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.14);color:#eef2f7}
      html[data-mode="gelap"] .piColNote{background:rgba(255,255,255,.05);color:#aab6c6}html[data-mode="gelap"] .piVisits span{color:#aab6c6}
      html[data-mode="gelap"] .piReadmit,html[data-mode="gelap"] .piChip.warn:not(.active) span{background:rgba(251,191,36,.16);color:#fcd34d}
      @media(max-width:760px){.piAnalytics{grid-template-columns:1fr}.piAnalyticsHead{display:block}.piAnalyticsHead>b{display:inline-block;margin-top:6px}.piChips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none}.piChip{flex:0 0 auto}.piDate{flex:1 1 100%}.piDate input{flex:1;min-width:0}.piSelect{flex:1 1 100%}}
      html[data-mode="gelap"] .piPanel{background:rgba(255,255,255,.05);border-color:rgba(255,255,255,.1)}
      html[data-mode="gelap"] .piHead p{color:#9fb3c8}
      @media(prefers-reduced-motion:reduce){.piBarTrack i{transition:none}}
    `}</style>
  </section>
}

/** Panel samping: garis waktu seluruh episode pasien (dari Logbook semua unit yang boleh diakses). */
function PatientTimeline({ patient, showIdentity, onToggleIdentity, onClose }: { patient: PatientRow; showIdentity: boolean; onToggleIdentity: () => void; onClose: () => void }) {
  const [episodes, setEpisodes] = useState<Episode[] | null>(null)
  const [error, setError] = useState('')
  const closeRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    let cancelled = false
    const firstYear = patient.first_seen ? toDate(patient.first_seen).getFullYear() : new Date().getFullYear()
    const lastYear = patient.last_seen ? toDate(patient.last_seen).getFullYear() : new Date().getFullYear()
    const years: number[] = []
    for (let y = Math.max(firstYear, lastYear - 5); y <= lastYear; y++) years.push(y)
    void (async () => {
      const results = await Promise.all(years.map((y) => aurekaSupabase.rpc('aureka_patient_episodes_page', { p_room: null, p_year: y, p_query: patient.no_rm, p_limit: 200, p_offset: 0 })))
      if (cancelled) return
      const failed = results.find((r) => r.error)
      if (failed && results.every((r) => r.error)) { setError(toUserFacingError(failed.error, { fallback: 'Riwayat kunjungan belum dapat dimuat.' })); setEpisodes([]); return }
      const all = results.flatMap((r) => (r.data ?? []) as Episode[]).filter((e) => e.no_rm_norm === patient.no_rm)
      all.sort((a, b) => String(b.record_date ?? '').localeCompare(String(a.record_date ?? '')))
      setEpisodes(all)
    })()
    return () => { cancelled = true }
  }, [patient])

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    closeRef.current?.focus()
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey); previous?.focus?.() }
  }, [onClose])

  // Jarak antar episode rawat inap (urutan waktu) untuk menandai readmisi ≤30 hari.
  const gaps = useMemo(() => {
    const map = new Map<string, number>()
    const inpatient = (episodes ?? []).filter((e) => e.rawat_inap && e.record_date).slice().reverse()
    for (let i = 1; i < inpatient.length; i++) {
      const gap = daysBetween(inpatient[i - 1].record_date as string, inpatient[i].record_date as string)
      if (gap >= 1 && gap <= 30) map.set(inpatient[i].id, gap)
    }
    return map
  }, [episodes])
  const units = useMemo(() => new Set((episodes ?? []).map((e) => e.unit).filter(Boolean)).size, [episodes])

  if (typeof document === 'undefined') return null
  return createPortal(<div className="ptBackdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <aside className="ptDrawer" role="dialog" aria-modal="true" aria-labelledby="pt-title">
      <header className="ptHead">
        <div>
          <span className="ptEyebrow">Riwayat pasien</span>
          <h3 id="pt-title">{patient.no_rm}</h3>
          <p>{showIdentity ? patient.nama_pasien || '-' : maskName(patient.nama_pasien)} · {patient.total_episode}× kunjungan{units ? ` · ${units} unit` : ''}</p>
        </div>
        <div className="ptHeadActions">
          <button type="button" className="ptGhost" onClick={onToggleIdentity}>{showIdentity ? 'Samarkan' : 'Tampilkan nama'}</button>
          <button ref={closeRef} type="button" className="ptClose" onClick={onClose} aria-label="Tutup riwayat pasien">×</button>
        </div>
      </header>
      {(patient.readmisi_30 ?? 0) > 0 && <div className="ptAlert">Pasien ini kembali dirawat inap dalam ≤30 hari ({patient.readmisi_30}×). Pertimbangkan untuk ditelusuri sebagai bahan evaluasi mutu.</div>}
      <div className="ptBody">
        {episodes === null ? <div className="ptLoading" role="status"><i /><i /><i /></div>
          : error ? <p className="ptEmpty">{error}</p>
          : episodes.length === 0 ? <p className="ptEmpty">Belum ada episode yang dapat ditampilkan untuk No. RM ini di unit yang boleh Anda akses.</p>
          : <ol className="ptList">{episodes.map((e) => {
              const gap = gaps.get(e.id)
              return <li key={e.id} className={gap ? 'readmit' : ''}>
                <span className="ptDot" aria-hidden="true" />
                <div className="ptCard">
                  <div className="ptRow"><b>{fmt(e.record_date)}</b><span>{e.unit || '-'}</span>{e.rawat_inap && <em className="ptTag">Rawat inap</em>}{gap && <em className="ptTag warn">Kembali {gap} hari</em>}</div>
                  {e.diagnosis && <p className="ptDiag">{e.diagnosis}</p>}
                  <div className="ptMeta">
                    {e.masuk && <span>Masuk {fmt(e.masuk)}</span>}
                    {e.keluar && <span>Keluar {fmt(e.keluar)}</span>}
                    {e.los && <span>LOS {e.los}{/hari/i.test(e.los) ? '' : ' hari'}</span>}
                    {e.dpjp && <span>DPJP {e.dpjp}</span>}
                  </div>
                </div>
              </li>
            })}</ol>}
      </div>
      <footer className="ptFoot">Sumber: Logbook episode pasien semua unit yang dapat Anda akses. Identitas mengikuti pengaturan samaran.</footer>
    </aside>
    <style>{`
      .ptBackdrop{position:fixed;inset:0;z-index:1200;display:flex;justify-content:flex-end;background:rgba(15,18,24,.32)}
      .ptDrawer{width:min(520px,100%);height:100%;display:flex;flex-direction:column;background:#fff;color:#1f2430;box-shadow:-24px 0 60px rgba(15,18,24,.18);font-family:var(--font-aureka),system-ui,sans-serif}
      .ptHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;padding:22px 22px 16px;border-bottom:1px solid #e6edf4;background:linear-gradient(180deg,rgba(236,243,250,.9),#fff)}
      .ptEyebrow{font-size:12px;font-weight:700;color:#2c6aa0}.ptHead h3{margin:2px 0 4px;font-size:24px;font-weight:800;letter-spacing:-.01em;font-variant-numeric:tabular-nums}.ptHead p{margin:0;font-size:13px;color:#4b5565}
      .ptHeadActions{display:flex;gap:6px;align-items:center}
      .ptGhost{min-height:36px;padding:0 12px;border-radius:10px;border:1px solid #d9e4ef;background:#fff;font:inherit;font-size:12px;font-weight:700;color:#1f2430;cursor:pointer}
      .ptClose{width:38px;height:38px;border-radius:12px;border:1px solid #d9e4ef;background:#fff;font-size:20px;line-height:1;color:#1f2430;cursor:pointer}
      .ptAlert{margin:14px 22px 0;padding:10px 12px;border-radius:12px;background:#fff6e2;color:#7a4a05;font-size:13px;line-height:1.5}
      .ptBody{flex:1;overflow:auto;padding:16px 22px}
      .ptList{list-style:none;margin:0;padding:0 0 0 18px;border-left:2px solid #e3eaf1;display:grid;gap:12px}
      .ptList li{position:relative}.ptDot{position:absolute;left:-25px;top:16px;width:12px;height:12px;border-radius:99px;background:#5ec4cf;border:2px solid #fff;box-shadow:0 0 0 2px #cdeef1}
      .ptList li.readmit .ptDot{background:#f59e0b;box-shadow:0 0 0 2px #fde7b0}
      .ptCard{padding:12px 14px;border-radius:14px;border:1px solid #e3eaf1;background:#fbfcfe}
      .ptRow{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;font-size:13px}.ptRow b{font-variant-numeric:tabular-nums}.ptRow span{color:#334155;font-weight:600}
      .ptTag{padding:2px 8px;border-radius:999px;background:#e7f3f8;color:#0e5566;font-style:normal;font-size:12px;font-weight:700}.ptTag.warn{background:#fff1d6;color:#8a5207}
      .ptDiag{margin:6px 0 0;font-size:13px;line-height:1.5;color:#1f2430}
      .ptMeta{display:flex;flex-wrap:wrap;gap:4px 12px;margin-top:6px;font-size:12px;color:#5b6878}
      .ptEmpty{margin:20px 0;color:#5b6878;font-size:13px;text-align:center}
      .ptLoading{display:grid;gap:12px}.ptLoading i{display:block;height:74px;border-radius:14px;background:linear-gradient(90deg,#eef2f7 25%,#f7f9fc 37%,#eef2f7 63%);background-size:400% 100%;animation:ptShimmer 1.3s ease infinite}
      @keyframes ptShimmer{0%{background-position:100% 50%}100%{background-position:0 50%}}
      .ptFoot{padding:12px 22px;border-top:1px solid #e6edf4;font-size:12px;color:#64748b}
      @media(prefers-reduced-motion:no-preference){@keyframes ptIn{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}.ptDrawer{animation:ptIn .3s cubic-bezier(.22,1,.36,1) both}}
      @media(prefers-reduced-motion:reduce){.ptLoading i{animation:none}}
      html[data-mode="gelap"] .ptDrawer{background:#121821;color:#eef2f7}
      html[data-mode="gelap"] .ptHead{background:linear-gradient(180deg,rgba(94,196,207,.1),#121821);border-color:rgba(255,255,255,.08)}
      html[data-mode="gelap"] .ptHead p,html[data-mode="gelap"] .ptMeta,html[data-mode="gelap"] .ptFoot,html[data-mode="gelap"] .ptEmpty{color:#aab6c6}
      html[data-mode="gelap"] .ptEyebrow{color:#8ee3ea}
      html[data-mode="gelap"] :is(.ptGhost,.ptClose){background:rgba(255,255,255,.06);border-color:rgba(255,255,255,.14);color:#eef2f7}
      html[data-mode="gelap"] .ptCard{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.1)}
      html[data-mode="gelap"] .ptRow span,html[data-mode="gelap"] .ptDiag{color:#dbe3ee}
      html[data-mode="gelap"] .ptList{border-color:rgba(255,255,255,.12)}html[data-mode="gelap"] .ptDot{border-color:#121821}
      html[data-mode="gelap"] .ptAlert{background:rgba(251,191,36,.12);color:#fcd34d}
      html[data-mode="gelap"] .ptFoot{border-color:rgba(255,255,255,.08)}
      html[data-mode="gelap"] .ptLoading i{background:linear-gradient(90deg,rgba(255,255,255,.05) 25%,rgba(255,255,255,.1) 37%,rgba(255,255,255,.05) 63%);background-size:400% 100%}
    `}</style>
  </div>, document.body)
}
