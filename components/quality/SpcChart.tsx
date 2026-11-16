'use client'

import { useMemo, useState } from 'react'
import { computeSpc, type SpcInputPoint } from '@/lib/aureka/spc'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const fmt = (v: number | null | undefined, unit: string) => v == null ? '-' : v.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + unit
const SIGNAL_TEXT: Record<string, string> = { 'luar-batas': 'di luar batas kendali', pergeseran: 'bagian dari pergeseran', tren: 'bagian dari tren' }

/**
 * Grafik kendali 12 bulan. Garis tengah (CL), batas atas/bawah (UCL/LCL), garis target bila ada.
 * Titik bersinyal diberi lingkaran merah. Hover/fokus titik untuk detailnya.
 */
export default function SpcChart({ points, unit = '%', target, percent = true }: { points: SpcInputPoint[]; unit?: string; target?: number | null; percent?: boolean }) {
  const spc = useMemo(() => computeSpc(points, { percent }), [points, percent])
  const [hover, setHover] = useState<number | null>(null)
  const W = 640, H = 260, L = 44, R = 14, T = 14, B = 30
  const values = spc.points.flatMap((p) => [p.value, p.ucl, p.lcl]).concat(spc.center ?? [], target ?? []).filter((v): v is number => v != null)
  let lo = Math.min(...values), hi = Math.max(...values)
  if (!values.length) { lo = 0; hi = 100 }
  const pad = Math.max(1, (hi - lo) * 0.12)
  lo = percent ? Math.max(0, lo - pad) : lo - pad
  hi = percent ? Math.min(100, hi + pad) : hi + pad
  if (hi - lo < 1) { hi += 1; lo -= 1 }
  const x = (m: number) => L + ((m - 1) / 11) * (W - L - R)
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const ticks = Array.from({ length: 5 }, (_, i) => lo + ((hi - lo) * i) / 4)
  const stepPath = (key: 'ucl' | 'lcl') => {
    const pts = spc.points.filter((p) => p[key] != null)
    if (!pts.length) return ''
    const half = (W - L - R) / 22
    return pts.map((p, i) => `${i ? 'L' : 'M'}${(x(p.month) - half).toFixed(1)},${y(p[key] as number).toFixed(1)} L${(x(p.month) + half).toFixed(1)},${y(p[key] as number).toFixed(1)}`).join(' ')
  }
  const line = spc.points.map((p, i) => `${i ? 'L' : 'M'}${x(p.month).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ')
  const hp = hover == null ? null : spc.points.find((p) => p.month === hover) || null
  const methodLabel = spc.method === 'p' ? 'p-chart (proporsi)' : spc.method === 'xmr' ? 'XmR / I-chart' : 'Run chart (median)'

  return <div className="spcWrap">
    <p className={'spcVerdict' + (spc.points.some((p) => p.signals.length) ? ' warn' : '')}>{spc.verdict}</p>
    <div className="spcFrame">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={'Grafik kendali: ' + spc.verdict}>
        {ticks.map((t) => <g key={t}><line className="spcGrid" x1={L} x2={W - R} y1={y(t)} y2={y(t)} /><text className="spcTick" x={L - 6} y={y(t) + 4} textAnchor="end">{t.toLocaleString('id-ID', { maximumFractionDigits: 1 })}</text></g>)}
        {MONTHS.map((m, i) => <text key={m} className="spcTick" x={x(i + 1)} y={H - 10} textAnchor="middle">{m}</text>)}
        {spc.method !== 'run' && <><path className="spcLimit" d={stepPath('ucl')} /><path className="spcLimit" d={stepPath('lcl')} /></>}
        {target != null && <line className="spcTarget" x1={L} x2={W - R} y1={y(target)} y2={y(target)} />}
        {spc.center != null && <line className="spcCenter" x1={L} x2={W - R} y1={y(spc.center)} y2={y(spc.center)} />}
        <path className="spcLine" d={line} />
        {spc.points.map((p) => <g key={p.month} tabIndex={0} onMouseEnter={() => setHover(p.month)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(p.month)} onBlur={() => setHover(null)}>
          <circle cx={x(p.month)} cy={y(p.value)} r={14} fill="transparent" />
          {p.signals.length > 0 && <circle className="spcSignalRing" cx={x(p.month)} cy={y(p.value)} r={8} />}
          <circle className={'spcDot' + (p.signals.length ? ' sig' : '')} cx={x(p.month)} cy={y(p.value)} r={4.5} />
        </g>)}
      </svg>
      {hp && <div className="spcTip" style={{ left: `${(x(hp.month) / W) * 100}%`, top: `${(y(hp.value) / H) * 100}%` }}>
        <b>{MONTHS[hp.month - 1]}: {fmt(hp.value, unit)}</b>
        {hp.ucl != null && <span>Batas {fmt(hp.lcl, unit)} – {fmt(hp.ucl, unit)}</span>}
        {hp.signals.map((s) => <em key={s}>{SIGNAL_TEXT[s]}</em>)}
      </div>}
    </div>
    <div className="spcLegend">
      <span><i className="lgLine" />Capaian</span>
      <span><i className="lgCenter" />Garis tengah {fmt(spc.center, unit)}</span>
      {spc.method !== 'run' && <span><i className="lgLimit" />Batas kendali (±3σ)</span>}
      {target != null && <span><i className="lgTarget" />Target {fmt(target, unit)}</span>}
      <span><i className="lgSig" />Sinyal</span>
      <span className="spcMethod">{methodLabel}</span>
    </div>
    <details className="spcHelp"><summary>Cara membaca</summary>
      <p>Titik yang naik-turun di dalam batas kendali adalah variasi biasa, jadi tidak perlu bereaksi tiap bulan. Perlu ditelusuri bila ada titik di luar batas, 8 bulan berturut-turut di satu sisi garis tengah, atau 6 bulan terus naik/turun. Proses bisa stabil tetapi tetap di bawah target; itu tanda sistemnya yang perlu diubah, bukan kejadian sesaat.</p>
    </details>
  </div>
}
