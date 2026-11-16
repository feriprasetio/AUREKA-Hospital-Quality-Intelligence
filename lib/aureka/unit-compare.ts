// Perbandingan indikator yang sama antar unit, dan baris ekspor Indikator Nasional Mutu (INM).
import type { IndicatorResult } from '@/lib/aureka/quality-results-engine'

const BULAN = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember']

/** Kunci judul: huruf kecil, tanpa tanda baca/spasi ganda, agar "Kepatuhan Kebersihan Tangan" di dua unit dianggap sama. */
export const titleKey = (title: unknown) => String(title ?? '').toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim()

export type CompareEntry = { roomId: number; room: string; value: number; display: string; met: boolean | null; n: number }
export type CompareGroup = { key: string; title: string; target: string; higherBetter: boolean; entries: CompareEntry[] }

const valueOf = (r: IndicatorResult) => r.continuous ? r.annualMean : r.annualRate
const higherIsBetter = (r: IndicatorResult) => {
  const op = String(r.profile.target_operator ?? '').trim()
  if (op === '<=' || op === '<') return false
  if (op === '>=' || op === '>') return true
  const dir = String(r.profile.schema_json?.indicator_direction ?? '').toLowerCase()
  if (dir === 'negative') return false
  return !(r.kind === 'door' || r.kind === 'minutes')
}

export function groupComparable(results: IndicatorResult[], roomName: (id: number) => string): CompareGroup[] {
  const map = new Map<string, IndicatorResult[]>()
  for (const r of results) {
    const key = titleKey(r.profile.title)
    if (!key || valueOf(r) == null || r.validatedRecords === 0) continue
    map.set(key, [...(map.get(key) || []), r])
  }
  const groups: CompareGroup[] = []
  for (const [key, list] of map) {
    const rooms = new Set(list.map((r) => Number(r.profile.room_id)))
    if (rooms.size < 2) continue
    const higherBetter = higherIsBetter(list[0])
    const entries = list.map((r) => {
      const value = valueOf(r) as number
      const unit = r.continuous ? (r.unit ? ' ' + r.unit : '') : '%'
      return { roomId: Number(r.profile.room_id), room: roomName(Number(r.profile.room_id)), value, display: value.toLocaleString('id-ID', { maximumFractionDigits: 2 }) + unit, met: r.targetMet, n: r.validatedRecords }
    }).sort((a, b) => higherBetter ? b.value - a.value : a.value - b.value)
    groups.push({ key, title: String(list[0].profile.title ?? ''), target: String(list[0].profile.target_text ?? ''), higherBetter, entries })
  }
  // Grup dengan unit tidak memenuhi target ditampilkan lebih dulu.
  return groups.sort((a, b) => b.entries.filter((e) => e.met === false).length - a.entries.filter((e) => e.met === false).length || a.title.localeCompare(b.title, 'id'))
}

export const isInm = (r: IndicatorResult) => /\bINM\b|indikator nasional mutu/i.test(String(r.profile.indicator_type ?? ''))

export const INM_COLUMNS = ['Tahun', 'Bulan', 'Kode', 'Indikator', 'Unit', 'Numerator', 'Denumerator', 'Capaian', 'Satuan', 'Target']

/** Satu baris per indikator INM per bulan yang punya data tervalidasi. */
export function buildInmRows(results: IndicatorResult[], year: number, roomName: (id: number) => string) {
  const rows: Record<string, unknown>[] = []
  for (const r of results.filter(isInm)) {
    for (const m of r.monthly) {
      if (!m.validatedRecords) continue
      const value = r.continuous ? m.mean : m.rate
      rows.push({
        Tahun: year,
        Bulan: BULAN[m.month - 1],
        Kode: r.profile.code ?? '',
        Indikator: r.profile.title ?? '',
        Unit: roomName(Number(r.profile.room_id)),
        Numerator: r.continuous ? '' : m.numerator,
        Denumerator: r.continuous ? '' : m.denominator,
        Capaian: value == null ? '' : Math.round(value * 100) / 100,
        Satuan: r.continuous ? (r.unit || '') : '%',
        Target: r.profile.target_text ?? '',
      })
    }
  }
  return rows.sort((a, b) => String(a.Kode).localeCompare(String(b.Kode), 'id', { numeric: true }) || BULAN.indexOf(String(a.Bulan)) - BULAN.indexOf(String(b.Bulan)))
}
