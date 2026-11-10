'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'

const db = aurekaSupabase.schema('aureka_quality')
const PAGE_SIZE = 25
const SELECT_FIELDS = [
  'id','source_workbook','source_sheet','source_excel_row','source_no','consultation_month',
  'patient_name','medical_record_no','age','sex','patient_type','ed_doctor','specialist_doctor',
  'nurse','registered_at','consultation_at','registration_to_consultation_minutes',
  'source_duration_minutes','door_to_decision_label','door_to_decision_code',
  'quality_attainment','dpjp_response_reason','dpjp_response_code','other_reason',
  'link_status','candidate_source_rows','match_delta_seconds','review_flags','review_status','source_json',
].join(',')

type ConsultationAudit = {
  id: string
  source_workbook: string
  source_sheet: string
  source_excel_row: number
  source_no: string | null
  consultation_month: number
  patient_name: string
  medical_record_no: string
  age: string | null
  sex: string | null
  patient_type: string | null
  ed_doctor: string | null
  specialist_doctor: string | null
  nurse: string | null
  registered_at: string | null
  consultation_at: string | null
  registration_to_consultation_minutes: number | null
  source_duration_minutes: number | null
  door_to_decision_label: string | null
  door_to_decision_code: number | null
  quality_attainment: string | null
  dpjp_response_reason: string | null
  dpjp_response_code: number | null
  other_reason: string | null
  link_status: 'matched' | 'ambiguous' | 'unmatched'
  candidate_source_rows: number[] | null
  match_delta_seconds: number | null
  review_flags: string[] | null
  source_json: Record<string, unknown> | null
  review_status: 'pending' | 'reviewed' | 'excluded'
}

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return value
  return date.toLocaleString('id-ID', { timeZone: 'Asia/Pontianak', dateStyle: 'short', timeStyle: 'short' })
}

function csvCell(value: unknown): string {
  let text = value == null ? '' : Array.isArray(value) ? value.join('; ') : String(value)
  // Prevent spreadsheet formula execution when a source text begins with a formula prefix.
  if (/^[=+@]/.test(text) || /^-[^0-9]/.test(text)) text = "'" + text
  return '"' + text.replace(/"/g, '""') + '"'
}

export default function IgdConsultationAuditPanel() {
  const [rows, setRows] = useState<ConsultationAudit[]>([])
  const [total, setTotal] = useState(0)
  const [matchedCount, setMatchedCount] = useState(0)
  const [ambiguousCount, setAmbiguousCount] = useState(0)
  const [unmatchedCount, setUnmatchedCount] = useState(0)
  const [month, setMonth] = useState(0)
  const [linkStatus, setLinkStatus] = useState('')
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState(true)
  const [loading, setLoading] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState('')

  const filters = useMemo(() => ({ month, linkStatus }), [month, linkStatus])

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      let listQuery = db.from('ed_consultation_audits')
        .select(SELECT_FIELDS, { count: 'exact' })
        .eq('room_id', 6)
        .eq('profile_year', 2026)
      if (filters.month) listQuery = listQuery.eq('consultation_month', filters.month)
      if (filters.linkStatus) listQuery = listQuery.eq('link_status', filters.linkStatus)
      const from = page * PAGE_SIZE
      const { data, error: queryError, count } = await listQuery
        .order('consultation_at', { ascending: false, nullsFirst: false })
        .order('source_excel_row', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      if (queryError) throw queryError
      setRows((data ?? []) as unknown as ConsultationAudit[])
      setTotal(Number(count ?? 0))

      const countFor = async (status: string) => {
        let query = db.from('ed_consultation_audits').select('id', { count: 'exact', head: true })
          .eq('room_id', 6).eq('profile_year', 2026).eq('link_status', status)
        if (filters.month) query = query.eq('consultation_month', filters.month)
        const result = await query
        if (result.error) throw result.error
        return Number(result.count ?? 0)
      }
      const [matched, ambiguous, unmatched] = await Promise.all([
        countFor('matched'), countFor('ambiguous'), countFor('unmatched'),
      ])
      setMatchedCount(matched)
      setAmbiguousCount(ambiguous)
      setUnmatchedCount(unmatched)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Data audit konsultasi DPJP belum dapat dimuat.')
      setRows([])
      setTotal(0)
    } finally {
      setLoading(false)
    }
  }, [filters, page])

  useEffect(() => { void load() }, [load])
  useEffect(() => {
    const refresh = () => { void load() }
    window.addEventListener('aureka:igd-imported', refresh)
    return () => window.removeEventListener('aureka:igd-imported', refresh)
  }, [load])

  const exportCsv = async () => {
    setExporting(true)
    setError('')
    try {
      const all: ConsultationAudit[] = []
      let offset = 0
      while (true) {
        let query = db.from('ed_consultation_audits')
          .select(SELECT_FIELDS)
          .eq('room_id', 6)
          .eq('profile_year', 2026)
        if (filters.month) query = query.eq('consultation_month', filters.month)
        if (filters.linkStatus) query = query.eq('link_status', filters.linkStatus)
        const { data, error: queryError } = await query
          .order('consultation_at', { ascending: false, nullsFirst: false })
          .range(offset, offset + 499)
        if (queryError) throw queryError
        const batch = (data ?? []) as unknown as ConsultationAudit[]
        all.push(...batch)
        if (batch.length < 500) break
        offset += 500
      }
      const columns: Array<[string, (row: ConsultationAudit) => unknown]> = [
        ['Bulan Konsultasi', row => MONTHS[row.consultation_month - 1] ?? row.consultation_month],
        ['Nama Pasien', row => row.patient_name],
        ['No. Rekam Medis', row => row.medical_record_no],
        ['Umur', row => row.age],
        ['Jenis Kelamin', row => row.sex],
        ['Jenis Pasien', row => row.patient_type],
        ['Dokter IGD', row => row.ed_doctor],
        ['Dokter Spesialis', row => row.specialist_doctor],
        ['Perawat', row => row.nurse],
        ['Waktu Registrasi', row => row.registered_at],
        ['Waktu Konsultasi DPJP', row => row.consultation_at],
        ['Registrasi ke Konsultasi (Menit)', row => row.registration_to_consultation_minutes],
        ['Durasi Formula Sumber (Menit)', row => row.source_duration_minutes],
        ['Durasi Formula Sumber (Raw)', row => row.source_json?.source_target_duration_minutes],
        ['Raw Source JSON', row => JSON.stringify(row.source_json ?? {})],
        ['Door-to-Decision Sumber', row => row.door_to_decision_label],
        ['Capaian Mutu Sumber', row => row.quality_attainment],
        ['Alasan Respons DPJP Sumber', row => row.dpjp_response_reason],
        ['Kode Alasan DPJP', row => row.dpjp_response_code],
        ['Alasan Lain', row => row.other_reason],
        ['Status Tautan Episode', row => row.link_status],
        ['Kandidat Baris Episode', row => row.candidate_source_rows],
        ['Delta Matching (Detik)', row => row.match_delta_seconds],
        ['Status Telaah', row => row.review_status],
        ['Flag Telaah', row => row.review_flags],
        ['Nama Workbook', row => row.source_workbook],
        ['Sheet', row => row.source_sheet],
        ['Baris Excel', row => row.source_excel_row],
      ]
      const csv = '\uFEFF' + [
        columns.map(([heading]) => csvCell(heading)).join(','),
        ...all.map(row => columns.map(([, getter]) => csvCell(getter(row))).join(',')),
      ].join('\r\n')
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = 'AUREKA_IGD_Audit_Konsultasi_DPJP_2026.csv'
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      URL.revokeObjectURL(url)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ekspor audit konsultasi DPJP gagal.')
    } finally {
      setExporting(false)
    }
  }

  return <section className="glass aqIgdConsultPanel" style={{ borderRadius: 14, padding: 14, display: 'grid', gap: 10 }}>
    <style>{'.aqIgdConsultPanel .igdPanelKpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.aqIgdConsultPanel .igdPanelKpi{border:1px solid var(--line);border-radius:11px;padding:9px;background:#fff}.aqIgdConsultPanel .igdPanelKpi small{display:block;font-size:9px;color:var(--muted)}.aqIgdConsultPanel .igdPanelKpi strong{font-size:18px;display:block;margin-top:3px}.aqIgdConsultPanel .igdPanelActions{display:flex;gap:7px;align-items:center;flex-wrap:wrap}.aqIgdConsultPanel select{min-height:34px;border:1px solid var(--line);border-radius:8px;padding:6px 8px;background:#fff;font-size:11px}.aqIgdConsultPanel .igdPanelTable{max-width:100%;overflow:auto;border:1px solid var(--line);border-radius:9px}.aqIgdConsultPanel table{width:100%;min-width:1080px;border-collapse:collapse;font-size:10px}.aqIgdConsultPanel th,.aqIgdConsultPanel td{padding:8px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.aqIgdConsultPanel th{background:#f5f8f6;position:sticky;top:0;z-index:1}.aqIgdConsultPanel .igdPanelWarn{font-size:10px;color:#755922;background:#fff8e7;border-radius:8px;padding:9px}.aqIgdConsultPanel .igdPanelError{font-size:10px;color:#8b3028;background:#fff0ef;border-radius:8px;padding:9px}@media(max-width:700px){.aqIgdConsultPanel .igdPanelKpis{grid-template-columns:repeat(2,minmax(0,1fr))}}'}</style>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
      <div>
        <strong style={{ fontSize: 13 }}>Audit Sampel Konsultasi DPJP IGD</strong>
        <div style={{ fontSize: 10, color: 'var(--muted)', marginTop: 3 }}>Data bukti sumber terpisah dari denominator seluruh kunjungan IGD.</div>
      </div>
      <div className="igdPanelActions">
        <button type="button" className="aqBtn" onClick={() => setExpanded(value => !value)}>{expanded ? 'Ringkas' : 'Tampilkan audit'}</button>
        <button type="button" className="aqBtn" onClick={() => void load()} disabled={loading}>Muat ulang</button>
      </div>
    </div>
    <div className="igdPanelKpis">
      <div className="igdPanelKpi"><small>Total sampel sesuai filter</small><strong>{total.toLocaleString('id-ID')}</strong></div>
      <div className="igdPanelKpi"><small>Tertaut unik</small><strong>{matchedCount.toLocaleString('id-ID')}</strong></div>
      <div className="igdPanelKpi"><small>Ambigu</small><strong>{ambiguousCount.toLocaleString('id-ID')}</strong></div>
      <div className="igdPanelKpi"><small>Belum cocok</small><strong>{unmatchedCount.toLocaleString('id-ID')}</strong></div>
    </div>
    {expanded && <>
      <div className="igdPanelActions">
        <label style={{ fontSize: 10, color: 'var(--muted)' }}>Bulan konsultasi
          <select aria-label="Filter bulan konsultasi DPJP" value={month} onChange={event => { setMonth(Number(event.target.value)); setPage(0) }}>
            <option value={0}>Semua bulan</option>
            {MONTHS.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
          </select>
        </label>
        <label style={{ fontSize: 10, color: 'var(--muted)' }}>Status tautan
          <select aria-label="Filter status tautan DPJP" value={linkStatus} onChange={event => { setLinkStatus(event.target.value); setPage(0) }}>
            <option value="">Semua status</option>
            <option value="matched">Tertaut unik</option>
            <option value="ambiguous">Ambigu</option>
            <option value="unmatched">Belum cocok</option>
          </select>
        </label>
        <button type="button" className="aqBtn" onClick={() => void exportCsv()} disabled={exporting || total === 0}>{exporting ? 'Mengekspor…' : 'Ekspor CSV'}</button>
      </div>
      {error && <div className="igdPanelError">{error}</div>}
      {loading ? <div style={{ fontSize: 10, color: 'var(--muted)' }}>Memuat bukti konsultasi…</div> : rows.length === 0
        ? <div style={{ fontSize: 10, color: 'var(--muted)' }}>Belum ada data audit konsultasi DPJP pada filter ini. Impor workbook utama dan file sampel melalui tombol Upload worksheet.xlsx.</div>
        : <div className="igdPanelTable"><table>
          <thead><tr><th>Bulan</th><th>Pasien / RM</th><th>Dokter Spesialis</th><th>Registrasi</th><th>Konsultasi DPJP</th><th>Reg. → Konsultasi (menit)</th><th>Door-to-Decision sumber</th><th>Capaian / alasan DPJP sumber</th><th>Tautan</th><th>Flag telaah</th></tr></thead>
          <tbody>{rows.map(row => <tr key={row.id}>
            <td>{MONTHS[row.consultation_month - 1] ?? row.consultation_month}</td>
            <td><strong>{row.patient_name}</strong><div style={{ color: 'var(--muted)' }}>{row.medical_record_no}</div></td>
            <td>{row.specialist_doctor || row.source_sheet || '—'}</td>
            <td>{formatDateTime(row.registered_at)}</td>
            <td>{formatDateTime(row.consultation_at)}</td>
            <td>{row.registration_to_consultation_minutes == null ? '—' : Number(row.registration_to_consultation_minutes).toFixed(0)}</td>
            <td>{row.door_to_decision_label || '—'}</td>
            <td>{row.quality_attainment || '—'}<div style={{ color: 'var(--muted)' }}>{row.dpjp_response_reason || '—'}</div></td>
            <td><strong>{row.link_status === 'matched' ? 'Tertaut' : row.link_status === 'ambiguous' ? 'Ambigu' : 'Belum cocok'}</strong><div style={{ color: 'var(--muted)' }}>{row.review_status}</div></td>
            <td>{(row.review_flags ?? []).join(', ') || '—'}</td>
          </tr>)}</tbody>
        </table></div>}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 10, color: 'var(--muted)' }}>Menampilkan {total === 0 ? 0 : page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} dari {total.toLocaleString('id-ID')} sampel</span>
        <div className="igdPanelActions">
          <button type="button" className="aqBtn" disabled={page === 0 || loading} onClick={() => setPage(value => Math.max(0, value - 1))}>Sebelumnya</button>
          <button type="button" className="aqBtn" disabled={(page + 1) * PAGE_SIZE >= total || loading} onClick={() => setPage(value => value + 1)}>Berikutnya</button>
        </div>
      </div>
    </>}
    <div className="igdPanelWarn">Interpretasi: durasi yang ditampilkan adalah selisih Waktu Registrasi ke Waktu Konsultasi DPJP. Ini bukan Response Time DPJP sejak permintaan konsultasi dan tidak digunakan untuk menghitung indikator 6.3.</div>
  </section>
}
