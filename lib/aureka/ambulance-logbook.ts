export type AmbulanceIndicatorOption = {
  label: string
  code?: number | null
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}

export type NormalizedAmbulanceTime = {
  time: string | null
  warnings: string[]
  /** True only when Excel explicitly encoded the time as the first day after the base date. */
  excelDayCarry: boolean
}

function cleanChoice(value: unknown): string {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\\s+/g, ' ')
    .trim()
    .replace(/\\s*\\(code\\s*\\d+\\)\\s*$/i, '')
    .toLocaleLowerCase('id-ID')
}

const SOURCE_OPTION_ALIASES: Array<{ source: string; code: number; canonical: string }> = [
  {
    source: 'Pelayanan Tepat Waktu',
    code: 1,
    canonical: 'Waktu Pelayanan Sesuai SPO / Tepat Waktu',
  },
  {
    source: 'Terlambat (Stabilisasi Kondisi Pasien/Diselamatkan dulu)',
    code: 2,
    canonical: 'Terlambat (Stabilisasi Kondisi Pasien - Life Saving dulu di IGD)',
  },
  {
    source: 'Terlambat (Faktor Eksternal: Cuaca/Banjir/Macet Total)',
    code: 2,
    canonical: 'Terlambat (Faktor Eksternal: Cuaca/Banjir/Macet Total)',
  },
  {
    source: 'Terlambat (Menunggu Keluarga Datang / Keluarga Mengurus Admin)',
    code: 2,
    canonical: 'Terlambat (Menunggu Keluarga Datang / Keluarga Mengurus Admin)',
  },
  {
    source: 'Terlambat (Supir Tidak Ada di Tempat / Sulit Dihubungi)',
    code: 3,
    canonical: 'Terlambat (Supir Tidak Ada di Tempat / Sulit Dihubungi)',
  },
  {
    source: 'Terlambat (Masalah Teknis: Ambulans Mogok / Bensin Habis / Aki Soak)',
    code: 3,
    canonical: 'Terlambat (Masalah Teknis: Ambulans Mogok / Bensin Habis / Aki Soak)',
  },
  {
    source: 'Terlambat (RS Menahan Pasien karena Masalah Biaya / Uang Muka)',
    code: 3,
    canonical: 'Terlambat (RS Menahan Pasien karena Masalah Biaya / Uang Muka)',
  },
]

/** Map workbook dropdown labels to the current, active AUREKA master option without changing the source text. */
export function matchAmbulanceOption<T extends AmbulanceIndicatorOption>(raw: unknown, options: T[]): T | null {
  const sourceText = String(raw ?? '').trim()
  if (!sourceText) return null

  const codeSuffix = sourceText.match(/\\s*\\(code\\s*(\\d+)\\)\\s*$/i)
  const sourceCode = codeSuffix ? Number(codeSuffix[1]) : null
  const sourceLabel = cleanChoice(sourceText)
  const alias = SOURCE_OPTION_ALIASES.find(item => cleanChoice(item.source) === sourceLabel)

  if (alias) {
    if (sourceCode != null && sourceCode !== alias.code) return null
    const canonical = options.filter(option =>
      cleanChoice(option.label) === cleanChoice(alias.canonical) &&
      Number(option.code) === alias.code
    )
    return canonical.length === 1 ? canonical[0] : null
  }

  const matches = options.filter(option => cleanChoice(option.label) === sourceLabel)
  if (sourceCode != null) {
    const sameCode = matches.find(option => option.code != null && Number(option.code) === sourceCode)
    return sameCode ?? null
  }
  return matches.length === 1 ? matches[0] : null
}

function pad2(value: number): string {
  return String(value).padStart(2, '0')
}

function validTime(hour: number, minute: number): boolean {
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 &&
    Number.isInteger(minute) && minute >= 0 && minute <= 59
}

/** Normalize Excel time cells and obvious separator/OCR-entry errors while keeping a warning trail. */
export function normalizeAmbulanceTime(value: unknown): NormalizedAmbulanceTime {
  const warnings: string[] = []
  if (value == null || String(value).trim() === '') {
    return { time: null, warnings: ['Waktu sumber kosong; kecepatan respons belum dapat dihitung.'], excelDayCarry: false }
  }

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) {
      return { time: null, warnings: ['Nilai waktu sumber berupa tanggal yang tidak valid.'], excelDayCarry: false }
    }
    const hour = value.getUTCHours()
    const minute = value.getUTCMinutes()
    if (!validTime(hour, minute)) {
      return { time: null, warnings: ['Komponen jam/menit pada nilai waktu sumber tidak valid.'], excelDayCarry: false }
    }
    const year = value.getUTCFullYear()
    const month = value.getUTCMonth()
    const day = value.getUTCDate()
    const isBaseDate = year === 1899 && month === 11 && day === 30
    const excelDayCarry = year === 1900 && month === 0 && day === 1
    if (!isBaseDate) {
      warnings.push(excelDayCarry
        ? 'Sel waktu memuat komponen tanggal Excel 1 Januari 1900; dipertahankan sebagai penanda kemungkinan pergantian hari.'
        : 'Sel waktu memuat komponen tanggal Excel yang tidak lazim; hanya jam-menit yang digunakan.')
    }
    if (value.getUTCSeconds() !== 0 || value.getUTCMilliseconds() !== 0) {
      warnings.push('Detik pada sel waktu sumber diabaikan karena formulir menggunakan presisi menit.')
    }
    return { time: pad2(hour) + ':' + pad2(minute), warnings, excelDayCarry }
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 0 || value > 100000) {
      return { time: null, warnings: ['Angka waktu sumber berada di luar rentang Excel yang diizinkan.'], excelDayCarry: false }
    }
    const days = Math.floor(value)
    const fraction = value - days
    const totalMinutes = Math.round(fraction * 1440) % 1440
    const hour = Math.floor(totalMinutes / 60)
    const minute = totalMinutes % 60
    const excelDayCarry = days === 2
    if (days !== 0) {
      warnings.push(excelDayCarry
        ? 'Nilai waktu memiliki komponen tanggal Excel 1 Januari 1900; periksa kemungkinan pergantian hari.'
        : 'Nilai waktu memiliki komponen tanggal Excel tambahan; hanya jam-menit yang digunakan.')
    }
    return { time: pad2(hour) + ':' + pad2(minute), warnings, excelDayCarry }
  }

  const original = String(value).trim()
  const compact = original.replace(/\\s+/g, '')
  let normalized = compact
  let repaired = false

  const replaceAndTrack = (pattern: RegExp, replacement: string) => {
    const next = normalized.replace(pattern, replacement)
    if (next !== normalized) repaired = true
    normalized = next
  }

  replaceAndTrack(/[;"'’]/g, ':')
  replaceAndTrack(/[pP]/g, ':')
  replaceAndTrack(/(?<=\\d)[oO](?=\\d)/g, '0')
  replaceAndTrack(/:+/g, ':')
  normalized = normalized.replace(/^:|:$/g, '')

  const match = normalized.match(/^(\\d{1,2}):(\\d{1,2})(?::(\\d{1,2}))?$/)
  if (!match) {
    return {
      time: null,
      warnings: ['Format waktu sumber tidak dikenali dan tidak diubah: "' + original + '".'],
      excelDayCarry: false,
    }
  }

  const hour = Number(match[1])
  const minute = Number(match[2])
  const second = Number(match[3] ?? 0)
  if (!validTime(hour, minute) || !Number.isInteger(second) || second < 0 || second > 59) {
    return {
      time: null,
      warnings: ['Jam, menit, atau detik sumber berada di luar rentang waktu yang valid: "' + original + '".'],
      excelDayCarry: false,
    }
  }
  if (repaired) warnings.push('Format teks waktu sumber dinormalisasi secara terbatas dari "' + original + '" menjadi "' + pad2(hour) + ':' + pad2(minute) + '".')
  if (second !== 0) warnings.push('Detik pada waktu sumber (' + second + ' detik) diabaikan karena formulir menggunakan presisi menit.')
  return { time: pad2(hour) + ':' + pad2(minute), warnings, excelDayCarry: false }
}

/** Parse date-only values without relying on browser locale. */
export function normalizeAmbulanceDate(value: unknown): string | null {
  if (value == null || String(value).trim() === '') return null

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    const year = value.getUTCFullYear()
    if (year < 1900 || year > 2200) return null
    return year + '-' + pad2(value.getUTCMonth() + 1) + '-' + pad2(value.getUTCDate())
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 20000 || value > 120000) return null
    const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(value) * 86400000)
    if (Number.isNaN(date.getTime())) return null
    const year = date.getUTCFullYear()
    if (year < 1900 || year > 2200) return null
    return year + '-' + pad2(date.getUTCMonth() + 1) + '-' + pad2(date.getUTCDate())
  }

  const raw = String(value).trim()
  let year: number
  let month: number
  let day: number
  const iso = raw.match(/^(\\d{4})-(\\d{1,2})-(\\d{1,2})(?:[T ].*)?$/)
  const dmy = raw.match(/^(\\d{1,2})[\\/.-](\\d{1,2})[\\/.-](\\d{4})$/)
  if (iso) {
    year = Number(iso[1]); month = Number(iso[2]); day = Number(iso[3])
  } else if (dmy) {
    day = Number(dmy[1]); month = Number(dmy[2]); year = Number(dmy[3])
  } else {
    return null
  }
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1 || day > 31) return null
  const date = new Date(Date.UTC(year, month - 1, day))
  if (date.getUTCFullYear() !== year || date.getUTCMonth() + 1 !== month || date.getUTCDate() !== day) return null
  return year + '-' + pad2(month) + '-' + pad2(day)
}

/** A reversed clock time is unknown unless the workbook carries an explicit Excel day-one marker. */
export function calculateAmbulanceResponseMinutes(
  requestedTime: unknown,
  deliveredTime: unknown,
  allowOvernightRollover = false,
): number | null {
  const parse = (value: unknown): number | null => {
    const text = String(value ?? '').trim()
    const match = text.match(/^(\\d{2}):(\\d{2})$/)
    if (!match) return null
    const hour = Number(match[1])
    const minute = Number(match[2])
    return validTime(hour, minute) ? hour * 60 + minute : null
  }
  const start = parse(requestedTime)
  const end = parse(deliveredTime)
  if (start == null || end == null) return null
  if (end >= start) return end - start
  if (!allowOvernightRollover) return null
  return end + 1440 - start
}

/** Keep source issues actionable in the import preview and preserve them as provenance metadata. */
export function ambulanceSourceWarnings(input: {
  patientName?: unknown
  requestDate?: unknown
  requestedTime?: unknown
  deliveredTime?: unknown
  origin?: unknown
  driver?: unknown
  activity?: unknown
  destination?: unknown
  indicatorValue?: unknown
  formulaValue?: unknown
  timeWarnings?: string[]
  overnightRollover?: boolean
  responseMinutes?: number | null
}): string[] {
  const warnings = [...(input.timeWarnings ?? [])]
  const checks: Array<[unknown, string]> = [
    [input.patientName, 'Nama pasien kosong; cocokkan dengan dokumen sumber.'],
    [input.requestedTime, 'Waktu permintaan kosong/tidak valid; kecepatan respons tidak dihitung.'],
    [input.deliveredTime, 'Waktu diantar kosong/tidak valid; kecepatan respons tidak dihitung.'],
    [input.origin, 'Asal ruangan kosong; lengkapi dari sumber yang sah.'],
    [input.driver, 'Nama supir kosong; verifikasi petugas yang bertugas.'],
    [input.activity, 'Kegiatan ambulance kosong; verifikasi tujuan operasional.'],
    [input.destination, 'Tujuan ambulance kosong; lengkapi dari sumber yang sah.'],
  ]
  for (const [value, message] of checks) {
    if (value == null || String(value).trim() === '') warnings.push(message)
  }
  if (/^0+$/.test(String(input.driver ?? '').trim())) {
    warnings.push('Nama supir pada sumber bernilai 0; identitas petugas perlu diverifikasi.')
  }
  if (input.formulaValue != null && /^#(VALUE|NUM|REF|DIV\\/0|N\\/A|NAME)!?$/i.test(String(input.formulaValue).trim())) {
    warnings.push('Rumus Kecepatan Respon pada workbook menghasilkan ' + String(input.formulaValue).trim() + '; nilai dihitung ulang dari jam sumber yang dapat dibaca.')
  }
  if (input.overnightRollover) {
    warnings.push('Jam diantar memiliki penanda pergantian hari Excel; durasi lintas tengah malam dihitung dan wajib diverifikasi.')
  } else if (input.requestedTime && input.deliveredTime && input.responseMinutes == null) {
    warnings.push('Urutan jam tidak valid/ambigu; kecepatan respons dibiarkan kosong, tidak diasumsikan melewati tengah malam.')
  }
  if (!input.indicatorValue || !cleanChoice(input.indicatorValue)) {
    warnings.push('Pilihan Pelayanan Ambulance kosong; catatan tidak dapat diimpor tanpa klasifikasi indikator.')
  }
  return [...new Set(warnings)]
}
