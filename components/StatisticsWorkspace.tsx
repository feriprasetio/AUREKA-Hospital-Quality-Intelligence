'use client'

import { useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type Dataset = {
  id: string; label: string; schema: string; table: string; select: string; description: string
  orderBy: string; hide?: string[]
}
type Row = Record<string, unknown>

// Dataset yang dapat dianalisis. Kolom berisi identitas pasien atau JSON mentah disembunyikan
// dari tabel ringkasan; tetap dapat diunduh oleh pengelola melalui ekspor bila diperlukan.
const DATASETS: Dataset[] = [
  { id: 'risk', label: 'Risk Register', schema: 'aureka_risk', table: 'risk_register', select: 'id,risk_code,unit_id,unit_name,category,objective,risk_event,likelihood,impact,risk_score,risk_level,residual_likelihood,residual_impact,residual_score,residual_level,owner_name,due_date,status,created_at,updated_at', orderBy: 'risk_score', description: 'Register risiko seluruh unit dengan skor baseline & residual.' },
  { id: 'plans', label: 'RTP / Rencana Mitigasi', schema: 'aureka_risk', table: 'mitigation_plans', select: 'id,plan_code,title,objective,action_plan,expected_output,owner_name,owner_room_id,target_date,target_likelihood,target_impact,status,created_at,updated_at', orderBy: 'updated_at', description: 'Rencana tindak pengendalian dan status persetujuan.' },
  { id: 'fmea', label: 'FMEA / HFMEA', schema: 'aureka_risk', table: 'fmea_analyses', select: 'id,fmea_code,unit_name,process_name,failure_mode,failure_effect,causes,existing_controls,severity,occurrence,detection,rpn,priority,action_plan,owner_name,target_date,status,created_at,updated_at', orderBy: 'rpn', description: 'Analisis modus kegagalan dengan RPN.' },
  { id: 'incidents', label: 'Insiden Keselamatan Pasien', schema: 'aureka_patient_safety', table: 'incidents', select: 'id,incident_code,incident_date,unit_name,incident_type,status,created_at', orderBy: 'created_at', description: 'Laporan IKP (tanpa isi formulir rinci).' },
  { id: 'investigations', label: 'Investigasi / RCA', schema: 'aureka_patient_safety', table: 'investigations', select: 'id,investigation_code,incident_id,status,completed_at,created_at,updated_at', orderBy: 'updated_at', description: 'Hasil investigasi yang terhubung ke laporan IKP.' },
  { id: 'quality', label: 'Episode Indikator Mutu', schema: 'aureka_quality', table: 'quality_records', select: 'id,room_id,profile_year,measurement_grain,record_date,period_start,period_end,status,review_required,created_at,updated_at', orderBy: 'created_at', description: 'Rekam episode indikator mutu tanpa meminta identitas pasien atau JSON mentah.' },
]

const isId = (k: string) => k === 'id' || k.endsWith('_by') || k.endsWith('_id') && k !== 'unit_id' && k !== 'room_id' && k !== 'owner_room_id'
const typeOf = (values: unknown[]) => {
  const v = values.find(x => x !== null && x !== undefined && x !== '')
  if (v === undefined) return 'kosong'
  if (typeof v === 'number') return 'angka'
  if (typeof v === 'boolean') return 'ya/tidak'
  if (typeof v === 'object') return 'JSON'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v)) return 'tanggal'
  return 'teks'
}
const fmt = (n: number) => n.toLocaleString('id-ID', { maximumFractionDigits: 2 })
const cell = (v: unknown) => v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

function toCsv(rows: Row[], cols: string[]) {
  const esc = (v: unknown) => { const s = cell(v); return /[";\n,]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s }
  return '﻿' + [cols.join(';'), ...rows.map(r => cols.map(c => esc(r[c])).join(';'))].join('\n')
}

export default function StatisticsWorkspace({ supabase, rooms }: { supabase: SupabaseClient; rooms: { id: number; name: string }[] }) {
  const [datasetId, setDatasetId] = useState(DATASETS[0].id)
  const [rows, setRows] = useState<Row[]>([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [groupBy, setGroupBy] = useState('')
  const [measure, setMeasure] = useState('')
  const [unit, setUnit] = useState('all')
  const dataset = DATASETS.find(d => d.id === datasetId) || DATASETS[0]

  useEffect(() => {
    let cancelled = false
    const sb = supabase as any
    setLoading(true); setError(''); setRows([]); setGroupBy(''); setMeasure(''); setUnit('all')
    ;(async () => {
      const all: Row[] = []
      for (let from = 0; from < 20000; from += 1000) {
        const { data, error } = await sb.schema(dataset.schema).from(dataset.table).select(dataset.select)
          .order(dataset.orderBy, { ascending: false }).order('id', { ascending: true }).range(from, from + 999)
        if (error) { if (!cancelled) setError(error.message); break }
        all.push(...(data || []))
        if (!data || data.length < 1000) break
      }
      if (!cancelled) { setRows(all); setLoading(false) }
    })()
    return () => { cancelled = true }
  }, [supabase, dataset])

  const columns = useMemo(() => {
    const keys = new Set<string>()
    rows.slice(0, 200).forEach(r => Object.keys(r).forEach(k => keys.add(k)))
    return Array.from(keys).filter(k => !(dataset.hide || []).includes(k))
  }, [rows, dataset])

  const unitKey = columns.includes('unit_name') ? 'unit_name' : columns.includes('room_id') ? 'room_id' : columns.includes('owner_room_id') ? 'owner_room_id' : ''
  const unitLabel = (v: unknown) => unitKey === 'unit_name' ? cell(v) : rooms.find(r => r.id === Number(v))?.name || (v == null ? 'Tanpa unit' : `Unit ${v}`)
  const unitOptions = useMemo(() => unitKey ? Array.from(new Set(rows.map(r => unitLabel(r[unitKey])))).sort((a, b) => a.localeCompare(b, 'id')) : [], [rows, unitKey])
  const filtered = useMemo(() => unit === 'all' || !unitKey ? rows : rows.filter(r => unitLabel(r[unitKey]) === unit), [rows, unit, unitKey])

  const dictionary = useMemo(() => columns.map(c => {
    const values = filtered.map(r => r[c])
    const filled = values.filter(v => v !== null && v !== undefined && v !== '').length
    const distinct = new Set(values.map(cell)).size
    return { name: c, type: typeOf(values), filled, pct: filtered.length ? filled / filtered.length : 0, distinct }
  }), [columns, filtered])

  const categorical = dictionary.filter(d => (d.type === 'teks' || d.type === 'ya/tidak' || (d.type === 'angka' && d.distinct <= 12)) && d.distinct > 0 && d.distinct <= 60 && !isId(d.name))
  const numeric = dictionary.filter(d => d.type === 'angka' && !isId(d.name))
  const activeGroup = groupBy || categorical.find(c => /level|status|category|kategori|incident_type|priority/.test(c.name))?.name || categorical[0]?.name || ''
  const activeMeasure = measure || numeric.find(n => /score|rpn/.test(n.name))?.name || numeric[0]?.name || ''

  const freq = useMemo(() => {
    if (!activeGroup) return []
    const m = new Map<string, number>()
    filtered.forEach(r => { const k = activeGroup === unitKey ? unitLabel(r[activeGroup]) : cell(r[activeGroup]) || '(kosong)'; m.set(k, (m.get(k) || 0) + 1) })
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]).slice(0, 15)
  }, [filtered, activeGroup])

  const summary = useMemo(() => {
    if (!activeMeasure) return null
    const xs = filtered.map(r => Number(r[activeMeasure])).filter(n => Number.isFinite(n)).sort((a, b) => a - b)
    if (!xs.length) return null
    const mean = xs.reduce((a, b) => a + b, 0) / xs.length
    const q = (p: number) => { const i = (xs.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i); return xs[lo] + (xs[hi] - xs[lo]) * (i - lo) }
    const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / Math.max(1, xs.length - 1))
    return { n: xs.length, min: xs[0], max: xs[xs.length - 1], mean, median: q(0.5), q1: q(0.25), q3: q(0.75), sd }
  }, [filtered, activeMeasure])

  const exportCsv = () => {
    const cols = columns
    const blob = new Blob([toCsv(filtered, cols)], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `AUREKA_${dataset.id}_${unit === 'all' ? 'semua-unit' : unit.replace(/\W+/g, '-')}_${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const maxFreq = Math.max(1, ...freq.map(f => f[1]))

  return (
    <div className="ovRoot">
      <section className="ovHero">
        <div>
          <span className="ovEyebrow">MODUL 04 · METADATA & STATISTIK</span>
          <h3>Analisis data AUREKA</h3>
          <p>Kamus data, kelengkapan pengisian, distribusi, dan statistik deskriptif dari data operasional setiap modul. Ekspor mengikuti filter aktif.</p>
        </div>
        <div className="ovHeroMeta">
          <button type="button" className="ovRefresh" onClick={exportCsv} disabled={loading || !filtered.length}>⇩ Ekspor CSV ({fmt(filtered.length)} baris)</button>
        </div>
      </section>

      <div className="stFilters">
        <label>Dataset<select value={datasetId} onChange={e => setDatasetId(e.target.value)}>{DATASETS.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
        {unitKey && <label>Unit<select value={unit} onChange={e => setUnit(e.target.value)}><option value="all">Semua unit</option>{unitOptions.map(u => <option key={u} value={u}>{u}</option>)}</select></label>}
        <label>Kelompokkan menurut<select value={activeGroup} onChange={e => setGroupBy(e.target.value)} disabled={!categorical.length}>{categorical.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select></label>
        <label>Variabel numerik<select value={activeMeasure} onChange={e => setMeasure(e.target.value)} disabled={!numeric.length}>{numeric.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}</select></label>
      </div>
      <p className="stDesc">{dataset.description}</p>

      {error ? <div className="ovNotice">Dataset belum dapat dimuat: {error}</div> : <>
        <div className="ovKpis ovKpis4">
          <div className="ovKpi"><span className="ovKpiLabel">Jumlah baris</span>{loading ? <span className="ovSkeleton ovSkeletonNum" /> : <b>{fmt(filtered.length)}</b>}</div>
          <div className="ovKpi"><span className="ovKpiLabel">Variabel</span>{loading ? <span className="ovSkeleton ovSkeletonNum" /> : <b>{columns.length}</b>}</div>
          <div className="ovKpi"><span className="ovKpiLabel">Kelengkapan rata-rata</span>{loading ? <span className="ovSkeleton ovSkeletonNum" /> : <b>{dictionary.length ? Math.round(dictionary.reduce((a, d) => a + d.pct, 0) / dictionary.length * 100) : 0}%</b>}</div>
          <div className="ovKpi"><span className="ovKpiLabel">Unit tercakup</span>{loading ? <span className="ovSkeleton ovSkeletonNum" /> : <b>{unitKey ? new Set(filtered.map(r => unitLabel(r[unitKey]))).size : '—'}</b>}</div>
        </div>

        <div className="ovGrid ovGrid2">
          <section className="ovPanel">
            <header className="ovPanelHead"><div><span className="ovEyebrow">DISTRIBUSI</span><h4>{activeGroup || 'Tidak ada variabel kategorik'}</h4></div></header>
            {loading ? <div className="ovSkeletonBlock" /> : !freq.length ? <div className="ovEmpty"><b>Belum ada data</b></div> :
              <div className="ovBars">{freq.map(([k, v], idx) => (
                <div key={k} className="ovBarRow ovBarRowUnit" title={`${k}: ${v} (${Math.round(v / filtered.length * 100)}%)`}>
                  <span className="ovUnitName">{k}</span>
                  <div className="ovBarTrack"><div className="ovBarFill lvl-accent" style={{ width: `${v / maxFreq * 100}%`, animationDelay: `${idx * 40}ms` }} /></div>
                  <b>{v}</b>
                </div>))}</div>}
          </section>

          <section className="ovPanel">
            <header className="ovPanelHead"><div><span className="ovEyebrow">STATISTIK DESKRIPTIF</span><h4>{activeMeasure || 'Tidak ada variabel numerik'}</h4></div></header>
            {loading ? <div className="ovSkeletonBlock" /> : !summary ? <div className="ovEmpty"><b>Belum ada nilai numerik</b></div> :
              <dl className="stSummary">
                {([['n', summary.n], ['Rata-rata', summary.mean], ['Median', summary.median], ['Simpangan baku', summary.sd], ['Minimum', summary.min], ['Q1', summary.q1], ['Q3', summary.q3], ['Maksimum', summary.max]] as const)
                  .map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{fmt(Number(v))}</dd></div>)}
              </dl>}
          </section>
        </div>

        <section className="ovPanel" style={{ marginTop: 14 }}>
          <header className="ovPanelHead"><div><span className="ovEyebrow">KAMUS DATA</span><h4>Variabel & kelengkapan pengisian</h4></div></header>
          {loading ? <div className="ovSkeletonBlock" /> :
            <div className="stTableWrap"><table className="stTable">
              <thead><tr><th>Variabel</th><th>Tipe</th><th>Terisi</th><th>Kelengkapan</th><th>Nilai unik</th></tr></thead>
              <tbody>{dictionary.map(d => (
                <tr key={d.name}>
                  <td><code>{d.name}</code></td><td>{d.type}</td><td>{fmt(d.filled)}</td>
                  <td><div className="stFill"><div style={{ width: `${d.pct * 100}%` }} /></div><span>{Math.round(d.pct * 100)}%</span></td>
                  <td>{fmt(d.distinct)}</td>
                </tr>))}
                {!dictionary.length && <tr><td colSpan={5} className="stEmpty">Belum ada data pada dataset ini.</td></tr>}
              </tbody>
            </table></div>}
        </section>
      </>}
    </div>
  )
}
