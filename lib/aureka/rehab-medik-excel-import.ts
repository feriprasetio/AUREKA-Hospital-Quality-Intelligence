export type RehabIndicatorOption = {
  code: number | null
  label: string
  numerator?: boolean | null
  denominator?: boolean
  review_required?: boolean
}
export type RehabIndicatorProfile = {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  is_active?: boolean
  status?: string
  options_json?: RehabIndicatorOption[]
}
export type RehabSourceAnswer = {
  label: string
  code: number | null
  sourceLabel: string
  sourceCode: number | null
  reviewRequired: boolean
}

export function normalizeRehabDate(value: unknown): string | null {
  const valid = (year:number, month:number, day:number):string|null => {
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? String(year) + '-' + String(month).padStart(2,'0') + '-' + String(day).padStart(2,'0')
      : null
  }
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return valid(value.getUTCFullYear(), value.getUTCMonth()+1, value.getUTCDate())
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    if (value < 20000 || value > 80000) return null
    const date = new Date(Date.UTC(1899,11,30) + Math.floor(value)*86400000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0,10)
  }
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) return valid(Number(iso[1]),Number(iso[2]),Number(iso[3]))
  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)
  if (dmy) return valid(Number(dmy[3]),Number(dmy[2]),Number(dmy[1]))
  if (/^\d+(?:[.,]\d+)?$/.test(raw)) {
    const serial = Number(raw.replace(',','.'))
    if (serial < 20000 || serial > 80000) return null
    const date = new Date(Date.UTC(1899,11,30)+Math.floor(serial)*86400000)
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0,10)
  }
  return null
}

export function normalizeRehabOptionLabel(value:string):string {
  return value.trim().normalize('NFKC').replace(/\s+/g,' ').toLocaleLowerCase('id-ID')
}

export function parseRehabSourceAnswer(value:unknown, options:RehabIndicatorOption[]):RehabSourceAnswer|null {
  const sourceLabel = String(value ?? '').trim()
  if (!sourceLabel) return null
  const match = sourceLabel.match(/\s*\(Code\s*([1-3])\)\s*$/i)
  const sourceCode = match ? Number(match[1]) : null
  const label = sourceLabel.replace(/\s*\(Code\s*[1-3]\)\s*$/i,'').trim()
  const option = options.find(item => normalizeRehabOptionLabel(String(item.label ?? '')) === normalizeRehabOptionLabel(label))
  if (!option) throw new Error('Pilihan "' + label + '" belum tersedia pada master indikator aktif.')
  const code = option.code == null ? null : Number(option.code)
  if (sourceCode != null && code !== sourceCode) {
    throw new Error('Kode sumber Code ' + sourceCode + ' berbeda dengan kode master untuk "' + label + '".')
  }
  if (sourceCode == null && code != null) {
    throw new Error('Label "' + label + '" tidak memiliki kode Code 1/2/3 pada workbook, tetapi master mengharuskan kode.')
  }
  const reviewRequired = option.review_required === true || code == null || typeof option.numerator !== 'boolean'
  return { label: String(option.label), code, sourceLabel, sourceCode, reviewRequired }
}

/** Source row is stable for a given workbook and allows repeated patient visits on the same date. */
export function makeRehabMedikSubjectKey(year:number, sourceRow:number):string {
  return '12:' + year + ':source-row:' + sourceRow
}
