// Grading risiko insiden keselamatan pasien (matriks dampak × probabilitas, Pedoman Pelaporan IKP KKPRS).
// Hasilnya hanya saran untuk pelapor dan tim; keputusan akhir tetap di Komite/Tim KP saat investigasi.

export const IMPACT_OPTIONS = [
  'Tidak signifikan (tidak ada cedera)',
  'Minor (cedera ringan, cukup P3K)',
  'Moderat (cedera sedang, perawatan bertambah lama, fungsi pulih)',
  'Mayor (cedera berat, kehilangan fungsi permanen)',
  'Katastropik (kematian)',
] as const

export type GradeColor = 'biru' | 'hijau' | 'kuning' | 'merah'
export type Grade = {
  color: GradeColor
  /** Label warna seperti di pedoman. */
  label: 'Biru' | 'Hijau' | 'Kuning' | 'Merah'
  /** Padanan pilihan "Grading Risk" di form investigasi. */
  level: 'Rendah' | 'Sedang' | 'Tinggi' | 'Ekstrem'
  action: string
  deadline: string
}

const GRADES: Record<GradeColor, Grade> = {
  biru: { color: 'biru', label: 'Biru', level: 'Rendah', action: 'Investigasi sederhana oleh atasan langsung', deadline: 'paling lambat 1 minggu' },
  hijau: { color: 'hijau', label: 'Hijau', level: 'Sedang', action: 'Investigasi sederhana oleh atasan langsung', deadline: 'paling lambat 2 minggu' },
  kuning: { color: 'kuning', label: 'Kuning', level: 'Tinggi', action: 'Investigasi komprehensif / analisis akar masalah (RCA) oleh Tim KP', deadline: 'paling lambat 45 hari' },
  merah: { color: 'merah', label: 'Merah', level: 'Ekstrem', action: 'Investigasi komprehensif / analisis akar masalah (RCA) oleh Tim KP', deadline: 'paling lambat 45 hari' },
}

// Baris = probabilitas 1 (sangat jarang) … 5 (sangat sering); kolom = dampak 1 (tidak signifikan) … 5 (katastropik).
const MATRIX: GradeColor[][] = [
  ['biru', 'biru', 'hijau', 'kuning', 'merah'],
  ['biru', 'biru', 'hijau', 'kuning', 'merah'],
  ['biru', 'hijau', 'kuning', 'merah', 'merah'],
  ['hijau', 'hijau', 'kuning', 'merah', 'merah'],
  ['hijau', 'hijau', 'kuning', 'merah', 'merah'],
]

const LIKELIHOOD_KEYS = ['sangat jarang', 'jarang', 'mungkin', 'sering', 'sangat sering']
const IMPACT_KEYS = ['tidak signifikan', 'minor', 'moderat', 'mayor', 'katastropik']

const scoreOf = (text: string, keys: string[]) => {
  const t = String(text || '').trim().toLowerCase()
  if (!t) return 0
  // Cocokkan kunci terpanjang dulu agar "sangat jarang" tidak terbaca "jarang".
  const order = keys.map((k, i) => [k, i + 1] as const).sort((a, b) => b[0].length - a[0].length)
  for (const [k, score] of order) if (t.startsWith(k)) return score
  return 0
}

export const likelihoodScore = (text: string) => scoreOf(text, LIKELIHOOD_KEYS)
export const impactScore = (text: string) => scoreOf(text, IMPACT_KEYS)

/**
 * Hitung grading dari isian laporan: D4 (probabilitas), D7 (dampak), A7 (jenis insiden).
 * Kejadian sentinel selalu Merah. Kembalikan null bila data belum cukup.
 */
export function gradeIncident(data: Record<string, string | undefined>): (Grade & { likelihood: number; impact: number; sentinel: boolean }) | null {
  const sentinel = /sentinel/i.test(String(data.A7 || ''))
  const likelihood = likelihoodScore(String(data.D4 || ''))
  const impact = impactScore(String(data.D7 || ''))
  if (sentinel) return { ...GRADES.merah, likelihood, impact, sentinel }
  if (!likelihood || !impact) return null
  return { ...GRADES[MATRIX[likelihood - 1][impact - 1]], likelihood, impact, sentinel }
}
