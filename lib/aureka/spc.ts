// Grafik kendali (Statistical Process Control) untuk capaian indikator bulanan.
// - p-chart: indikator proporsi (numerator ≤ denominator), batas per bulan mengikuti jumlah sampel (n).
// - XmR (I-chart): nilai kontinu atau rasio yang bukan proporsi; batas = rerata ± 2,66 × rerata moving range.
// Aturan sinyal (sebab khusus): titik di luar batas, ≥8 titik berurutan di satu sisi garis tengah (pergeseran),
// ≥6 titik berurutan terus naik/turun (tren).

export type SpcInputPoint = { month: number; value: number | null; numerator?: number; denominator?: number }
export type SpcPoint = {
  month: number
  value: number
  ucl: number | null
  lcl: number | null
  signals: Array<'luar-batas' | 'pergeseran' | 'tren'>
}
export type SpcResult = {
  method: 'p' | 'xmr' | 'run'
  center: number | null
  points: SpcPoint[]
  /** Kalimat ringkas untuk orang awam. */
  verdict: string
}

const MIN_POINTS_FOR_LIMITS = 5
const SHIFT_RUN = 8
const TREND_RUN = 6
const round = (v: number) => Math.round(v * 100) / 100

export function computeSpc(input: SpcInputPoint[], opts: { percent?: boolean } = {}): SpcResult {
  const pts = input.filter((p): p is SpcInputPoint & { value: number } => p.value != null && Number.isFinite(p.value))
  if (!pts.length) return { method: 'run', center: null, points: [], verdict: 'Belum ada data bulanan untuk digambar.' }

  const proportion = pts.every((p) => (p.denominator ?? 0) > 0 && (p.numerator ?? 0) >= 0 && (p.numerator ?? 0) <= (p.denominator ?? 0))
  const enough = pts.length >= MIN_POINTS_FOR_LIMITS
  const method: SpcResult['method'] = enough ? (proportion ? 'p' : 'xmr') : 'run'
  let center: number
  const limits: Array<[number | null, number | null]> = []

  if (method === 'p') {
    const num = pts.reduce((s, p) => s + (p.numerator ?? 0), 0)
    const den = pts.reduce((s, p) => s + (p.denominator ?? 0), 0)
    const pbar = num / den
    center = pbar * 100
    for (const p of pts) {
      const sigma = Math.sqrt((pbar * (1 - pbar)) / (p.denominator as number))
      limits.push([Math.min(100, (pbar + 3 * sigma) * 100), Math.max(0, (pbar - 3 * sigma) * 100)])
    }
  } else {
    const values = pts.map((p) => p.value)
    center = method === 'run'
      ? [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) / 2)] // median untuk run chart
      : values.reduce((s, v) => s + v, 0) / values.length
    if (method === 'xmr') {
      const mrs = values.slice(1).map((v, i) => Math.abs(v - values[i]))
      const mrbar = mrs.reduce((s, v) => s + v, 0) / Math.max(1, mrs.length)
      let ucl = center + 2.66 * mrbar
      let lcl = center - 2.66 * mrbar
      if (opts.percent) ucl = Math.min(100, ucl)
      if (values.every((v) => v >= 0)) lcl = Math.max(0, lcl)
      for (let i = 0; i < pts.length; i++) limits.push([ucl, lcl])
    } else {
      for (let i = 0; i < pts.length; i++) limits.push([null, null])
    }
  }

  const points: SpcPoint[] = pts.map((p, i) => ({
    month: p.month,
    value: round(p.value),
    ucl: limits[i][0] == null ? null : round(limits[i][0] as number),
    lcl: limits[i][1] == null ? null : round(limits[i][1] as number),
    signals: [],
  }))

  for (const pt of points) {
    if ((pt.ucl != null && pt.value > pt.ucl) || (pt.lcl != null && pt.value < pt.lcl)) pt.signals.push('luar-batas')
  }
  // Pergeseran: titik tepat di garis tengah tidak memutus maupun menambah deret.
  let runSide = 0, runStart = 0, runLen = 0
  points.forEach((pt, i) => {
    const side = pt.value > center ? 1 : pt.value < center ? -1 : 0
    if (side === 0) return
    if (side === runSide) runLen++
    else { runSide = side; runStart = i; runLen = 1 }
    if (runLen >= SHIFT_RUN) for (let k = runStart; k <= i; k++) if (!points[k].signals.includes('pergeseran')) points[k].signals.push('pergeseran')
  })
  // Tren: deret naik/turun berturut-turut (nilai sama memutus deret).
  let dir = 0, trendStart = 0
  for (let i = 1; i < points.length; i++) {
    const d = points[i].value > points[i - 1].value ? 1 : points[i].value < points[i - 1].value ? -1 : 0
    if (d === 0) { dir = 0; trendStart = i; continue }
    if (d !== dir) { dir = d; trendStart = i - 1 }
    if (i - trendStart + 1 >= TREND_RUN) for (let k = trendStart; k <= i; k++) if (!points[k].signals.includes('tren')) points[k].signals.push('tren')
  }

  const flagged = points.filter((p) => p.signals.length)
  let verdict: string
  if (method === 'run') verdict = `Baru ${pts.length} bulan berdata; batas kendali dihitung setelah minimal ${MIN_POINTS_FOR_LIMITS} bulan. Garis tengah = median.`
  else if (!flagged.length) verdict = 'Proses stabil: naik-turunnya masih wajar (variasi umum), tidak ada sinyal sebab khusus.'
  else {
    const kinds = new Set(flagged.flatMap((p) => p.signals))
    const parts = [
      kinds.has('luar-batas') ? 'ada bulan di luar batas kendali' : '',
      kinds.has('pergeseran') ? `${SHIFT_RUN}+ bulan berturut-turut di satu sisi garis tengah (pergeseran)` : '',
      kinds.has('tren') ? `${TREND_RUN}+ bulan terus naik/turun (tren)` : '',
    ].filter(Boolean)
    verdict = 'Perlu ditelusuri: ' + parts.join('; ') + '. Cari penyebab khususnya.'
  }
  return { method, center: round(center), points, verdict }
}
