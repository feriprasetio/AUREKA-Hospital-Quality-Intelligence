'use client'
import { useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { AUREKA_PRIMARY_NAV, type AurekaRole } from '@/lib/aureka/module-registry'
import type { NavigateFn } from '@/lib/aureka/focus'

type Room = { id: number; name: string }
type CountItem = { label: string; count: number }
type MonthItem = { month: number; total: number; validated?: number }
type Summary = {
  year: number; room_id: number | null; room_name: string
  quality: { active_indicators: number; records: number; validated: number; validation_rate: number; monthly: MonthItem[]; categories: CountItem[] }
  incidents: { total: number; open: number; closed: number; monthly: MonthItem[] }
  risk: { total: number; very_high: number; open: number; relationships: number; monthly: MonthItem[]; levels: CountItem[]; categories: CountItem[] }
  program: { recommendations: number; actions: number; open_actions: number; overdue_actions: number; completed_actions: number }
  regulation: { published: number; pending_approval: number; review_due: number }
}
type Props = { rooms: Room[]; role: string | null; mode?: 'full' | 'quality'; initialRoomId?: number | null; unitLocked?: boolean; onNavigate?: NavigateFn }
type ChartSeries = { label: string; color: string; values: Array<number | null> }
type ChartModel = { id: string; label: string; description: string; insight: string; labels: string[]; series: ChartSeries[]; kind: 'trend' | 'distribution' | 'progress' }

const MONTHS = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']
const GLOBAL_ROLES = ['ADMIN','PMKP','MANAGEMENT','DIREKTUR','DEWAN_PENGAWAS']
const DONUT_COLORS = ['#4b8b75','#638ba8','#c58a48','#8b79ad','#6e9d9a','#b97878','#8a9a58','#7a91b8','#ad8b63','#6d9b83','#9b83a8','#8c9ca8','#b28a91']
const n = (v: unknown) => Number.isFinite(Number(v)) ? Number(v) : 0
const fmt = (v: unknown) => n(v).toLocaleString('id-ID')
const pct = (v: unknown) => n(v).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%'
const css = [
'.infographicsDashboard{display:grid;gap:14px;color:var(--arktik-ink,#21374f)}',
'.ifHero{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;flex-wrap:wrap;padding:18px 20px;border:1px solid var(--arktik-edge,#dbe4ed);border-radius:18px;background:linear-gradient(120deg,rgba(239,247,243,.94),rgba(247,250,253,.98));}',
'.ifEyebrow{display:block;margin-bottom:5px;color:#4b8b75;font-size:9px;font-weight:900;letter-spacing:.12em;text-transform:uppercase}',
'.ifHero h2{margin:0;color:var(--arktik-ink,#21374f);font-size:20px;font-weight:850;letter-spacing:-.03em}',
'.ifHero p{max-width:720px;margin:6px 0 0;color:var(--ak-muted,#73849a);font-size:11px;line-height:1.6}',
'.ifFilters{display:flex;align-items:end;gap:9px;flex-wrap:wrap}',
'.ifFilters label{display:grid;gap:5px;color:var(--ak-muted,#73849a);font-size:10px;font-weight:750}',
'.ifFilters select,.ifChartToolbar select{min-width:132px;min-height:36px;padding:7px 30px 7px 10px;border:1px solid var(--arktik-edge,#dbe4ed);border-radius:9px;background:#fff;color:var(--arktik-ink,#21374f);font-size:11px}',
'.ifScope{padding:9px 11px;border:1px solid var(--arktik-edge,#dbe4ed);border-radius:9px;background:var(--arktik-glass,#f6f9fc);color:var(--ak-muted,#73849a);font-size:10px;font-weight:750}',
'.ifKpiGrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}',
'.ifKpi{min-width:0;padding:13px 14px;border:1px solid var(--arktik-edge,#dbe4ed);border-radius:13px;background:var(--surface,#fff);box-shadow:0 5px 18px rgba(29,55,81,.035)}',
'.ifKpi span,.ifKpi small{display:block;color:var(--ak-muted,#73849a);font-size:10px;line-height:1.45}',
'.ifKpi strong{display:block;margin:6px 0 3px;color:var(--arktik-ink,#21374f);font-size:25px;font-weight:850;line-height:1.1;font-variant-numeric:tabular-nums}',
'.ifKpi small{font-size:9px}',
'.ifSectionHead{display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:12px}',
'.ifSectionHead h3{margin:0;color:var(--arktik-ink,#21374f);font-size:14px;font-weight:850}',
'.ifSectionHead p{margin:4px 0 0;color:var(--ak-muted,#73849a);font-size:10px;line-height:1.5}',
'.ifChartCard{min-width:0;padding:16px;border:1px solid var(--arktik-edge,#dbe4ed);border-radius:16px;background:var(--surface,#fff);box-shadow:0 5px 18px rgba(29,55,81,.035)}',
'.ifChartToolbar{display:flex;align-items:end;gap:10px;flex-wrap:wrap;margin:0 0 13px}',
'.ifChartToolbar label{display:grid;gap:5px;color:var(--ak-muted,#73849a);font-size:10px;font-weight:750}',
'.ifChartToolbar .ifChartChoice{flex:1;min-width:220px}',
'.ifChartToolbar .ifChartChoice select{width:100%}',
'.ifTypeSwitch{display:flex;gap:4px;padding:3px;border:1px solid var(--arktik-edge,#dbe4ed);border-radius:10px;background:#f5f8fa}',
'.ifTypeSwitch button{min-height:29px;padding:5px 9px;border:0;border-radius:7px;background:transparent;color:var(--ak-muted,#73849a);font-size:9px;font-weight:800;cursor:pointer}',
'.ifTypeSwitch button[aria-pressed=true]{background:#fff;color:#326d55;box-shadow:0 1px 4px rgba(20,50,35,.1)}',
'.ifChartSvg{display:block;width:100%;height:auto;min-height:190px;overflow:visible}',
'.ifChartLegend{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px;color:var(--ak-muted,#73849a);font-size:10px}',
'.ifChartLegend span{display:inline-flex;align-items:center;gap:5px}',
'.ifChartLegend i{display:inline-block;width:9px;height:9px;border-radius:3px}',
'.ifInsight{margin-top:12px;padding:10px 12px;border-left:3px solid #4b8b75;border-radius:0 9px 9px 0;background:rgba(75,139,117,.07);color:var(--ak-muted,#65786f);font-size:10px;line-height:1.55}',
'.ifInsight b{color:var(--arktik-ink,#21374f)}',
'.ifLowerGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}',
'.ifMiniCard{min-width:0;padding:14px;border:1px solid var(--arktik-edge,#dbe4ed);border-radius:14px;background:var(--surface,#fff)}',
'.ifMiniCard h3{margin:0;color:var(--arktik-ink,#21374f);font-size:12px;font-weight:850}',
'.ifMiniCard p{margin:4px 0 10px;color:var(--ak-muted,#73849a);font-size:9px;line-height:1.5}',
'.ifMiniRow{display:grid;grid-template-columns:minmax(90px,1fr) minmax(70px,1.6fr) auto;gap:8px;align-items:center;margin:8px 0;font-size:9px}',
'.ifMiniRow>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ak-muted,#73849a)}',
'.ifMiniTrack{height:8px;overflow:hidden;border-radius:99px;background:rgba(112,139,166,.12)}.ifMiniTrack i{display:block;height:100%;border-radius:99px;background:#4b8b75}',
'.ifMiniRow b{color:var(--arktik-ink,#21374f);font-variant-numeric:tabular-nums}',
'.ifLinks{display:flex;gap:8px;flex-wrap:wrap}',
'.ifLink{border:1px solid var(--arktik-edge,#dbe4ed);border-radius:9px;padding:8px 11px;background:#fff;color:var(--arktik-ink,#21374f);font-size:10px;font-weight:750;cursor:pointer}',
'.ifLink:hover{border-color:#6d9ab8;background:#f4f8fb}',
'.ifNote,.ifEmpty{margin:0;color:var(--ak-muted,#73849a);font-size:10px;line-height:1.55}',
'.ifLoading,.ifError{padding:12px 14px;border-radius:10px;font-size:11px}.ifLoading{background:rgba(112,139,166,.08);color:var(--ak-muted,#73849a)}.ifError{background:#fff5e8;color:#88591e}',
'@media(max-width:980px){.ifKpiGrid{grid-template-columns:repeat(2,minmax(0,1fr))}}',
'@media(max-width:620px){.ifHero{display:grid;padding:14px}.ifHero h2{font-size:17px}.ifKpiGrid,.ifLowerGrid{grid-template-columns:1fr 1fr}.ifFilters{width:100%}.ifFilters label{flex:1}.ifFilters select{width:100%;min-width:0}.ifChartToolbar{display:grid}.ifChartToolbar .ifChartChoice{min-width:0}.ifTypeSwitch{width:100%;justify-content:space-between}.ifTypeSwitch button{flex:1}.ifChartSvg{min-height:160px}}',
'@media(max-width:380px){.ifKpiGrid,.ifLowerGrid{grid-template-columns:1fr}}'
].join('')

function Kpi({ label, value, note }: { label: string; value: unknown; note?: string }) {
  return <article className="ifKpi"><span>{label}</span><strong>{fmt(value)}</strong>{note && <small>{note}</small>}</article>
}
function Distribution({ items }: { items: CountItem[] }) {
  const max = Math.max(1, ...items.map((item) => n(item.count)))
  if (!items.length) return <p className="ifEmpty">Belum ada observasi pada periode ini.</p>
  return <div>{items.slice(0, 7).map((item) => <div className="ifMiniRow" key={item.label}>
    <span title={item.label}>{item.label}</span><div className="ifMiniTrack"><i style={{ width: String(Math.max(0, n(item.count) / max * 100)) + '%' }} /></div><b>{fmt(item.count)}</b>
  </div>)}</div>
}
function ChartGraphic({ model, type }: { model: ChartModel; type: 'column' | 'bar' | 'line' | 'donut' }) {
  const width = 760
  const height = type === 'donut' ? 300 : 270
  const left = type === 'bar' ? 150 : 42
  const right = 20
  const top = 18
  const bottom = 42
  const plotW = width - left - right
  const plotH = height - top - bottom
  const allValues = model.series.flatMap((series) => series.values.filter((value): value is number => value !== null && Number.isFinite(value)))
  const maxValue = Math.max(1, ...allValues)
  const colors = model.series.map((series) => series.color)
  if (!model.labels.length || !allValues.length) return <p className="ifEmpty">Belum ada observasi untuk grafik ini.</p>
  if (type === 'donut') {
    const values = model.labels.map((_, index) => model.series.reduce((sum, series) => sum + Math.max(0, series.values[index] ?? 0), 0))
    const total = values.reduce((sum, value) => sum + value, 0)
    if (!total) return <p className="ifEmpty">Belum ada nilai positif untuk distribusi.</p>
    const circumference = 2 * Math.PI * 78
    let offset = 0
    return <svg className="ifChartSvg" viewBox="0 0 760 300" role="img" aria-label={model.label + ', diagram donat'}>
      <circle cx="380" cy="145" r="78" fill="none" stroke="#edf1f4" strokeWidth="28"/>
      {values.map((value, index) => {
        const length = value / total * circumference
        const circle = <circle key={model.labels[index]} cx="380" cy="145" r="78" fill="none" stroke={DONUT_COLORS[index % DONUT_COLORS.length]} strokeWidth="28" strokeDasharray={String(length) + ' ' + String(circumference - length)} strokeDashoffset={String(-offset)} transform="rotate(-90 380 145)"/>
        offset += length
        return circle
      })}
      <text x="380" y="140" textAnchor="middle" fontSize="27" fontWeight="850" fill="#21374f">{fmt(total)}</text>
      <text x="380" y="161" textAnchor="middle" fontSize="11" fill="#73849a">Total</text>
      <text x="380" y="270" textAnchor="middle" fontSize="10" fill="#73849a">Rincian kategori tersedia pada legenda di bawah grafik</text>

    </svg>
  }
  if (type === 'bar') {
    const rowH = Math.min(32, Math.max(19, plotH / model.labels.length))
    const dynamicHeight = Math.max(height, top + model.labels.length * rowH + bottom)
    return <svg className="ifChartSvg" viewBox={'0 0 ' + width + ' ' + dynamicHeight} role="img" aria-label={model.label + ', diagram batang horizontal'}>
      {model.labels.map((label, index) => {
        const value = model.series[0]?.values[index] ?? null
        const y = top + index * rowH
        const w = value === null ? 0 : Math.max(0, value / maxValue * (plotW - 8))
        return <g key={label}><text x={left - 10} y={y + rowH * .68} textAnchor="end" fontSize="10" fill="#65778a">{label.length > 23 ? label.slice(0, 21) + '…' : label}</text><rect x={left} y={y + 4} width={plotW} height={Math.max(6, rowH - 9)} rx="4" fill="#eef2f5"/>{value !== null && <rect x={left} y={y + 4} width={w} height={Math.max(6, rowH - 9)} rx="4" fill={colors[0]}/>}<text x={left + w + 7} y={y + rowH * .68} fontSize="10" fontWeight="700" fill="#21374f">{value === null ? '—' : fmt(value)}</text></g>
      })}
    </svg>
  }
  if (type === 'line') {
    const xAt = (index: number) => left + (model.labels.length <= 1 ? plotW / 2 : index / (model.labels.length - 1) * plotW)
    const yAt = (value: number) => top + plotH - value / maxValue * plotH
    return <svg className="ifChartSvg" viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={model.label + ', diagram garis'}>
      {[0, .25, .5, .75, 1].map((fraction) => <g key={fraction}><line x1={left} x2={width - right} y1={top + plotH * fraction} y2={top + plotH * fraction} stroke="#e9eef2" strokeDasharray="3 4"/><text x={left - 8} y={top + plotH * fraction + 3} textAnchor="end" fontSize="9" fill="#8190a0">{fmt(maxValue * (1 - fraction))}</text></g>)}
      {model.series.map((series) => {
        const points = series.values.map((value, index) => value === null ? null : [xAt(index), yAt(value)] as const)
        const segments: string[] = []
        let current = ''
        points.forEach((point) => { if (!point) { if (current) segments.push(current); current = '' } else current += (current ? ' L ' : 'M ') + point[0] + ' ' + point[1] })
        if (current) segments.push(current)
        return <g key={series.label}><path d={segments.join(' ')} fill="none" stroke={series.color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>{points.map((point, index) => point ? <circle key={index} cx={point[0]} cy={point[1]} r="3.5" fill="#fff" stroke={series.color} strokeWidth="2"><title>{model.labels[index]} · {series.label}: {fmt(series.values[index])}</title></circle> : null)}</g>
      })}
      {model.labels.map((label, index) => <text key={label} x={xAt(index)} y={height - 14} textAnchor="middle" fontSize="9" fill="#8190a0">{label}</text>)}
    </svg>
  }
  const groupW = plotW / model.labels.length
  const groupGap = Math.min(8, groupW * .16)
  const barW = Math.max(4, (groupW - groupGap * 2) / Math.max(1, model.series.length))
  return <svg className="ifChartSvg" viewBox={'0 0 ' + width + ' ' + height} role="img" aria-label={model.label + ', diagram kolom'}>
    {[0, .25, .5, .75, 1].map((fraction) => <g key={fraction}><line x1={left} x2={width - right} y1={top + plotH * fraction} y2={top + plotH * fraction} stroke="#e9eef2" strokeDasharray="3 4"/><text x={left - 8} y={top + plotH * fraction + 3} textAnchor="end" fontSize="9" fill="#8190a0">{fmt(maxValue * (1 - fraction))}</text></g>)}
    {model.labels.map((label, index) => <g key={label}>{model.series.map((series, seriesIndex) => {
      const value = series.values[index]
      const h = value === null ? 0 : value / maxValue * plotH
      const x = left + index * groupW + groupGap + seriesIndex * barW
      return <g key={series.label}><rect x={x} y={top + plotH - h} width={barW - 3} height={h} rx="3" fill={series.color}><title>{label} · {series.label}: {value === null ? 'Belum ada observasi' : fmt(value)}</title></rect></g>
    })}<text x={left + index * groupW + groupW / 2} y={height - 14} textAnchor="middle" fontSize="9" fill="#8190a0">{label.length > 9 ? label.slice(0, 8) : label}</text></g>)}
  </svg>
}
function ChartLegend({ series }: { series: ChartSeries[] }) {
  return <div className="ifChartLegend">{series.map((item) => <span key={item.label}><i style={{ background: item.color }}/>{item.label}</span>)}</div>
}

export default function InfographicsDashboard({ rooms, role, mode = 'full', initialRoomId = null, unitLocked = false, onNavigate }: Props) {
  const [year, setYear] = useState(String(new Date().getFullYear()))
  const [roomValue, setRoomValue] = useState(unitLocked && initialRoomId != null ? String(initialRoomId) : '')
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [chartId, setChartId] = useState('quality-trend')
  const [chartType, setChartType] = useState<'column' | 'bar' | 'line' | 'donut'>('line')
  const canChooseRoom = GLOBAL_ROLES.includes(role || '') && !unitLocked
  const roomId = roomValue ? Number(roomValue) : null
  const selectedRoomName = roomId == null ? 'Seluruh rumah sakit' : rooms.find((room) => Number(room.id) === roomId)?.name || 'Unit terpilih'
  const qualityOnly = mode === 'quality'

  useEffect(() => { if (unitLocked) setRoomValue(initialRoomId == null ? '' : String(initialRoomId)) }, [unitLocked, initialRoomId])
  useEffect(() => {
    let cancelled = false
    setLoading(true); setError('')
    Promise.resolve(aurekaSupabase.rpc('aureka_gov_infographics_summary_secure', { p_year: Number(year), p_room: roomId }))
      .then(({ data, error: rpcError }) => {
        if (cancelled) return
        if (rpcError) {
          const missing = rpcError.code === 'PGRST202' || /Could not find the function|schema cache/i.test(rpcError.message || '')
          setSummary(null)
          setError(missing ? 'Ringkasan lintas domain belum aktif. Jalankan migrasi 20261112140000_aureka_infographics_aggregate.sql lalu 20261112044800_infographics_permission_guard.sql (urutan ini) pada database.' : rpcError.message || 'Ikhtisar belum dapat dimuat.')
        } else setSummary(data as Summary)
        setLoading(false)
      })
      .catch((cause: unknown) => { if (!cancelled) { setSummary(null); setError(cause instanceof Error ? cause.message : 'Ikhtisar belum dapat dimuat.'); setLoading(false) } })
    return () => { cancelled = true }
  }, [year, roomId])

  const validationRate = useMemo(() => n(summary?.quality.validation_rate), [summary])
  const years = Array.from({ length: 5 }, (_, index) => String(new Date().getFullYear() - index))
  const chartModels = useMemo<ChartModel[]>(() => {
    if (!summary) return []
    const months = Array.from({ length: 12 }, (_, index) => index + 1)
    const monthData = (items: MonthItem[], key: 'total' | 'validated') => months.map((month) => {
      const found = items.find((item) => n(item.month) === month)
      return found ? n(found[key]) : null
    })
    const distribution = (id: string, label: string, description: string, insight: string, items: CountItem[], kind: ChartModel['kind'] = 'distribution'): ChartModel => ({
      id, label, description, insight, kind, labels: items.map((item) => item.label),
      series: [{ label: 'Jumlah', color: '#4b8b75', values: items.map((item) => n(item.count)) }],
    })
    const result: ChartModel[] = [
      { id: 'quality-trend', label: 'Tren pengumpulan dan validasi indikator', description: 'Perbandingan catatan indikator yang masuk dan yang telah tervalidasi per bulan.', insight: 'Catatan tervalidasi merupakan bagian dari keseluruhan catatan. Bulan tanpa baris observasi ditampilkan sebagai celah, bukan dianggap bernilai nol.', kind: 'trend', labels: months.map((month) => MONTHS[month - 1]), series: [
        { label: 'Seluruh catatan', color: '#77a9c7', values: monthData(summary.quality.monthly || [], 'total') },
        { label: 'Tervalidasi', color: '#286d91', values: monthData(summary.quality.monthly || [], 'validated') },
      ] },
      distribution('quality-categories', 'Sebaran kategori indikator mutu', 'Jumlah master indikator menurut kategori yang tercatat.', 'Grafik menunjukkan komposisi master indikator, bukan tingkat pencapaian target mutu.', summary.quality.categories || []),
    ]
    if (!qualityOnly) result.push(
      { id: 'incident-trend', label: 'Tren laporan insiden keselamatan pasien', description: 'Jumlah laporan insiden per bulan berdasarkan agregasi server.', insight: 'Grafik ini menggambarkan volume pelaporan, bukan tingkat insiden per jumlah pasien atau patient-days. Kenaikan laporan tidak otomatis berarti keselamatan memburuk.', kind: 'trend', labels: months.map((month) => MONTHS[month - 1]), series: [{ label: 'Laporan insiden', color: '#c58a48', values: monthData(summary.incidents.monthly || [], 'total') }] },
      distribution('risk-levels', 'Distribusi tingkat risiko', 'Jumlah risiko pada setiap tingkat risiko sesuai klasifikasi register.', 'Gunakan distribusi ini untuk melihat konsentrasi risiko. Penilaian prioritas tetap mempertimbangkan skor, residual, kontrol, dan selera risiko.', summary.risk.levels || []),
      distribution('risk-categories', 'Distribusi kategori risiko', 'Jumlah risiko menurut kelompok kategori risiko rumah sakit.', 'Kategori dengan jumlah terbesar menunjukkan area dengan beban register tertinggi, bukan dengan sendirinya tingkat risiko tertinggi.', summary.risk.categories || []),
      { id: 'rtl-status', label: 'Status rencana tindak lanjut', description: 'Perbandingan jumlah RTL selesai, belum selesai, dan yang melewati tenggat.', insight: 'RTL melewati tenggat merupakan bagian dari RTL belum selesai; kategori tersebut ditampilkan sebagai penanda perhatian dan tidak boleh dijumlahkan kembali sebagai kelompok terpisah.', kind: 'progress', labels: ['Selesai', 'Belum selesai', 'Lewat tenggat'], series: [{ label: 'Jumlah RTL', color: '#4b8b75', values: [n(summary.program.completed_actions), n(summary.program.open_actions), n(summary.program.overdue_actions)] }] },
      { id: 'regulation-status', label: 'Status tata kelola regulasi', description: 'Ringkasan regulasi berlaku, menunggu persetujuan, dan perlu ditinjau.', insight: 'Status ini membantu memantau siklus regulasi. Regulasi yang perlu ditinjau tidak selalu berarti sudah tidak berlaku.', kind: 'progress', labels: ['Berlaku', 'Menunggu persetujuan', 'Perlu ditinjau'], series: [{ label: 'Jumlah regulasi', color: '#638ba8', values: [n(summary.regulation.published), n(summary.regulation.pending_approval), n(summary.regulation.review_due)] }] },
    )
    return result
  }, [summary, qualityOnly])
  const activeChart = chartModels.find((model) => model.id === chartId) || chartModels[0]
  useEffect(() => { if (chartModels.length && !chartModels.some((model) => model.id === chartId)) { setChartId(chartModels[0].id); setChartType(chartModels[0].kind === 'trend' ? 'line' : 'column') } }, [chartModels, chartId])

  const sourceLinks = [
    { id: 'quality', label: 'Indikator Mutu' },
    { id: 'safety', label: 'Keselamatan Pasien' },
    { id: 'risk', label: 'Manajemen Risiko' },
    { id: 'analytics', label: 'Program dan RTL' },
    { id: 'regulation', label: 'Regulasi' },
  ].filter((link) => AUREKA_PRIMARY_NAV.some((module) => module.id === link.id && module.requiredRoles.includes((role || '') as AurekaRole)))

  return <section className="infographicsDashboard" aria-label={qualityOnly ? 'Ikhtisar indikator mutu' : 'Ikhtisar kinerja rumah sakit'}>
    <style>{css}</style>
    <header className="ifHero">
      <div><span className="ifEyebrow">AUREKA · EXECUTIVE OVERVIEW</span><h2>{qualityOnly ? 'Ikhtisar Indikator Mutu' : 'Ikhtisar Mutu dan Keselamatan Rumah Sakit'}</h2>
        <p>{qualityOnly ? 'Ringkasan agregat indikator mutu untuk fungsi pengawasan. Tidak menampilkan identitas atau data pasien individual.' : 'Gambaran terpadu indikator mutu, insiden keselamatan pasien, manajemen risiko, program, RTL, dan regulasi. Pilih grafik untuk menelusuri pola data.'}</p></div>
      <div className="ifFilters">
        <label>Periode<select value={year} onChange={(event) => setYear(event.target.value)}>{years.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        {canChooseRoom && <label>Unit<select value={roomValue} onChange={(event) => setRoomValue(event.target.value)}><option value="">Seluruh rumah sakit</option>{rooms.map((room) => <option key={room.id} value={String(room.id)}>{room.name}</option>)}</select></label>}
        {!canChooseRoom && <span className="ifScope">{selectedRoomName}</span>}
      </div>
    </header>
    {error && <div className="ifError" role="alert">{error}</div>}
    {loading && <div className="ifLoading" role="status">Menghitung ikhtisar agregat sesuai periode dan ruang lingkup akses…</div>}
    {!loading && summary && <>
      <div className="ifKpiGrid">
        <Kpi label="Indikator aktif" value={summary.quality.active_indicators} note="Master indikator pada periode terpilih"/>
        <Kpi label="Catatan indikator" value={summary.quality.records} note="Jumlah catatan pada periode terpilih"/>
        <Kpi label="Catatan tervalidasi" value={summary.quality.validated} note={'Tingkat validasi ' + pct(validationRate)}/>
        {!qualityOnly && <Kpi label="Laporan insiden" value={summary.incidents.total} note={fmt(summary.incidents.open) + ' masih terbuka'}/>}
        {!qualityOnly && <Kpi label="Risiko sangat tinggi" value={summary.risk.very_high} note={fmt(summary.risk.open) + ' berstatus Open'}/>}
        {!qualityOnly && <Kpi label="RTL belum selesai" value={summary.program.open_actions} note={fmt(summary.program.overdue_actions) + ' melewati tenggat'}/>}
        {!qualityOnly && <Kpi label="Regulasi berlaku" value={summary.regulation.published} note={fmt(summary.regulation.review_due) + ' perlu ditinjau'}/>}
      </div>
      {activeChart && <section className="ifChartCard" aria-label="Eksplorasi grafik ikhtisar">
        <div className="ifSectionHead"><div><span className="ifEyebrow">DATA EXPLORER</span><h3>Eksplorasi Ikhtisar</h3><p>Pilih topik dan bentuk visualisasi untuk membaca pola data yang sama dari sudut berbeda.</p></div></div>
        <div className="ifChartToolbar">
          <label className="ifChartChoice">Pilih grafik<select value={activeChart.id} onChange={(event) => { const next = chartModels.find((model) => model.id === event.target.value); setChartId(event.target.value); setChartType(next?.kind === 'trend' ? 'line' : 'column') }}>{chartModels.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}</select></label>
          <div><span style={{display:'block',marginBottom:5,color:'var(--ak-muted,#73849a)',fontSize:10,fontWeight:750}}>Bentuk grafik</span><div className="ifTypeSwitch" role="group" aria-label="Pilih bentuk grafik">
            {([['column','Kolom'],['bar','Batang'],['line','Garis'],['donut','Donat']] as const).map(([type,label]) => <button type="button" key={type} aria-pressed={chartType===type} onClick={() => setChartType(type)}>{label}</button>)}
          </div></div>
        </div>
        <div className="ifSectionHead"><div><h3>{activeChart.label}</h3><p>{activeChart.description}</p></div></div>
        <ChartGraphic model={activeChart} type={chartType}/>
        {chartType === 'donut' && <div className="ifMiniCard" style={{marginTop:8}}><Distribution items={activeChart.labels.map((label,index)=>({label,count:activeChart.series.reduce((sum,series)=>sum+Math.max(0,series.values[index]??0),0)}))}/></div>}
        {chartType !== 'donut' && <ChartLegend series={activeChart.series}/>}
        <div className="ifInsight"><b>Catatan interpretasi:</b> {activeChart.insight}</div>
      </section>}
      <div className="ifLowerGrid">
        <section className="ifMiniCard"><h3>Distribusi indikator menurut kategori</h3><p>Jumlah master indikator per kategori; bukan nilai capaian indikator.</p><Distribution items={summary.quality.categories || []}/></section>
        {!qualityOnly && <section className="ifMiniCard"><h3>Profil tingkat risiko</h3><p>Jumlah risiko pada tiap level yang tercatat.</p><Distribution items={summary.risk.levels || []}/></section>}
        {!qualityOnly && <section className="ifMiniCard"><h3>Komposisi kategori risiko</h3><p>Kategori dengan jumlah register terbesar.</p><Distribution items={summary.risk.categories || []}/></section>}
        {!qualityOnly && <section className="ifMiniCard"><h3>Ringkasan program dan RTL</h3><p>Angka ringkasan tata kelola tahun {summary.year}.</p>
          <div className="ifKpiGrid" style={{gridTemplateColumns:'repeat(2,minmax(0,1fr))'}}>
            <Kpi label="Rekomendasi" value={summary.program.recommendations}/>
            <Kpi label="Total RTL" value={summary.program.actions}/>
            <Kpi label="RTL selesai" value={summary.program.completed_actions}/>
            <Kpi label="Regulasi menunggu persetujuan" value={summary.regulation.pending_approval}/>
          </div>
        </section>}
      </div>
    </>}
    {!qualityOnly && onNavigate && <nav className="ifLinks" aria-label="Buka ruang kerja sumber">{sourceLinks.map((link) => <button type="button" className="ifLink" key={link.id} onClick={() => onNavigate(link.id)}>{link.label} →</button>)}</nav>}
    <p className="ifNote">Sumber: agregasi server-side AUREKA. Nilai mengikuti filter periode, unit, dan hak akses. Bulan tanpa observasi ditampilkan sebagai celah, bukan nol. Grafik volume pelaporan tidak dapat ditafsirkan sebagai angka insidensi tanpa denominator paparan yang sesuai.</p>
  </section>
}
