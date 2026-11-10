'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePatientEpisode, type PatientEpisode } from '@/lib/aureka/patient-registry'
import AsyncStatePanel from '@/components/AsyncStatePanel'

type Room = { id: number; name: string }
type StoredEpisode = {
  id: string
  room_id: number
  status: string
  record_date: string | null
  measurement_grain: string | null
  core_data: Record<string, any> | null
  created_at: string
  updated_at: string
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const panelStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5ece8', borderRadius: 16, padding: 18, minWidth: 0, boxShadow: '0 2px 8px rgba(18,50,35,.035)' }
const labelStyle: React.CSSProperties = { color: '#66776d', fontSize: 11, fontWeight: 700 }
const valueStyle: React.CSSProperties = { color: '#153d2b', fontSize: 25, lineHeight: 1.2, fontWeight: 800, letterSpacing: '-.04em' }

function monthKey(value: string | null | undefined) { return String(value ?? '').slice(0, 7) }
function numberLabel(value: number) { return value.toLocaleString('id-ID', { maximumFractionDigits: 1 }) }
function LineTrend({ values, title }: { values: number[]; title: string }) {
  const width = 620, height = 210, padX = 34, padY = 24
  const max = Math.max(1, ...values)
  const x = (i: number) => padX + i * (width - padX * 2) / 11
  const y = (v: number) => height - padY - (v / max) * (height - padY * 2)
  const path = values.map((v, i) => `${i ? 'L' : 'M'} ${x(i)} ${y(v)}`).join(' ')
  return <div style={{ width: '100%', overflowX: 'auto' }}>
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={title} style={{ width: '100%', minWidth: 460, display: 'block' }}>
      {[0, .25, .5, .75, 1].map(t => <g key={t}><line x1={padX} x2={width - padX} y1={height - padY - t * (height - padY * 2)} y2={height - padY - t * (height - padY * 2)} stroke="#e8efeb" strokeDasharray="3 5"/><text x={padX - 8} y={height - padY - t * (height - padY * 2) + 4} textAnchor="end" fontSize="10" fill="#839188">{Math.round(max * t)}</text></g>)}
      <path d={path} fill="none" stroke="#16835b" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"/>
      {values.map((v, i) => <g key={i}><circle cx={x(i)} cy={y(v)} r="4" fill="#fff" stroke="#16835b" strokeWidth="2.5"/><text x={x(i)} y={height - 5} textAnchor="middle" fontSize="10" fill="#74847a">{MONTHS[i]}</text></g>)}
    </svg>
  </div>
}
function BarList({ rows }: { rows: Array<{ label: string; value: number; note?: string }> }) {
  const max = Math.max(1, ...rows.map(x => x.value))
  return <div style={{ display: 'grid', gap: 12 }}>
    {rows.map((row, index) => <div key={row.label + index} style={{ display: 'grid', gap: 5 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12, color: '#344b3d' }}><strong>{row.label}</strong><span>{numberLabel(row.value)}{row.note ? ` · ${row.note}` : ''}</span></div>
      <div style={{ height: 8, background: '#eef3ef', borderRadius: 99, overflow: 'hidden' }}><div style={{ height: '100%', width: `${Math.max(2, row.value / max * 100)}%`, background: '#23845e', borderRadius: 99 }}/></div>
    </div>)}
    {!rows.length && <p style={{ color: '#829087', fontSize: 12, margin: 0 }}>Belum ada data pada periode ini.</p>}
  </div>
}

export default function OverviewInfographics({
  supabase, rooms, roomId, manager, canViewAllRooms,
}: {
  supabase: SupabaseClient
  rooms: Room[]
  roomId: number | null
  manager: boolean
  canViewAllRooms: boolean
}) {
  const currentYear = new Date().getFullYear()
  const [year, setYear] = useState(currentYear)
  const [selectedRoom, setSelectedRoom] = useState<string>(() => canViewAllRooms ? 'all' : String(roomId ?? ''))
  const [rows, setRows] = useState<StoredEpisode[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [reload, setReload] = useState(0)
  useEffect(() => {
    if (!canViewAllRooms && roomId != null) setSelectedRoom(String(roomId))
  }, [canViewAllRooms, roomId])
  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      let query = (supabase as any).schema('aureka_quality').from('quality_records')
        .select('id,room_id,status,record_date,measurement_grain,core_data,created_at,updated_at')
        .eq('profile_year', year).neq('status', 'archived')
        .order('record_date', { ascending: true }).order('id', { ascending: true })
      if (!canViewAllRooms || selectedRoom !== 'all') {
        const id = Number(canViewAllRooms ? selectedRoom : roomId)
        if (!Number.isSafeInteger(id) || id <= 0) {
          setRows([]); setLoading(false); return
        }
        query = query.eq('room_id', id)
      }
      const collected: StoredEpisode[] = []
      const pageSize = 500
      for (let from = 0; from < 10000; from += pageSize) {
        const { data, error: queryError } = await query.range(from, from + pageSize - 1)
        if (queryError) throw queryError
        const page = (data ?? []) as StoredEpisode[]
        collected.push(...page)
        if (page.length < pageSize) break
      }
      if (collected.length >= 10000) throw new Error('Data melebihi batas rekap infografis. Persempit pilihan unit atau tahun.')
      setRows(collected)
    } catch (cause) {
      setRows([])
      setError(cause instanceof Error ? cause.message : 'Data infografis belum dapat dimuat.')
    } finally { setLoading(false) }
  }, [supabase, year, selectedRoom, roomId, canViewAllRooms, reload])
  useEffect(() => { void load() }, [load])

  const metrics = useMemo(() => {
    const today = new Date()
    const todayKey = [today.getFullYear(), String(today.getMonth() + 1).padStart(2, '0'), String(today.getDate()).padStart(2, '0')].join('-')
    const episodes = rows.map(row => ({ row, episode: normalizePatientEpisode(row, today) }))
    const patientEpisodes = episodes.filter(({ episode }) => episode.measurementGrain === 'patient_episode' || (!!episode.name && !!episode.admissionDate))
    const hasPatientEpisodes = patientEpisodes.length > 0
    const selectedRows = hasPatientEpisodes ? patientEpisodes : episodes
    const monthly = Array.from({ length: 12 }, (_, index) => {
      const key = `${year}-${String(index + 1).padStart(2, '0')}`
      return selectedRows.filter(({ episode, row }) => monthKey(episode.recordDate ?? row.record_date) === key).length
    })
    const activeBeds = patientEpisodes.filter(({ episode }) => episode.isCurrentlyAdmitted).length
    const losValues = patientEpisodes.map(({ episode }) => episode.lengthOfStayDays).filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0)
    const averageLos = losValues.length ? losValues.reduce((sum, n) => sum + n, 0) / losValues.length : null
    const diagnosisCounts = new Map<string, { code: string; label: string; count: number; needsReview: boolean }>()
    for (const { episode } of patientEpisodes) {
      if (!episode.diagnosis) continue
      const key = episode.icd10Code ?? 'UNMAPPED:' + episode.diagnosis.toLocaleLowerCase('id-ID')
      const entry = diagnosisCounts.get(key) ?? { code: episode.icd10Code ?? 'Belum dipetakan', label: episode.diagnosis, count: 0, needsReview: episode.icd10NeedsReview }
      entry.count += 1
      diagnosisCounts.set(key, entry)
    }
    const topDiagnoses = [...diagnosisCounts.values()].sort((a,b) => b.count - a.count).slice(0, 8)
    const unitCounts = new Map<number, number>()
    episodes.forEach(({ row }) => unitCounts.set(Number(row.room_id), (unitCounts.get(Number(row.room_id)) ?? 0) + 1))
    const grainCounts = new Map<string, number>()
    episodes.forEach(({ episode }) => grainCounts.set(episode.measurementGrain, (grainCounts.get(episode.measurementGrain) ?? 0) + 1))
    const unresolved = patientEpisodes.filter(({ episode }) => episode.icd10NeedsReview).length
    const completed = patientEpisodes.filter(({ episode }) => episode.dischargeDate).length
    return { total: rows.length, patientCount: patientEpisodes.length, hasPatientEpisodes, monthly, activeBeds, averageLos, losN: losValues.length, topDiagnoses, unitCounts, grainCounts, unresolved, completed }
  }, [rows, year])

  return <section style={{ display: 'grid', gap: 16 }}>
    <div style={{ ...panelStyle, display: 'flex', alignItems: 'end', gap: 12, flexWrap: 'wrap' }}>
      <label style={{ display: 'grid', gap: 5, minWidth: 200, flex: 1 }}><span style={labelStyle}>Unit kerja</span>
        <select value={canViewAllRooms ? selectedRoom : String(roomId ?? '')} disabled={!canViewAllRooms} onChange={event => setSelectedRoom(event.target.value)} style={{ minHeight: 40, border: '1px solid #dce7e0', borderRadius: 9, padding: '8px 10px', background: '#fff' }}>
          {canViewAllRooms && <option value="all">Seluruh rumah sakit</option>}
          {rooms.map(item => <option key={item.id} value={String(item.id)}>{item.name}</option>)}
        </select>
      </label>
      <label style={{ display: 'grid', gap: 5, minWidth: 120 }}><span style={labelStyle}>Tahun</span><select value={year} onChange={event => setYear(Number(event.target.value))} style={{ minHeight: 40, border: '1px solid #dce7e0', borderRadius: 9, padding: '8px 10px', background: '#fff' }}>{[2025,2026,2027,2028,2029].map(item => <option key={item}>{item}</option>)}</select></label>
      <button type="button" onClick={() => setReload(value => value + 1)} disabled={loading} style={{ minHeight: 40, border: '1px solid #dce7e0', borderRadius: 9, padding: '8px 14px', background: '#f7faf8', color: '#234a36', fontWeight: 700 }}>↻ Muat ulang</button>
    </div>
    {error && <AsyncStatePanel state="error" title="Infografis belum dapat dimuat" description={error} retrying={loading} onRetry={() => setReload(value => value + 1)} compact/>}
    {loading ? <AsyncStatePanel state="loading" title="Mengolah data unit" description="Menghitung episode, diagnosis, dan tren bulanan." compact/> : !error && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(155px,1fr))', gap: 12 }}>
        <div style={panelStyle}><div style={labelStyle}>{metrics.hasPatientEpisodes ? 'Episode pasien' : 'Total input data'}</div><div style={{ ...valueStyle, marginTop: 7 }}>{numberLabel(metrics.hasPatientEpisodes ? metrics.patientCount : metrics.total)}</div></div>
        <div style={panelStyle}><div style={labelStyle}>Bed terisi saat ini</div><div style={{ ...valueStyle, marginTop: 7 }}>{metrics.hasPatientEpisodes ? numberLabel(metrics.activeBeds) : '—'}</div><small style={{ color: '#839188' }}>{metrics.hasPatientEpisodes ? 'Episode dengan tanggal masuk dan belum keluar' : 'Tidak relevan untuk tipe data unit ini'}</small></div>
        <div style={panelStyle}><div style={labelStyle}>Rata-rata Length of Stay</div><div style={{ ...valueStyle, marginTop: 7 }}>{metrics.hasPatientEpisodes && metrics.averageLos != null ? numberLabel(metrics.averageLos) + ' hari' : '—'}</div><small style={{ color: '#839188' }}>{metrics.losN} episode memiliki nilai LOS</small></div>
        <div style={panelStyle}><div style={labelStyle}>Diagnosis perlu verifikasi ICD-10</div><div style={{ ...valueStyle, marginTop: 7 }}>{metrics.hasPatientEpisodes ? numberLabel(metrics.unresolved) : '—'}</div><small style={{ color: '#839188' }}>Kandidat dan diagnosis tanpa kode eksplisit</small></div>
      </div>
      <div style={{ ...panelStyle, display: 'grid', gap: 12 }}>
        <div><span style={{ ...labelStyle, textTransform: 'uppercase', letterSpacing: '.06em' }}>Tren bulanan</span><h3 style={{ margin: '4px 0 0', fontSize: 17, color: '#1f3d2d' }}>{metrics.hasPatientEpisodes ? 'Jumlah episode pasien per bulan' : 'Jumlah input data per bulan'}</h3></div>
        <LineTrend values={metrics.monthly} title="Tren bulanan jumlah pasien atau input data"/>
      </div>
      {metrics.hasPatientEpisodes ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))', gap: 14 }}>
        <div style={{ ...panelStyle, display: 'grid', gap: 14 }}><div><span style={labelStyle}>DISTRIBUSI DIAGNOSIS</span><h3 style={{ margin: '4px 0 0', fontSize: 17 }}>Diagnosis terbanyak berdasarkan ICD-10</h3></div>
          <BarList rows={metrics.topDiagnoses.map(item => ({ label: item.code === 'Belum dipetakan' ? item.label : item.code + ' · ' + item.label, value: item.count, note: item.needsReview ? 'perlu verifikasi' : undefined }))}/>
          <p style={{ color: '#849188', fontSize: 10, margin: 0 }}>Kode kandidat ditampilkan untuk penelusuran awal dan wajib diverifikasi sebelum digunakan sebagai kode final.</p>
        </div>
        <div style={{ ...panelStyle, display: 'grid', gap: 14 }}><div><span style={labelStyle}>STATUS EPISODE</span><h3 style={{ margin: '4px 0 0', fontSize: 17 }}>Status perawatan pasien</h3></div>
          <BarList rows={[{ label: 'Masih dirawat', value: metrics.activeBeds }, { label: 'Sudah pulang', value: metrics.completed }, { label: 'Diagnosis perlu diverifikasi', value: metrics.unresolved }]}/>
        </div>
      </div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,360px),1fr))', gap: 14 }}>
        <div style={{ ...panelStyle, display: 'grid', gap: 14 }}><div><span style={labelStyle}>METODE PENCATATAN</span><h3 style={{ margin: '4px 0 0', fontSize: 17 }}>Komposisi sumber data unit</h3></div>
          <BarList rows={[...metrics.grainCounts.entries()].map(([label,value]) => ({ label: label.replaceAll('_',' '), value }))}/>
        </div>
        {canViewAllRooms && selectedRoom === 'all' && <div style={{ ...panelStyle, display: 'grid', gap: 14 }}><div><span style={labelStyle}>AKTIVITAS PER UNIT</span><h3 style={{ margin: '4px 0 0', fontSize: 17 }}>Jumlah input data</h3></div>
          <BarList rows={[...metrics.unitCounts.entries()].map(([id,value]) => ({ label: rooms.find(room => room.id === id)?.name ?? `Unit ${id}`, value })).sort((a,b) => b.value-a.value).slice(0,10)}/>
        </div>}
      </div>}
    </>}
  </section>
}
