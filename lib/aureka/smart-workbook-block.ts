// Pencarian blok tabel & pencocokan kolom Excel secara "cerdas" untuk impor logbook.
// Murni fungsi (tanpa ExcelJS) agar mudah diuji. Hasilnya selalu berupa USULAN:
// pengguna tetap melihat dan bisa mengganti setiap kolom sebelum pratinjau/impor.

/** Singkatan yang lazim di workbook RS → bentuk panjangnya. */
const ABBREVIATIONS: Record<string, string> = {
  tgl: 'tanggal', tg: 'tanggal', tanggal: 'tanggal', date: 'tanggal',
  rm: 'rekam medis', mr: 'rekam medis', norm: 'nomor rekam medis', nrm: 'nomor rekam medis',
  no: 'nomor', nomer: 'nomor', nmr: 'nomor',
  nm: 'nama', ps: 'pasien', pt: 'pasien', pasien: 'pasien',
  dx: 'diagnosis', diagnosa: 'diagnosis', diag: 'diagnosis',
  dr: 'dokter', dpjp: 'dokter penanggung jawab',
  jml: 'jumlah', jlh: 'jumlah', ket: 'keterangan', kunj: 'kunjungan',
  pkl: 'jam', wkt: 'waktu', msk: 'masuk', klr: 'keluar', plg: 'pulang',
  rg: 'ruang', ruangan: 'ruang', inst: 'instalasi', unit: 'unit',
  num: 'numerator', pembilang: 'numerator', den: 'denominator', penyebut: 'denominator',
  thn: 'tahun', bln: 'bulan', usia: 'umur', jk: 'jenis kelamin', lp: 'jenis kelamin',
}
const STOPWORDS = new Set(['dan', 'atau', 'yang', 'di', 'ke', 'dari', 'untuk', 'pada', 'dengan', 'the', 'of', 'per', '%'])

export function headerTokens(value: unknown): string[] {
  const text = String(value ?? '')
    .normalize('NFKC')
    .toLocaleLowerCase('id-ID')
    .replace(/^[a-z]{1,3}: /, '') // awalan huruf kolom "B: "
    .replace(/no\.?\s*rm\b/g, 'nomor rekam medis')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
  if (!text) return []
  return text.split(' ')
    .flatMap((t) => (ABBREVIATIONS[t] ?? t).split(' '))
    .filter((t) => t && !STOPWORDS.has(t))
}

/** Kemiripan 0..1 antara dua judul kolom (Dice pada token + bonus bila satu memuat yang lain). */
export function headerSimilarity(a: unknown, b: unknown): number {
  const ta = headerTokens(a), tb = headerTokens(b)
  if (!ta.length || !tb.length) return 0
  const sa = new Set(ta), sb = new Set(tb)
  if (sa.size === sb.size && [...sa].every((t) => sb.has(t))) return 1
  let common = 0
  for (const t of sa) if (sb.has(t) || [...sb].some((u) => t.length >= 4 && u.length >= 4 && (t.startsWith(u) || u.startsWith(t)))) common++
  const dice = (2 * common) / (sa.size + sb.size)
  const contained = [...sb].every((t) => sa.has(t)) || [...sa].every((t) => sb.has(t))
  return Math.min(1, dice + (contained && common > 0 ? 0.15 : 0))
}

export type FuzzyMatch = { header: string; score: number }

/**
 * Cari satu judul kolom yang paling mirip dengan salah satu alias.
 * Hanya mengembalikan hasil bila cukup yakin (skor ≥ min) dan jelas lebih unggul dari
 * kandidat kedua, supaya tidak menebak di antara dua kolom yang sama-sama mirip.
 */
export function fuzzyFindHeader(
  headers: readonly string[],
  aliases: ReadonlyArray<string | null | undefined>,
  opts: { min?: number; margin?: number; exclude?: ReadonlySet<string> } = {},
): FuzzyMatch | null {
  const min = opts.min ?? 0.72
  const margin = opts.margin ?? 0.08
  // Kode murni angka (mis. "1.1") atau judul kolom tanpa huruf (kolom tanggal 1..31) tidak ditebak secara mirip.
  const wanted = aliases.filter((a): a is string => !!a && /\p{L}{2,}/u.test(String(a)))
  if (!wanted.length) return null
  const scored = headers
    .filter((h) => !opts.exclude?.has(h) && /\p{L}/u.test(h))
    .map((header) => ({ header, score: Math.max(...wanted.map((alias) => headerSimilarity(header, alias))) }))
    .sort((x, y) => y.score - x.score)
  const [best, second] = scored
  if (!best || best.score < min) return null
  if (second && best.score - second.score < margin) return null
  return best
}

export type BlockRow = { rowNumber: number; cells: ReadonlyArray<{ index: number; text: string }> }
export type BlockSheet = { name: string; rows: readonly BlockRow[] }
export type BlockChoice = { sheet: string; headerRow: number; score: number; matched: number; dataRows: number }

const looksLikeData = (text: string) =>
  /^-?\d+([.,]\d+)?%?$/.test(text) || /^\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}$/.test(text) || /^\d{4}-\d{2}-\d{2}/.test(text) || /^\d{1,2}:\d{2}/.test(text)

/**
 * Nilai satu baris sebagai calon judul tabel:
 * banyak judul yang cocok dengan isian form/indikator unit, sebagian besar berupa teks
 * (bukan angka/tanggal), dan di bawahnya benar-benar ada baris data.
 */
export function scoreHeaderRow(row: BlockRow, below: readonly BlockRow[], targets: ReadonlyArray<ReadonlyArray<string>>): { score: number; matched: number; dataRows: number } {
  const texts = row.cells.map((c) => c.text.trim()).filter(Boolean)
  if (texts.length < 2) return { score: -1, matched: 0, dataRows: 0 }
  const textual = texts.filter((t) => /\p{L}/u.test(t) && !looksLikeData(t)).length
  if (textual / texts.length < 0.6) return { score: -1, matched: 0, dataRows: 0 }
  const used = new Set<string>()
  let matched = 0
  for (const aliases of targets) {
    const hit = fuzzyFindHeader(texts, aliases, { min: 0.72, margin: 0, exclude: used })
    if (hit) { matched++; used.add(hit.header) }
  }
  const columns = new Set(row.cells.map((c) => c.index))
  const dataRows = below.slice(0, 8).filter((r) => {
    const filled = r.cells.filter((c) => columns.has(c.index) && c.text.trim()).length
    return filled >= Math.max(2, Math.ceil(columns.size * 0.3))
  }).length
  if (!dataRows) return { score: -1, matched, dataRows }
  return { score: matched * 100 + dataRows * 6 + Math.min(texts.length, 40), matched, dataRows }
}

/** Pilih blok (sheet + baris judul) yang paling cocok dengan form unit di seluruh workbook. */
export function pickBestBlock(sheets: readonly BlockSheet[], targets: ReadonlyArray<ReadonlyArray<string>>, opts: { exclude?: ReadonlySet<string> } = {}): BlockChoice | null {
  let best: BlockChoice | null = null
  for (const sheet of sheets) {
    if (opts.exclude?.has(sheet.name)) continue
    sheet.rows.forEach((row, i) => {
      const r = scoreHeaderRow(row, sheet.rows.slice(i + 1), targets)
      if (r.score < 0) return
      if (!best || r.score > best.score) best = { sheet: sheet.name, headerRow: row.rowNumber, ...r }
    })
  }
  return best
}
