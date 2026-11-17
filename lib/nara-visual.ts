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
  const xKey = typeof v.xKey === 'string' ? v.xKey.slice(0, 40) : 'label'
  const data = v.data.filter((row): row is Record<string, string | number> => !!row && typeof row === 'object' &&
    Object.values(row).every(x => typeof x === 'string' || (typeof x === 'number' && Number.isFinite(x))) &&
    typeof (row as Record<string, unknown>)[xKey] === 'string' &&
    series.every(s => typeof (row as Record<string, unknown>)[s.dataKey] === 'number'))
  if (!data.length) return null
  return {
    title: v.title.slice(0, 140), chartType: v.chartType as 'bar' | 'line', xKey,
    series, data, source: typeof v.source === 'string' ? v.source.slice(0, 180) : undefined,
    period: typeof v.period === 'string' ? v.period.slice(0, 100) : undefined,
    unit: typeof v.unit === 'string' ? v.unit.slice(0, 40) : undefined,
    interpretation: typeof v.interpretation === 'string' ? v.interpretation.slice(0, 700) : undefined,
  }
}

export function parseNaraVisual(answer: string): { text: string; visual?: NaraVisualSpec } {
  const match = /\[\[NARA_VISUAL\]\]([\s\S]*?)\[\[\\/NARA_VISUAL\]\]/i.exec(answer)
  if (!match) return { text: answer }
  const text = answer.replace(match[0], '').trim()
  try {
    const parsed = JSON.parse(match[1].trim().replace(/^json\s*/i, ''))
    const visual = validateSpec(parsed)
    return visual ? { text, visual } : { text: text + '\nVisualisasi tidak ditampilkan karena format atau datanya tidak valid.' }
  } catch { return { text } }
}
