// Pembuat kode QR kecil tanpa pustaka luar (mode byte, koreksi galat M, versi 1–10 ≈ hingga 213 byte).
// Mengikuti ISO/IEC 18004; struktur mengacu pada implementasi referensi Project Nayuki.

const ECC_PER_BLOCK_M = [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26]
const BLOCKS_M = [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5]
const MAX_VERSION = 10

const rawModules = (ver: number) => {
  let r = (16 * ver + 128) * ver + 64
  if (ver >= 2) {
    const n = Math.floor(ver / 7) + 2
    r -= (25 * n - 10) * n - 55
    if (ver >= 7) r -= 36
  }
  return r
}
const dataCodewords = (ver: number) => Math.floor(rawModules(ver) / 8) - ECC_PER_BLOCK_M[ver] * BLOCKS_M[ver]

const gfMul = (x: number, y: number) => {
  let z = 0
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x }
  return z & 0xff
}
const rsDivisor = (degree: number) => {
  const r = new Array<number>(degree).fill(0); r[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1] }
    root = gfMul(root, 0x02)
  }
  return r
}
const rsRemainder = (data: number[], div: number[]) => {
  const r = new Array<number>(div.length).fill(0)
  for (const b of data) {
    const f = b ^ (r.shift() as number); r.push(0)
    div.forEach((c, i) => { r[i] ^= gfMul(c, f) })
  }
  return r
}

const alignPositions = (ver: number) => {
  if (ver === 1) return []
  const n = Math.floor(ver / 7) + 2
  const step = Math.ceil((ver * 4 + 4) / (n * 2 - 2)) * 2
  const res = [6]
  for (let pos = ver * 4 + 17 - 7; res.length < n; pos -= step) res.splice(1, 0, pos)
  return res
}

const MASKS: Array<(x: number, y: number) => boolean> = [
  (x, y) => (x + y) % 2 === 0, (_x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
]

/** Matriks modul QR (true = gelap). Melempar galat bila teks terlalu panjang. */
export function encodeQr(text: string): boolean[][] {
  const bytes = Array.from(new TextEncoder().encode(text))
  let ver = 1
  for (; ver <= MAX_VERSION; ver++) {
    const ccBits = ver <= 9 ? 8 : 16
    if (4 + ccBits + bytes.length * 8 <= dataCodewords(ver) * 8) break
  }
  if (ver > MAX_VERSION) throw new Error('Teks terlalu panjang untuk kode QR.')
  const cap = dataCodewords(ver) * 8

  // Aliran bit data.
  const bits: number[] = []
  const put = (v: number, n: number) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1) }
  put(0b0100, 4); put(bytes.length, ver <= 9 ? 8 : 16); bytes.forEach((b) => put(b, 8))
  put(0, Math.min(4, cap - bits.length))
  put(0, (8 - (bits.length % 8)) % 8)
  for (let pad = 0xec; bits.length < cap; pad ^= 0xec ^ 0x11) put(pad, 8)
  const data: number[] = []
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0))

  // Blok + koreksi galat, lalu disisipkan.
  const nBlocks = BLOCKS_M[ver], eccLen = ECC_PER_BLOCK_M[ver]
  const raw = Math.floor(rawModules(ver) / 8)
  const nShort = nBlocks - (raw % nBlocks), shortLen = Math.floor(raw / nBlocks)
  const div = rsDivisor(eccLen)
  const blocks: number[][] = []
  for (let i = 0, k = 0; i < nBlocks; i++) {
    const dat = data.slice(k, k + shortLen - eccLen + (i < nShort ? 0 : 1)); k += dat.length
    const ecc = rsRemainder(dat, div)
    if (i < nShort) dat.push(0)
    blocks.push(dat.concat(ecc))
  }
  const codewords: number[] = []
  for (let i = 0; i < blocks[0].length; i++) blocks.forEach((b, j) => { if (i !== shortLen - eccLen || j >= nShort) codewords.push(b[i]) })

  const size = ver * 4 + 17
  const mod = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const fn = Array.from({ length: size }, () => new Array<boolean>(size).fill(false))
  const setF = (x: number, y: number, dark: boolean) => { mod[y][x] = dark; fn[y][x] = true }

  for (let i = 0; i < size; i++) { setF(6, i, i % 2 === 0); setF(i, 6, i % 2 === 0) }
  const finder = (cx: number, cy: number) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const x = cx + dx, y = cy + dy; if (x >= 0 && x < size && y >= 0 && y < size) { const d = Math.max(Math.abs(dx), Math.abs(dy)); setF(x, y, d !== 2 && d !== 4) } } }
  finder(3, 3); finder(size - 4, 3); finder(3, size - 4)
  const al = alignPositions(ver)
  al.forEach((ay, i) => al.forEach((ax, j) => {
    if ((i === 0 && j === 0) || (i === 0 && j === al.length - 1) || (i === al.length - 1 && j === 0)) return
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) setF(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
  }))
  const drawFormat = (mask: number) => {
    const d = (0 << 3) | mask // ECC M = 00
    let rem = d
    for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    const b = ((d << 10) | rem) ^ 0x5412
    const bit = (i: number) => ((b >>> i) & 1) !== 0
    for (let i = 0; i <= 5; i++) setF(8, i, bit(i))
    setF(8, 7, bit(6)); setF(8, 8, bit(7)); setF(7, 8, bit(8))
    for (let i = 9; i < 15; i++) setF(14 - i, 8, bit(i))
    for (let i = 0; i < 8; i++) setF(size - 1 - i, 8, bit(i))
    for (let i = 8; i < 15; i++) setF(8, size - 15 + i, bit(i))
    setF(8, size - 8, true)
  }
  drawFormat(0)
  if (ver >= 7) {
    let rem = ver
    for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    const b = (ver << 12) | rem
    for (let i = 0; i < 18; i++) { const bit = ((b >>> i) & 1) !== 0; const a = size - 11 + (i % 3), c = Math.floor(i / 3); setF(a, c, bit); setF(c, a, bit) }
  }

  // Tempatkan kode secara zig-zag.
  let bi = 0
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v
      if (!fn[y][x] && bi < codewords.length * 8) { mod[y][x] = ((codewords[bi >>> 3] >>> (7 - (bi & 7))) & 1) !== 0; bi++ }
    }
  }

  // Pilih mask dengan penalti terkecil (aturan baris berurutan, kotak 2×2, keseimbangan).
  const penalty = (m: boolean[][]) => {
    let p = 0
    for (let t = 0; t < 2; t++) for (let a = 0; a < size; a++) {
      let run = 1
      for (let b = 1; b < size; b++) {
        const cur = t ? m[b][a] : m[a][b], prev = t ? m[b - 1][a] : m[a][b - 1]
        if (cur === prev) { run++; if (run === 5) p += 3; else if (run > 5) p++ } else run = 1
      }
    }
    for (let y = 0; y < size - 1; y++) for (let x = 0; x < size - 1; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3 }
    const dark = m.reduce((s, r) => s + r.filter(Boolean).length, 0)
    p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10
    return p
  }
  let best: boolean[][] = mod, bestP = Infinity
  for (let mk = 0; mk < 8; mk++) {
    const m = mod.map((r) => r.slice())
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (!fn[y][x] && MASKS[mk](x, y)) m[y][x] = !m[y][x]
    // Tulis bit format untuk mask ini ke salinan.
    const save = mod.map((r) => r.slice()); drawFormat(mk)
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (fn[y][x]) m[y][x] = mod[y][x]
    for (let y = 0; y < size; y++) mod[y] = save[y]
    const pv = penalty(m)
    if (pv < bestP) { bestP = pv; best = m }
  }
  return best
}

/** Path SVG (viewBox 0 0 n+8 n+8, termasuk zona tenang 4 modul). */
export function qrSvgPath(matrix: boolean[][]): { path: string; size: number } {
  const n = matrix.length
  let d = ''
  matrix.forEach((row, y) => row.forEach((on, x) => { if (on) d += `M${x + 4} ${y + 4}h1v1h-1z` }))
  return { path: d, size: n + 8 }
}
