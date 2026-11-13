'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import dynamic from 'next/dynamic'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import { fetchRoomMonthCounts } from '@/lib/aureka/quality-counts'
import PatientIndexTab from '@/components/patient-registry/PatientIndexTab'
import PatientStatsTab from '@/components/patient-registry/PatientStatsTab'
import { requestSensitiveAccess } from '@/lib/aureka/sensitive-access'

type Room = { id: number; name: string }
type EpisodeRow = {
  id: string
  room_id: number
  record_date: string | null
  profile_year: number
  status: string
  core_data: Record<string, any> | null
  created_at: string
  updated_at: string
}
type Episode = {
  id: string
  roomId: number
  unit: string
  name: string
  mrn: string
  admission: string
  discharge: string
  diagnosis: string
  dpjp: string
  los: string
  status: string
  updatedAt: string
  /** Unit rawat inap (ada kolom Tanggal Keluar). Kunjungan IGD/Rehab/IBS bukan "masih dirawat". */
  inpatient: boolean
}

const QualityIndicatorWorkspace = dynamic(() => import('@/components/QualityIndicatorWorkspace'), { ssr: false })
const PAGE_SIZE = 50
const db = aurekaSupabase.schema('aureka_quality')

function text(value: unknown) {
  return value == null ? '' : String(value).trim()
}

const DATE_FMT = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Pontianak' })
const DATETIME_FMT = new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Pontianak' })
/** Tampilkan tanggal rapi: "30 Sep 2026" atau "30 Sep 2026 20.29" (bukan "2026-09-30T20:29:00"). */
function formatDate(value: string) {
  const v = value.trim()
  if (!v) return ''
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(v)
  if (!m) return v
  const hasTime = Boolean(m[4]) && !(m[4] === '00' && m[5] === '00')
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4] ?? 0), Number(m[5] ?? 0))
  if (Number.isNaN(d.getTime())) return v
  return hasTime ? DATETIME_FMT.format(d).replace(/\./g, '.') : DATE_FMT.format(d)
}
const first = (...values: unknown[]) => { for (const v of values) { const t = text(v); if (t) return t } return '' }

type PageRow = {
  id: string; room_id: number; unit: string | null; record_date: string | null; status: string; nama_pasien: string | null
  no_rm: string | null; no_rm_norm: string | null; masuk: string | null; keluar: string | null; diagnosis: string | null
  dpjp: string | null; los: string | null; rawat_inap: boolean; total_count: number
}
function episodeFromPageRow(r: PageRow): Episode {
  const discharge = text(r.keluar)
  const los = text(r.los)
  return {
    id: r.id, roomId: Number(r.room_id), unit: text(r.unit) || 'Unit tidak diketahui',
    name: text(r.nama_pasien), mrn: text(r.no_rm_norm) || text(r.no_rm).replace(/^'+/, ''),
    admission: formatDate(text(r.masuk)), discharge: formatDate(discharge),
    diagnosis: text(r.diagnosis), dpjp: text(r.dpjp),
    los: r.rawat_inap && discharge && /^\d+(\.\d+)?$/.test(los) ? los : '',
    status: r.status, updatedAt: '', inpatient: Boolean(r.rawat_inap),
  }
}

function episodeFromRow(row: EpisodeRow, roomNames: Map<number, string>): Episode {
  const core = row.core_data ?? {}
  const fields = (core.form_fields ?? core.form_data ?? {}) as Record<string, unknown>
  const calculated = (core.calculated_fields ?? {}) as Record<string, unknown>
  // Nama kolom berbeda per unit (IGD, Gizi, Rehab Medik, PONEK, Nifas, IBS ...).
  const admission = first(core.admission_at, fields['Tanggal Masuk'], fields['Waktu Masuk'], fields['Tanggal Dilayani'], row.record_date)
  const discharge = first(core.discharge_at, fields['Tanggal Keluar'])
  const inpatient = Object.prototype.hasOwnProperty.call(core, 'discharge_at') || Object.prototype.hasOwnProperty.call(fields, 'Tanggal Keluar')
  const losRaw = first(core.los_days, calculated['Length of Stay'], calculated['Lenght of Stay'], fields['Length of Stay'], fields['Lenght of Stay'])
  return {
    id: row.id,
    roomId: Number(row.room_id),
    unit: text(core.unit_name) || roomNames.get(Number(row.room_id)) || 'Unit tidak diketahui',
    name: first(core.patient_name, fields['Nama Pasien']),
    mrn: first(core.medical_record_no, fields['No. Rekam Medis'], fields['No. RM']).replace(/^'+/, ''),
    admission: formatDate(admission),
    discharge: formatDate(discharge),
    diagnosis: first(core.diagnosis, fields['Diagnosa Tegak'], fields['Diagnosa IGD'], fields['Diagnosa'], fields['Diagnosa Operasi']),
    dpjp: first(core.dpjp, fields['DPJP'], fields['Dpjp'], fields['Nama Dokter'], fields['Dokter Umum'], fields['Petugas'], fields['Nama Terapis'], fields['Nutrisionis']),
    los: inpatient && discharge && /^\d+(\.\d+)?$/.test(losRaw) ? losRaw : '',
    status: row.status,
    updatedAt: row.updated_at || row.created_at,
    inpatient,
  }
}

function maskName(value: string) {
  const parts = value.split(/\s+/).filter(Boolean)
  return parts.length ? parts.map((part) => part.length > 1 ? part[0] + '•••' : '•').join(' ') : '-'
}

function maskMrn(value: string) {
  if (!value) return '-'
  return value.length <= 4 ? '••••' : '••••' + value.slice(-4)
}

function csvValue(value: unknown) {
  const raw = String(value ?? '')
  return '"' + raw.replace(/"/g, '""') + '"'
}

function downloadCsv(rows: Episode[], revealIdentity: boolean) {
  const header = ['Unit', 'Tanggal Masuk', 'Tanggal Keluar', 'Nama Pasien', 'No. Rekam Medis', 'Diagnosis', 'DPJP', 'Lama Rawat (hari)', 'Status']
  const body = rows.map((row) => [
    row.unit, row.admission, row.discharge,
    revealIdentity ? row.name : maskName(row.name),
    revealIdentity ? row.mrn : maskMrn(row.mrn),
    row.diagnosis, row.dpjp, row.los, row.status,
  ])
  const csv = [header, ...body].map((line) => line.map(csvValue).join(',')).join('\r\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'rekap-episode-pasien.csv'
  anchor.click()
  URL.revokeObjectURL(url)
}

export default function PatientRegistryWorkspace({
  rooms,
  initialRoomId,
  isAdmin,
  isValidator,
  canViewAllRooms,
  lockRoomScope = false,
  section,
}: {
  rooms: Room[]
  initialRoomId: number | null
  isAdmin: boolean
  isValidator: boolean
  canViewAllRooms: boolean
  lockRoomScope?: boolean
  /** Blueprint v2 §1/§2: submenu Pasien — Register Pasien, Statistik, Metadata Pasien */
  section?: 'register' | 'stats' | 'metadata'
}) {
  const [tab, setTab] = useState<'add' | 'records' | 'database' | 'stats'>(section === 'stats' ? 'stats' : section === 'metadata' ? 'database' : 'add')
  useEffect(() => { if (section === 'stats') setTab('stats'); else if (section === 'metadata') setTab('database'); else if (section === 'register') setTab((t) => (t === 'records' ? 'records' : 'add')) }, [section])
  // Super Admin mengikuti unit global; PMKP dapat memilih Semua Unit atau unit tertentu.
  const [roomFilter, setRoomFilter] = useState(lockRoomScope ? String(initialRoomId ?? rooms[0]?.id ?? '') : canViewAllRooms ? '' : String(initialRoomId ?? rooms[0]?.id ?? ''))
  const [roomCounts, setRoomCounts] = useState<Map<number, number>>(new Map())
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  useEffect(() => { const receive = (event: Event) => { const detail = (event as CustomEvent<{ query?: string }>).detail; setSearch(String(detail?.query ?? '')); setPage(0) }; window.addEventListener('aureka:workspace-search', receive); return () => window.removeEventListener('aureka:workspace-search', receive) }, [])
  const [query, setQuery] = useState('')
  useEffect(() => { const t = window.setTimeout(() => { setQuery(search.trim()); setPage(0) }, 400); return () => window.clearTimeout(t) }, [search])
  const [showIdentity, setShowIdentity] = useState(false)
  const [rows, setRows] = useState<Episode[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const roomNames = useMemo(() => new Map(rooms.map((room) => [Number(room.id), room.name])), [rooms])
  const effectiveRoom = roomFilter
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // Utama: fungsi database (cek akses sekali, kolom ringkas, cari No. RM ternormalisasi) — cepat untuk unit besar seperti IGD.
      if (!effectiveRoom && (!canViewAllRooms || lockRoomScope)) throw new Error('Unit kerja belum tersedia untuk akun ini. Hubungi administrator untuk pemetaan unit.')
      const rpc = await aurekaSupabase.rpc('aureka_patient_episodes_page', {
        p_room: effectiveRoom ? Number(effectiveRoom) : null, p_year: Number(year), p_query: query || null, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE,
      })
      if (!rpc.error) {
        const list = (rpc.data ?? []) as PageRow[]
        setRows(list.map(episodeFromPageRow))
        setTotal(list.length ? Number(list[0].total_count) : 0)
        return
      }
      const missing = rpc.error.code === 'PGRST202' || /Could not find the function|schema cache/i.test(rpc.error.message || '')
      if (!missing) throw rpc.error
      // Cadangan sebelum fungsi dipasang: tanpa hitung total & tanpa pencarian (keduanya kehabisan waktu di unit besar).
      if (query) throw new Error('Pencarian di seluruh data membutuhkan fungsi database Rekapan Pasien. Minta Super Admin menjalankan migrasi 20261111150000_patient_episodes_page.sql.')
      let request: any = db.from('quality_records')
        .select('id,room_id,record_date,profile_year,status,core_data,created_at,updated_at')
        .eq('measurement_grain', 'patient_episode')
        .neq('status', 'archived')
        .eq('profile_year', Number(year))
        .order('record_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (effectiveRoom) request = request.eq('room_id', Number(effectiveRoom))
      const from = page * PAGE_SIZE
      const { data, error: queryError } = await request.range(from, from + PAGE_SIZE - 1)
      if (queryError) throw queryError
      setRows(((data ?? []) as EpisodeRow[]).map((row) => episodeFromRow(row, roomNames)))
      setTotal(-1)
    } catch (cause) {
      setRows([])
      setTotal(0)
      setError(toUserFacingError(cause, { fallback: 'Rekapan pasien belum dapat dimuat. Periksa koneksi dan hak akses, lalu coba kembali.' }))
    } finally {
      setLoading(false)
    }
  }, [effectiveRoom, page, roomNames, year, canViewAllRooms, lockRoomScope, query])

  // Jumlah episode per unit (untuk pilihan unit & unit bawaan formulir Tambah Pasien).
  useEffect(() => {
    if (!canViewAllRooms && !lockRoomScope) return
    let cancelled = false
    ;(async () => {
      const counts = new Map<number, number>()
      for (const row of await fetchRoomMonthCounts(Number(year), 'patient_episode')) counts.set(row.room_id, (counts.get(row.room_id) ?? 0) + row.total)
      if (!cancelled) setRoomCounts(counts)
    })()
    return () => { cancelled = true }
  }, [canViewAllRooms, lockRoomScope, year])
  const firstRoomWithData = useMemo(() => rooms.find((room) => (roomCounts.get(Number(room.id)) ?? 0) > 0)?.id ?? null, [rooms, roomCounts])

  useEffect(() => {
    if (lockRoomScope && initialRoomId != null) {
      const next = String(initialRoomId)
      if (roomFilter !== next) { setRoomFilter(next); setPage(0) }
      return
    }
    if (!canViewAllRooms && !roomFilter && rooms.length) setRoomFilter(String(initialRoomId ?? rooms[0].id))
  }, [roomFilter, rooms, initialRoomId, canViewAllRooms, lockRoomScope])
  useEffect(() => { void load() }, [load])

  const filtered = rows

  const allTotal = effectiveRoom ? (roomCounts.get(Number(effectiveRoom)) ?? 0) : [...roomCounts.values()].reduce((a, b) => a + b, 0)
  const shownTotal = total >= 0 ? total : allTotal
  const pageCount = Math.max(1, Math.ceil(shownTotal / PAGE_SIZE))
  const firstRow = rows.length ? page * PAGE_SIZE + 1 : 0
  const lastRow = page * PAGE_SIZE + rows.length
  const discharged = rows.filter((row) => row.inpatient && row.discharge).length
  const activeEpisodes = rows.filter((row) => row.inpatient && !row.discharge).length
  const visits = rows.filter((row) => !row.inpatient).length

  return (
    <section className="patientRegistry">
      <style>{`
        .patientRegistry{display:grid;gap:16px;color:var(--ink,#18372b)}.prTabs{display:flex;gap:7px;border-bottom:1px solid var(--line,rgba(30,60,45,.14));padding-bottom:10px}.prTabs button{border:1px solid transparent;background:transparent;color:#66766d;border-radius:10px;padding:10px 14px;font-size:12px;font-weight:750;cursor:pointer}.prTabs button.active{background:#eaf4ee;color:#245e40;border-color:#d7e8dc}.prAddWorkspace{min-width:0}.prAddWorkspace>.aq{margin:0}
        .prHead{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
        .prHead h2{margin:0;font-size:clamp(22px,3vw,30px);letter-spacing:-.045em}
        .prHead p{margin:6px 0 0;color:var(--muted,#718078);font-size:12px;line-height:1.55}
        .prActions,.prFilters{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        .prButton{border:1px solid var(--line,rgba(30,60,45,.14));background:#fff;color:#264438;border-radius:11px;padding:10px 13px;min-height:40px;font-size:12px;font-weight:750;cursor:pointer}
        .prButton.primary{background:var(--accent,#23694a);border-color:var(--accent,#23694a);color:#fff}
        .prButton:disabled{opacity:.45;cursor:not-allowed}
        .prKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
        .prKpi,.prPanel{background:#fff;border:1px solid var(--line,rgba(30,60,45,.14));border-radius:15px}
        .prKpi{padding:14px 16px}.prKpi span{display:block;color:var(--muted,#718078);font-size:11px}.prKpi strong{display:block;font-size:25px;margin-top:5px}
        .prFilters{padding:14px}.prFilters label{display:grid;gap:5px;color:var(--muted,#718078);font-size:11px;font-weight:700}.prUnitScope{display:grid;gap:5px;min-width:170px;padding:3px 0}.prUnitScope span{color:var(--muted,#718078);font-size:11px;font-weight:700}.prUnitScope strong{font-size:12px;color:var(--ink,#18372b)}
        .prFilters input,.prFilters select{min-height:39px;min-width:145px;border:1px solid var(--line,rgba(30,60,45,.14));border-radius:10px;padding:8px 10px;background:#fff;color:var(--ink,#18372b);font-size:12px}
        .prSearch{flex:1;min-width:210px}
        .prTableWrap{overflow:auto;max-width:100%;border-radius:15px}
        .prTable{width:100%;min-width:930px;border-collapse:collapse;font-size:12px}
        .prTable th,.prTable td{padding:12px 11px;text-align:left;border-bottom:1px solid var(--line,rgba(30,60,45,.1));vertical-align:top}
        .prTable th{font-size:11px;color:var(--muted,#718078);font-weight:800;background:#f8faf8;white-space:nowrap}
        .prTable td{line-height:1.45}.prStrong{font-weight:800;color:#244638}.prMuted{color:var(--muted,#718078);font-size:11px}
        .prStatus{display:inline-flex;padding:5px 8px;border-radius:999px;background:#e9f5ee;color:#286346;font-size:11px;font-weight:800}.prStatus.in{background:#fff4e0;color:#8a5a12}.prStatus.visit{background:#e8f0fb;color:#1e4f86}
        .prFoot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px}
        .prEmpty{padding:35px 16px;text-align:center;color:var(--muted,#718078);font-size:12px}
        .prAlert{padding:12px 14px;border-radius:12px;background:#fff5e8;color:#825a20;font-size:12px}
        @media(max-width:640px){.prKpis{grid-template-columns:1fr}.prHead{display:grid}.prActions{width:100%}.prButton{flex:1}}
      `}</style>
      {(!section || section === 'register') && <nav className="prTabs" role="tablist" aria-label="Register Pasien"><button type="button" role="tab" aria-selected={tab === 'add'} className={tab === 'add' ? 'active' : ''} onClick={() => setTab('add')}>Tambah Pasien</button><button type="button" role="tab" aria-selected={tab === 'records'} className={tab === 'records' ? 'active' : ''} onClick={() => setTab('records')}>Rekapan Pasien</button>{!section && <><button type="button" role="tab" aria-selected={tab === 'stats'} className={tab === 'stats' ? 'active' : ''} onClick={() => setTab('stats')}>Statistik</button><button type="button" role="tab" aria-selected={tab === 'database'} className={tab === 'database' ? 'active' : ''} onClick={() => setTab('database')}>Metadata Pasien</button></>}</nav>}
      {tab === 'database' ? <PatientIndexTab isAdmin={isAdmin} /> : tab === 'stats' ? <PatientStatsTab rooms={rooms} roomId={Number(roomFilter) || null} year={Number(year)} onYearChange={(y) => setYear(String(y))} /> : tab === 'add' ? <section className="prAddWorkspace"><QualityIndicatorWorkspace key={'patient-entry-'+(Number(roomFilter)||initialRoomId||'all')} initialRoomId={Number(roomFilter)||initialRoomId||null} rooms={lockRoomScope ? rooms.filter((room) => String(room.id) === roomFilter) : canViewAllRooms ? rooms : rooms.filter((room) => String(room.id) === roomFilter)} isAdmin={isAdmin} isValidator={isValidator} canViewAllRooms={canViewAllRooms} lockRoomScope={lockRoomScope} initialContainer="Audit Indikator Mutu" showContainerTabs={false} patientRegistryMode /></section> : <>
      <header className="prHead">
        <p className="psStatsLead">Episode pelayanan dari logbook unit · identitas disamarkan</p>
        <div className="prActions">
          <button className="prButton" type="button" onClick={async () => { if (showIdentity) { setShowIdentity(false); return } if (await requestSensitiveAccess('patient_identity', 'register-pasien:' + (roomFilter || 'semua-unit'), 'Tampilkan identitas pasien')) setShowIdentity(true); else setError('Role Anda tidak memiliki izin melihat identitas pasien, atau permintaan dibatalkan.') }}>{showIdentity ? 'Samarkan Identitas' : 'Tampilkan Identitas'}</button>
          <button className="prButton" type="button" onClick={() => downloadCsv(filtered, showIdentity)} disabled={!filtered.length}>Ekspor CSV</button>
          <button className="prButton primary" type="button" onClick={() => setTab('add')}>Tambah Pasien</button>
        </div>
      </header>

      <div className="prKpis">
        <div className="prKpi"><span>{query ? 'Hasil pencarian' : 'Total episode · tahun ' + year}</span><strong>{shownTotal.toLocaleString('id-ID')}</strong></div>
        <div className="prKpi"><span>Rawat inap pulang · halaman ini</span><strong>{discharged.toLocaleString('id-ID')}</strong></div>
        <div className="prKpi"><span>Masih dirawat · halaman ini</span><strong>{activeEpisodes.toLocaleString('id-ID')}</strong></div>
        <div className="prKpi"><span>Kunjungan (IGD/rawat jalan/tindakan) · halaman ini</span><strong>{visits.toLocaleString('id-ID')}</strong></div>
      </div>

      <div className="prPanel prFilters">
        {canViewAllRooms && !lockRoomScope
          ? <label>Unit pelayanan
            <select value={roomFilter} onChange={(event) => { setRoomFilter(event.target.value); setPage(0) }}>
              <option value="">Semua unit{roomCounts.size ? ' (' + [...roomCounts.values()].reduce((a, b) => a + b, 0).toLocaleString('id-ID') + ')' : ''}</option>
              {rooms.map((room) => <option key={room.id} value={String(room.id)}>{room.name}{roomCounts.size ? ' (' + (roomCounts.get(Number(room.id)) ?? 0).toLocaleString('id-ID') + ')' : ''}</option>)}
            </select>
          </label>
          : <div className="prUnitScope"><span>Unit pelayanan</span><strong>{rooms.find((room) => String(room.id) === roomFilter)?.name || 'Unit belum dipetakan'}</strong></div>}
        <label>Tahun
          <select value={year} onChange={(event) => { setYear(event.target.value); setPage(0) }}>
            {[2025, 2026, 2027, 2028, 2029].map((item) => <option key={item} value={String(item)}>{item}</option>)}
          </select>
        </label>
        <label className="prSearch">Cari No. RM atau nama pasien (semua data)
          <input type="search" name="aureka-patient-search" autoComplete="off" data-lpignore="true" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="mis. 03-65-39, 36539, atau nama" />
        </label>
        <button className="prButton" type="button" onClick={() => { setSearch(''); setPage(0); void load() }}>Muat Ulang</button>
      </div>

      {error && <div className="prAlert" role="alert">{error}</div>}
      <div className="prPanel">
        <div className="prTableWrap">
          <table className="prTable">
            <thead><tr><th>No.</th><th>Pasien / No. RM</th><th>Unit</th><th>Tanggal Masuk</th><th>Tanggal Keluar</th><th>Diagnosis</th><th>DPJP</th><th>LOS</th><th>Status</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={9}><div className="prEmpty">Memuat rekapan pasien…</div></td></tr>
                : filtered.length ? filtered.map((row, index) => <tr key={row.id}>
                  <td>{firstRow + index}</td>
                  <td><div className="prStrong">{showIdentity ? row.name || '-' : maskName(row.name)}</div><div className="prMuted">{showIdentity ? row.mrn || '-' : maskMrn(row.mrn)}</div></td>
                  <td>{row.unit}</td><td>{row.admission || '-'}</td><td>{row.discharge || '-'}</td>
                  <td>{row.diagnosis || '-'}</td><td>{row.dpjp || '-'}</td><td>{row.los ? row.los + ' hari' : '-'}</td>
                  <td><span className={'prStatus ' + (row.inpatient ? (row.discharge ? 'out' : 'in') : 'visit')}>{row.inpatient ? (row.discharge ? 'Pulang' : 'Dirawat') : 'Kunjungan'}</span><div className="prMuted">{row.status === 'validated' ? 'Tervalidasi' : row.status === 'ready' ? 'Menunggu validasi' : row.status === 'draft' ? 'Draf' : row.status}</div></td>
                </tr>) : <tr><td colSpan={9}><div className="prEmpty">{query ? 'Tidak ada pasien yang cocok dengan pencarian.' : 'Belum ada catatan episode pasien untuk filter yang dipilih.'}</div></td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="prFoot">
          <span className="prMuted">Menampilkan {firstRow.toLocaleString('id-ID')}–{lastRow.toLocaleString('id-ID')} dari {shownTotal.toLocaleString('id-ID')} episode · 50 data per halaman</span>
          <div className="prActions">
            <button className="prButton" type="button" disabled={page <= 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>Sebelumnya</button>
            <span className="prMuted">Halaman {page + 1} / {pageCount}</span>
            <button className="prButton" type="button" disabled={rows.length < PAGE_SIZE || (page + 1) * PAGE_SIZE >= shownTotal || loading} onClick={() => setPage((value) => value + 1)}>Berikutnya</button>
          </div>
        </footer>
      </div>
      <p className="prMuted">Pencarian mencakup seluruh data tahun terpilih. Status "Kunjungan" untuk unit tanpa tanggal keluar (IGD, rawat jalan, tindakan). Hak akses unit tetap mengikuti akun.</p>
      </>}
    </section>
  )
}
