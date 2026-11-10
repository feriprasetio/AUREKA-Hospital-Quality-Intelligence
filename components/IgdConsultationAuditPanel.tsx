'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { maskIgdMedicalRecord, maskIgdPatientName } from '@/lib/aureka/igd-logbook'

const quality = () => aurekaSupabase.schema('aureka_quality')

type ConsultationAudit = {
  id: string
  source_period_month: number
  source_workbook: string
  source_sheet: string
  source_excel_row: number
  patient_name: string
  medical_record_no: string
  requesting_doctor: string
  specialist: string
  registration_at: string | null
  consultation_at: string | null
  reported_elapsed_minutes: number | null
  calculated_elapsed_minutes: number | null
  source_performance_label: string
  match_status: string
  match_note: string
  source_warnings: string[]
}

const MONTHS = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember']

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a,b)=>a-b)
  const middle = Math.floor(sorted.length/2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle-1] + sorted[middle]) / 2
}

export default function IgdConsultationAuditPanel({ roomId, year }: { roomId: number | null; year: number }) {
  const [rows, setRows] = useState<ConsultationAudit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [month, setMonth] = useState(0)
  const [expanded, setExpanded] = useState(false)

  const load = useCallback(async () => {
    if (roomId !== 6 || year !== 2026) return
    setLoading(true)
    setError('')
    try {
      const { data, error } = await quality()
        .from('igd_consultation_audits')
        .select('id,source_period_month,source_workbook,source_sheet,source_excel_row,patient_name,medical_record_no,requesting_doctor,specialist,registration_at,consultation_at,reported_elapsed_minutes,calculated_elapsed_minutes,source_performance_label,match_status,match_note,source_warnings')
        .eq('profile_year', 2026)
        .order('registration_at', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1000)
      if (error) throw error
      setRows((data ?? []) as ConsultationAudit[])
    } catch (cause) {
      setRows([])
      setError(cause instanceof Error ? cause.message : 'Audit konsultasi DPJP belum dapat dimuat.')
    } finally {
      setLoading(false)
    }
  }, [roomId, year])

  useEffect(() => { void load() }, [load])

  const visibleRows = useMemo(() => {
    const filtered = month ? rows.filter(row => Number(row.source_period_month) === month) : rows
    return filtered.slice(0, expanded ? 1000 : 80)
  }, [rows, month, expanded])
  const stats = useMemo(() => {
    const filtered = month ? rows.filter(row => Number(row.source_period_month) === month) : rows
    const yes = filtered.filter(row => String(row.source_performance_label ?? '').trim().toLocaleLowerCase('id-ID') === 'ya').length
    const no = filtered.filter(row => String(row.source_performance_label ?? '').trim().toLocaleLowerCase('id-ID') === 'tidak').length
    const linked = filtered.filter(row => row.match_status === 'matched_unique_linked').length
    const ambiguous = filtered.filter(row => row.match_status === 'ambiguous_rm_date').length
    const unmatched = filtered.length - linked - ambiguous
    const reported = filtered.map(row => row.reported_elapsed_minutes).filter((value): value is number => value != null && Number.isFinite(Number(value))).map(Number)
    const calculated = filtered.map(row => row.calculated_elapsed_minutes).filter((value): value is number => value != null && Number.isFinite(Number(value))).map(Number)
    return {
      total: filtered.length, yes, no, linked, ambiguous, unmatched,
      medianReported: median(reported), medianCalculated: median(calculated),
      warnings: filtered.filter(row => Array.isArray(row.source_warnings) && row.source_warnings.length > 0).length,
    }
  }, [rows, month])

  if (roomId !== 6 || year !== 2026) return null
  return (
    <section className="glass aqIgdConsultationPanel" style={{ marginTop: 14, overflow: 'hidden' }}>
      <div className="aqTableHead">
        <div>
          <h4>Audit Konsultasi DPJP IGD</h4>
          <p>Data pendukung dari lima workbook bulanan · terpisah dari denominator episode pasien</p>
        </div>
        <div className="aqActions">
          <label className="aqField" style={{ minWidth: 130 }}>
            <span>Bulan sumber</span>
            <select value={month} onChange={event => setMonth(Number(event.target.value))}>
              <option value={0}>Semua bulan</option>
              {MONTHS.slice(0,5).map((name,index)=><option key={name} value={index+1}>{name}</option>)}
            </select>
          </label>
          <button type="button" className="aqBtn" disabled={loading} onClick={() => void load()}>{loading ? 'Memuat…' : '↻ Muat audit'}</button>
        </div>
      </div>
      <div style={{ padding: 15, display: 'grid', gap: 12 }}>
        <div className="aqNotice">
          Durasi yang ditampilkan adalah selisih Waktu Registrasi hingga Waktu Konsultasi DPJP. Nilai ini belum menggantikan pengukuran response time ≤30 menit sejak permintaan konsultasi. Label Ya/Tidak tetap label sumber.
        </div>
        {error && <div className="ciMessage ciWarning">{error}</div>}
        {!error && <div className="aqKpi" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(135px,1fr))' }}>
          <div className="glass"><span>Sampel tersimpan</span><strong>{stats.total}</strong><small>maksimal 1.000 ditampilkan</small></div>
          <div className="glass"><span>Label Ya</span><strong>{stats.yes}</strong><small>tanpa konversi ke kode</small></div>
          <div className="glass"><span>Label Tidak</span><strong>{stats.no}</strong><small>tanpa konversi ke kode</small></div>
          <div className="glass"><span>Relasi episode unik</span><strong>{stats.linked}</strong><small>RM + tanggal + episode</small></div>
          <div className="glass"><span>RM/tanggal ambigu</span><strong>{stats.ambiguous}</strong><small>tidak ditautkan paksa</small></div>
          <div className="glass"><span>Belum cocok</span><strong>{stats.unmatched}</strong><small>perlu verifikasi sumber</small></div>
          <div className="glass"><span>Median durasi sumber</span><strong>{stats.medianReported == null ? '—' : stats.medianReported.toFixed(1) + '′'}</strong><small>kolom Target capaian</small></div>
          <div className="glass"><span>Median timestamp</span><strong>{stats.medianCalculated == null ? '—' : stats.medianCalculated.toFixed(1) + '′'}</strong><small>registrasi ke konsultasi</small></div>
        </div>}
        {loading && rows.length === 0 && <div className="aqEmpty">Memuat audit konsultasi DPJP…</div>}
        {!loading && !error && rows.length === 0 && <div className="aqEmpty">Belum ada audit konsultasi DPJP yang diimpor.</div>}
        {visibleRows.length > 0 && <div className="aqWrap" style={{ maxHeight: 460 }}>
          <table className="aqData">
            <thead><tr><th>Bulan</th><th>Waktu registrasi</th><th>Nama pasien</th><th>No. RM</th><th>Dokter IGD</th><th>Dokter spesialis</th><th>Durasi sumber</th><th>Durasi hitung</th><th>Ya/Tidak</th><th>Relasi</th></tr></thead>
            <tbody>{visibleRows.map(row => <tr key={row.id}>
              <td>{MONTHS[(Number(row.source_period_month)||1)-1]}</td>
              <td>{row.registration_at ? String(row.registration_at).replace('T',' ').slice(0,19) : '—'}</td>
              <td>{maskIgdPatientName(row.patient_name)}</td>
              <td>{maskIgdMedicalRecord(row.medical_record_no)}</td>
              <td>{row.requesting_doctor || '—'}</td>
              <td>{row.specialist || '—'}</td>
              <td>{row.reported_elapsed_minutes == null ? '—' : Number(row.reported_elapsed_minutes).toFixed(1) + ' menit'}</td>
              <td>{row.calculated_elapsed_minutes == null ? '—' : Number(row.calculated_elapsed_minutes).toFixed(1) + ' menit'}</td>
              <td>{row.source_performance_label || '—'}</td>
              <td>{row.match_status}</td>
            </tr>)}</tbody>
          </table>
        </div>}
        {rows.length > 80 && <button type="button" className="aqBtn" onClick={() => setExpanded(value => !value)}>{expanded ? 'Tampilkan 80 baris' : 'Tampilkan seluruh ' + Math.min(rows.length,1000) + ' baris'}</button>}
        <div className="aqMetaText">{stats.warnings} sampel memiliki catatan QA. Identitas pasien disamarkan pada daftar ini; nama file dan baris sumber tersimpan pada provenance.</div>
      </div>
    </section>
  )
}
