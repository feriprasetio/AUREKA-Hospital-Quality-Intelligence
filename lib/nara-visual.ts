export type NaraVisualSpec = {
  title: string
  chartType: 'bar' | 'line' | 'pie' | 'heatmap' | 'risk_matrix'
  xKey?: string
  yKey?: string
  valueKey?: string
  series: { dataKey: string; label: string }[]
  data: Record<string, string | number>[]
  source?: string
  period?: string
  unit?: string
  interpretation?: string
}

const safeKey = (v: unknown) => typeof v === 'string' && /^[a-zA-Z][a-zA-Z0-9_ -]{0,39}$/.test(v)
function validateSpec(value: unknown): NaraVisualSpec | null {
  if (!value || typeof value !== 'object') return null
  const v = value as Record<string, unknown>
  const types = ['bar', 'line', 'pie', 'heatmap', 'risk_matrix']
  if (typeof v.title !== 'string' || !v.title.trim() || !types.includes(String(v.chartType))) return null
  if (!Array.isArray(v.data) || !v.data.length || v.data.length > (v.chartType === 'risk_matrix' ? 25 : 24)) return null
  const chartType = v.chartType as NaraVisualSpec['chartType']
  const series = Array.isArray(v.series) ? v.series.filter((s): s is {dataKey:string;label:string} =>
    !!s && typeof s === 'object' && safeKey((s as Record<string,unknown>).dataKey) &&
    typeof (s as Record<string,unknown>).label === 'string').slice(0,4).map(s => ({dataKey:s.dataKey,label:s.label.slice(0,60)})) : []
  const xKey = safeKey(v.xKey) ? String(v.xKey) : 'label'
  const yKey = safeKey(v.yKey) ? String(v.yKey) : 'y'
  const valueKey = safeKey(v.valueKey) ? String(v.valueKey) : 'value'
  const data = v.data.filter((row): row is Record<string,string|number> => {
    if (!row || typeof row !== 'object') return false
    const r = row as Record<string,unknown>
    if (!Object.values(r).every(x => typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x)))) return false
    if (chartType === 'heatmap') return typeof r[xKey] === 'string' && typeof r[yKey] === 'string' && typeof r[valueKey] === 'number'
    if (chartType === 'risk_matrix') return typeof r.likelihood === 'number' && typeof r.impact === 'number' && (typeof r.count === 'number' && r.count >= 0 || typeof r.count === 'string' && r.count.startsWith('disembunyikan')) && r.likelihood >= 1 && r.likelihood <= 5 && r.impact >= 1 && r.impact <= 5
    if (chartType === 'pie') return typeof r[xKey] === 'string' && (typeof r[valueKey] === 'number' || (series[0] && typeof r[series[0].dataKey] === 'number'))
    return typeof r[xKey] === 'string' && series.length > 0 && series.every(s => typeof r[s.dataKey] === 'number')
  })
  if (!data.length) return null
  if (['bar','line'].includes(chartType) && !series.length) return null
  if (chartType === 'pie' && data.some(r => Number(r[valueKey] ?? r[series[0]?.dataKey ?? '']) < 0)) return null
  return { title:v.title.slice(0,140), chartType, xKey, yKey, valueKey, series, data,
    source:typeof v.source==='string'?v.source.slice(0,180):undefined,
    period:typeof v.period==='string'?v.period.slice(0,100):undefined,
    unit:typeof v.unit==='string'?v.unit.slice(0,40):undefined,
    interpretation:typeof v.interpretation==='string'?v.interpretation.slice(0,700):undefined }
}
export function parseNaraVisual(answer: string): { text: string; visual?: NaraVisualSpec } {
  const match = /\[\[NARA_VISUAL\]\]([\s\S]*?)\[\[\/NARA_VISUAL\]\]/i.exec(answer)
  if (!match) return { text: answer }
  const text = answer.replace(match[0], '').trim()
  try {
    const parsed = JSON.parse(match[1].trim().replace(/^json\s*/i, ''))
    const visual = validateSpec(parsed)
    return visual ? { text, visual } : { text: text + '\nVisualisasi tidak ditampilkan karena format atau datanya tidak valid.' }
  } catch { return { text } }
}
