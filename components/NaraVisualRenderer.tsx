'use client'

import { useRef } from 'react'

export type NaraVisualSpec = {
  title: string
  chartType: 'bar' | 'line'
  xKey?: string
  series: { dataKey: string; label: string }[]
  data: Record<string, string | number>[]
  source?: string
  period?: string
  unit?: string
  interpretation?: string
}

function validateSpec(value: unknown): NaraVisualSpec | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  if (typeof v.title !== 'string' || !v.title.trim() || !['bar', 'line'].includes(String(v.chartType))) return null
  if (!Array.isArray(v.series) || !v.series.length || v.series.length > 4 || !Array.isArray(v.data) || !v.data.length || v.data.length > 24) return null
  const series = v.series.filter((s): s is { dataKey: string; label: string } =>
    !!s && typeof s === 'object' && typeof (s as Record<string, unknown>).dataKey === 'string' &&
    typeof (s as Record<string, unknown>).label === 'string').map(s => ({ dataKey: s.dataKey.slice(0, 40), label: s.label.slice(0, 60) }))
  if (!series.length) return null
  const data = v.data.filter((row): row is Record<string, string | number> => !!row && typeof row === 'object' &&
    Object.values(row).every(x => typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x))))
  if (!data.length || data.some(row => series.some(s => typeof row[s.dataKey] !== 'number'))) return null
  return {
    title: v.title.slice(0, 140), chartType: v.chartType as 'bar' | 'line',
    xKey: typeof v.xKey === 'string' ? v.xKey.slice(0, 40) : 'label',
    series, data, source: typeof v.source === 'string' ? v.source.slice(0, 180) : undefined,
    period: typeof v.period === 'string' ? v.period.slice(0, 100) : undefined,
    unit: typeof v.unit === 'string' ? v.unit.slice(0, 40) : undefined,
    interpretation: typeof v.interpretation === 'string' ? v.interpretation.slice(0, 700) : undefined,
  }
}

export function parseNaraVisual(answer: string): { text: string; visual?: NaraVisualSpec } {
  const match = /\[\[NARA_VISUAL\]\]([\s\S]*?)\[\[\/NARA_VISUAL\]\]/i.exec(answer)
  if (!match) return { text: answer }
  const text = answer.replace(match[0], '').trim()
  try {
    const parsed = JSON.parse(match[1].trim().replace(/^json\s*/i, ''))
    const visual = validateSpec(parsed)
    return visual ? { text, visual } : { text: text + '\nVisualisasi tidak ditampilkan karena format atau datanya tidak valid.' }
  } catch {
    return { text, visual: undefined }
  }
}

export default function NaraVisualRenderer({ spec }: { spec: NaraVisualSpec }) {
  const svgRef = useRef<SVGSVGElement>(null)
  const values = spec.data.flatMap(row => spec.series.map(s => Number(row[s.dataKey])))
  const min = Math.min(0, ...values)
  const max = Math.max(1, ...values)
  const range = max - min || 1
  const width = 760, height = 300, left = 58, right = 22, top = 22, bottom = 54
  const plotW = width - left - right, plotH = height - top - bottom
  const x = (i: number) => left + (spec.data.length === 1 ? plotW / 2 : i * plotW / (spec.data.length - 1))
  const y = (v: number) => top + (max - v) / range * plotH
  const palette = ['#176b87', '#2f8f70', '#d18a31', '#8064a2']
  const download = () => {
    const svg = svgRef.current
    if (!svg) return
    const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: 'image/svg+xml;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = (spec.title || 'visualisasi-nara').replace(/[^a-z0-9-_]+/gi, '-').slice(0, 70) + '.svg'
    document.body.appendChild(a); a.click(); a.remove(); URL.revokeObjectURL(url)
  }
  return <section className="naraVisual" aria-label={'Visualisasi: ' + spec.title}>
    <header><div><strong>{spec.title}</strong><small>{[spec.period, spec.unit].filter(Boolean).join(' · ')}</small></div><button type="button" onClick={download}>Unduh SVG</button></header>
    <div className="naraVisualCanvas">
      <svg ref={svgRef} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={spec.title} xmlns="http://www.w3.org/2000/svg">
        <rect width={width} height={height} fill="#ffffff"/>
        {[0, .25, .5, .75, 1].map((p, i) => {
          const val = max - range * p
          const yy = top + plotH * p
          return <g key={i}><line x1={left} x2={width-right} y1={yy} y2={yy} stroke="#e5eaf0" strokeWidth="1"/><text x={left-10} y={yy+4} textAnchor="end" fontSize="11" fill="#607080">{Number(val.toFixed(1)).toLocaleString('id-ID')}</text></g>
        })}
        {spec.chartType === 'bar' ? spec.data.map((row, i) => {
          const groupWidth = plotW / spec.data.length
          const barWidth = Math.min(34, groupWidth * .7 / spec.series.length)
          return <g key={i}>{spec.series.map((s, si) => {
            const value = Number(row[s.dataKey]), yy = y(value)
            const xx = left + i * groupWidth + groupWidth/2 - (spec.series.length*barWidth)/2 + si*barWidth
            return <rect key={s.dataKey} x={xx} y={yy} width={barWidth-3} height={Math.max(1, top+plotH-yy)} rx="3" fill={palette[si%palette.length]}><title>{s.label}: {value}</title></rect>
          })}</g>
        }) : spec.series.map((s, si) => {
          const points = spec.data.map((row, i) => `${x(i)},${y(Number(row[s.dataKey]))}`).join(' ')
          return <g key={s.dataKey}><polyline points={points} fill="none" stroke={palette[si%palette.length]} strokeWidth="3" strokeLinejoin="round" strokeLinecap="round"/>{spec.data.map((row,i)=><circle key={i} cx={x(i)} cy={y(Number(row[s.dataKey]))} r="4" fill={palette[si%palette.length]}><title>{s.label}: {Number(row[s.dataKey])}</title></circle>)}</g>
        })}
        {spec.data.map((row,i) => <text key={i} x={spec.chartType==='bar' ? left+(i+.5)*plotW/spec.data.length : x(i)} y={height-22} textAnchor="middle" fontSize="11" fill="#536477">{String(row[spec.xKey || 'label'] ?? '').slice(0,18)}</text>)}
      </svg>
    </div>
    <div className="naraVisualLegend">{spec.series.map((s,i)=><span key={s.dataKey}><i style={{background:palette[i%palette.length]}}/>{s.label}</span>)}</div>
    {spec.interpretation && <p className="naraVisualInterpretation">{spec.interpretation}</p>}
    <small className="naraVisualSource">Sumber: {spec.source || 'DATA AUREKA yang tersedia pada sesi ini'} · Nilai ditampilkan sesuai data yang diberikan.</small>
    <div className="naraVisualTable"><table><thead><tr><th>{spec.xKey || 'Periode'}</th>{spec.series.map(s=><th key={s.dataKey}>{s.label}</th>)}</tr></thead><tbody>{spec.data.map((row,i)=><tr key={i}><td>{String(row[spec.xKey || 'label'] ?? '')}</td>{spec.series.map(s=><td key={s.dataKey}>{Number(row[s.dataKey]).toLocaleString('id-ID')}</td>)}</tr>)}</tbody></table></div>
    <style jsx>{`
      .naraVisual{margin:12px 0;padding:14px;border:1px solid #dce5ed;border-radius:16px;background:#fff;color:#203448;min-width:0}
      header{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}header div{display:grid;gap:4px}header strong{font-size:14px}header small,.naraVisualSource{font-size:11px;color:#66788a}
      header button{border:1px solid #d7e1e9;background:#f7fafc;color:#25465c;border-radius:9px;padding:7px 10px;font-size:11px;font-weight:700;white-space:nowrap}
      .naraVisualCanvas{overflow-x:auto;margin-top:10px}.naraVisualCanvas svg{display:block;width:100%;min-width:440px;height:auto}
      .naraVisualLegend{display:flex;flex-wrap:wrap;gap:12px;margin-top:8px}.naraVisualLegend span{display:flex;align-items:center;gap:6px;font-size:11px;color:#526477}.naraVisualLegend i{width:9px;height:9px;border-radius:2px}
      .naraVisualInterpretation{font-size:12px;line-height:1.55;color:#334b60;margin:10px 0 4px}.naraVisualSource{display:block;margin-top:8px}
      .naraVisualTable{overflow:auto;margin-top:10px}.naraVisualTable table{border-collapse:collapse;width:100%;font-size:11px}.naraVisualTable th,.naraVisualTable td{padding:6px 8px;text-align:right;border-bottom:1px solid #edf1f5;white-space:nowrap}.naraVisualTable th:first-child,.naraVisualTable td:first-child{text-align:left}
      :global(html[data-mode="gelap"]) .naraVisual{background:#141b26;border-color:rgba(255,255,255,.12);color:#eaf0f6}
      :global(html[data-mode="gelap"]) .naraVisualInterpretation{color:#c5d0dc}
    `}</style>
  </section>
}
