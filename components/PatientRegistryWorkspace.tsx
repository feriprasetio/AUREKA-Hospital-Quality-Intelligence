'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'

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
}

const PAGE_SIZE = 50
const db = aurekaSupabase.schema('aureka_quality')

function text(value: unknown) {
  return value == null ? '' : String(value).trim()
}

function episodeFromRow(row: EpisodeRow, roomNames: Map<number, string>): Episode {
  const core = row.core_data ?? {}
  const fields = (core.form_fields ?? core.form_data ?? {}) as Record<string, unknown>
  const calculated = (core.calculated_fields ?? {}) as Record<string, unknown>
  return {
    id: row.id,
    roomId: Number(row.room_id),
    unit: text(core.unit_name) || roomNames.get(Number(row.room_id)) || 'Unit tidak diketahui',
    name: text(core.patient_name) || text(fields['Nama Pasien']),
    mrn: text(core.medical_record_no) || text(fields['No. Rekam Medis']) || text(fields['No. RM']),
    admission: text(core.admission_at) || text(fields['Tanggal Masuk']) || text(row.record_date),
    discharge: text(core.discharge_at) || text(fields['Tanggal Keluar']),
    diagnosis: text(core.diagnosis) || text(fields['Diagnosa Tegak']) || text(fields['Diagnosa IGD']) || text(fields['Diagnosa']) || text(fields['Diagnosa Operasi']),
    dpjp: text(core.dpjp) || text(fields['DPJP']) || text(fields['Dpjp']),
    los: text(core.los_days) || text(calculated['Length of Stay']) || text(calculated['Lenght of Stay']) || text(fields['Lenght of Stay']),
    status: row.status,
    updatedAt: row.updated_at || row.created_at,
  }
}

function maskName(value: string) {
  const parts = value.split(/\s+/).filter(Boolean)
  return parts.length ? parts.map((part) => part.length > 1 ? part[0] + '•••' : '•').join(' ') : '—'
}

function maskMrn(value: string) {
  if (!value) return '—'
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
  canViewAllRooms,
  onOpenLogbook,
}: {
  rooms: Room[]
  initialRoomId: number | null
  canViewAllRooms: boolean
  onOpenLogbook: () => void
}) {
  const [roomFilter, setRoomFilter] = useState(String(initialRoomId ?? rooms[0]?.id ?? ''))
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
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
      let request: any = db.from('quality_records')
        .select('id,room_id,record_date,profile_year,status,core_data,created_at,updated_at', { count: 'exact' })
        .eq('measurement_grain', 'patient_episode')
        .neq('status', 'archived')
        .eq('profile_year', Number(year))
        .order('record_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
      if (effectiveRoom) request = request.eq('room_id', Number(effectiveRoom))
      else throw new Error('Unit kerja belum tersedia untuk akun ini. Hubungi administrator untuk pemetaan unit.')
      const from = page * PAGE_SIZE
      const { data, count, error: queryError } = await request.range(from, from + PAGE_SIZE - 1)
      if (queryError) throw queryError
      setRows(((data ?? []) as EpisodeRow[]).map((row) => episodeFromRow(row, roomNames)))
      setTotal(count ?? 0)
    } catch (cause) {
      setRows([])
      setTotal(0)
      setError(toUserFacingError(cause, { fallback: 'Rekapan pasien belum dapat dimuat. Periksa koneksi dan hak akses, lalu coba kembali.' }))
    } finally {
      setLoading(false)
    }
  }, [effectiveRoom, page, roomNames, year])

  useEffect(() => { if (!roomFilter && rooms.length) setRoomFilter(String(initialRoomId ?? rooms[0].id)) }, [roomFilter, rooms, initialRoomId])
  useEffect(() => { void load() }, [load])

  const filtered = useMemo(() => {
    const tokens = search.toLocaleLowerCase('id').trim().split(/\s+/).filter(Boolean)
    if (!tokens.length) return rows
    return rows.filter((row) => {
      const haystack = [row.unit, row.name, row.mrn, row.admission, row.discharge, row.diagnosis, row.dpjp, row.status].join(' ').toLocaleLowerCase('id')
      return tokens.every((token) => haystack.includes(token))
    })
  }, [rows, search])

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const firstRow = total ? page * PAGE_SIZE + 1 : 0
  const lastRow = Math.min((page + 1) * PAGE_SIZE, total)
  const discharged = rows.filter((row) => row.discharge).length
  const activeEpisodes = rows.length - discharged

  return (
    <section className="patientRegistry">
      <style>{`
        .patientRegistry{display:grid;gap:16px;color:var(--ink,#18372b)}
        .prHead{display:flex;justify-content:space-between;align-items:flex-start;gap:14px;flex-wrap:wrap}
        .prHead h2{margin:0;font-size:clamp(22px,3vw,30px);letter-spacing:-.045em}
        .prHead p{margin:6px 0 0;color:var(--muted,#718078);font-size:12px;line-height:1.55}
        .prActions,.prFilters{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
        .prButton{border:1px solid var(--line,rgba(30,60,45,.14));background:#fff;color:#264438;border-radius:11px;padding:10px 13px;min-height:40px;font-size:12px;font-weight:750;cursor:pointer}
        .prButton.primary{background:var(--accent,#23694a);border-color:var(--accent,#23694a);color:#fff}
        .prButton:disabled{opacity:.45;cursor:not-allowed}
        .prKpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
        .prKpi,.prPanel{background:#fff;border:1px solid var(--line,rgba(30,60,45,.14));border-radius:15px}
        .prKpi{padding:14px 16px}.prKpi span{display:block;color:var(--muted,#718078);font-size:11px}.prKpi strong{display:block;font-size:25px;margin-top:5px}
        .prFilters{padding:14px}.prFilters label{display:grid;gap:5px;color:var(--muted,#718078);font-size:10px;font-weight:700}.prUnitScope{display:grid;gap:5px;min-width:170px;padding:3px 0}.prUnitScope span{color:var(--muted,#718078);font-size:10px;font-weight:700}.prUnitScope strong{font-size:12px;color:var(--ink,#18372b)}
        .prFilters input,.prFilters select{min-height:39px;min-width:145px;border:1px solid var(--line,rgba(30,60,45,.14));border-radius:10px;padding:8px 10px;background:#fff;color:var(--ink,#18372b);font-size:12px}
        .prSearch{flex:1;min-width:210px}
        .prTableWrap{overflow:auto;max-width:100%;border-radius:15px}
        .prTable{width:100%;min-width:930px;border-collapse:collapse;font-size:12px}
        .prTable th,.prTable td{padding:12px 11px;text-align:left;border-bottom:1px solid var(--line,rgba(30,60,45,.1));vertical-align:top}
        .prTable th{font-size:10px;color:var(--muted,#718078);font-weight:800;background:#f8faf8;white-space:nowrap}
        .prTable td{line-height:1.45}.prStrong{font-weight:800;color:#244638}.prMuted{color:var(--muted,#718078);font-size:11px}
        .prStatus{display:inline-flex;padding:5px 8px;border-radius:999px;background:#e9f5ee;color:#286346;font-size:10px;font-weight:800}
        .prFoot{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 14px}
        .prEmpty{padding:35px 16px;text-align:center;color:var(--muted,#718078);font-size:12px}
        .prAlert{padding:12px 14px;border-radius:12px;background:#fff5e8;color:#825a20;font-size:12px}
        @media(max-width:640px){.prKpis{grid-template-columns:1fr}.prHead{display:grid}.prActions{width:100%}.prButton{flex:1}}
      `}</style>
      <header className="prHead">
        <div>
          <h2>Register Pasien</h2>
          <p>Rekapan episode pelayanan pasien dari catatan unit yang telah dilaporkan. Identitas pasien disamarkan secara default.</p>
        </div>
        <div className="prActions">
          <button className="prButton" type="button" onClick={() => setShowIdentity((value) => !value)}>{showIdentity ? 'Samarkan Identitas' : 'Tampilkan Identitas'}</button>
          <button className="prButton" type="button" onClick={() => downloadCsv(filtered, showIdentity)} disabled={!filtered.length}>Ekspor CSV</button>
          <button className="prButton primary" type="button" onClick={onOpenLogbook}>Input Catatan Pasien</button>
        </div>
      </header>

      <div className="prKpis">
        <div className="prKpi"><span>Total episode · tahun {year}</span><strong>{total.toLocaleString('id-ID')}</strong></div>
        <div className="prKpi"><span>Episode selesai · halaman ini</span><strong>{discharged.toLocaleString('id-ID')}</strong></div>
        <div className="prKpi"><span>Masih dirawat · halaman ini</span><strong>{activeEpisodes.toLocaleString('id-ID')}</strong></div>
      </div>

      <div className="prPanel prFilters">
        <div className="prUnitScope"><span>Unit pelayanan</span><strong>{rooms.find((room) => String(room.id) === roomFilter)?.name || 'Unit belum dipetakan'}</strong></div>
        <label>Tahun
          <select value={year} onChange={(event) => { setYear(event.target.value); setPage(0) }}>
            {[2025, 2026, 2027, 2028, 2029].map((item) => <option key={item} value={String(item)}>{item}</option>)}
          </select>
        </label>
        <label className="prSearch">Cari pada halaman ini
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nama, No. RM, diagnosis, DPJP..." />
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
                  <td><div className="prStrong">{showIdentity ? row.name || '—' : maskName(row.name)}</div><div className="prMuted">{showIdentity ? row.mrn || '—' : maskMrn(row.mrn)}</div></td>
                  <td>{row.unit}</td><td>{row.admission || '—'}</td><td>{row.discharge || '—'}</td>
                  <td>{row.diagnosis || '—'}</td><td>{row.dpjp || '—'}</td><td>{row.los ? row.los + ' hari' : '—'}</td>
                  <td><span className="prStatus">{row.status === 'validated' ? 'Tervalidasi' : row.status === 'ready' ? 'Menunggu validasi' : row.status === 'draft' ? 'Draf' : row.status}</span></td>
                </tr>) : <tr><td colSpan={9}><div className="prEmpty">{search ? 'Tidak ada hasil pada halaman ini.' : 'Belum ada catatan episode pasien untuk filter yang dipilih.'}</div></td></tr>}
            </tbody>
          </table>
        </div>
        <footer className="prFoot">
          <span className="prMuted">Menampilkan {firstRow.toLocaleString('id-ID')}–{lastRow.toLocaleString('id-ID')} dari {total.toLocaleString('id-ID')} episode · 50 data per halaman</span>
          <div className="prActions">
            <button className="prButton" type="button" disabled={page <= 0 || loading} onClick={() => setPage((value) => Math.max(0, value - 1))}>Sebelumnya</button>
            <span className="prMuted">Halaman {page + 1} / {pageCount}</span>
            <button className="prButton" type="button" disabled={(page + 1) * PAGE_SIZE >= total || loading} onClick={() => setPage((value) => value + 1)}>Berikutnya</button>
          </div>
        </footer>
      </div>
      <p className="prMuted">Pencarian dilakukan pada 50 data di halaman aktif. Hak akses unit tetap mengikuti akun dan pembatasan basis data.</p>
    </section>
  )
}
