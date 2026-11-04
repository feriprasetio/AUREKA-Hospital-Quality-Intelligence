export type MeasurementKind = 'ratio' | 'visit' | 'door' | 'minutes' | 'numeric' | 'occurrence' | 'compliance'

export type IndicatorProfile = {
  title?: string | null
  target_text?: string | null
  target_operator?: string | null
  target_value?: number | string | null
  measurement_grain?: string | null
  measurement_method?: string | null
  input_type?: string | null
  numerator_definition?: string | null
  denominator_definition?: string | null
  schema_json?: Record<string, unknown> | null
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function resolveMeasurementKind(profile: IndicatorProfile): MeasurementKind {
  const schema = profile.schema_json ?? {}
  const declarations = [
    schema.measurement_type,
    schema.input_type,
    schema.measurement_method,
    profile.measurement_method,
    profile.input_type,
  ]
  for (const value of declarations) {
    const declared = normalize(value)
    if (!declared) continue
    if (['ratio', 'proportion', 'percentage', 'rate', 'numerator_denominator', 'numerator/denominator'].includes(declared)) return 'ratio'
    if (['visit_window', 'clock_window', 'time_window', 'visit_time'].includes(declared)) return 'visit'
    if (['door_to_decision', 'duration_between_times', 'time_interval', 'duration_between_events'].includes(declared)) return 'door'
    if (['duration', 'duration_minutes', 'minutes', 'response_time_minutes'].includes(declared)) return 'minutes'
    if (['numeric', 'number', 'numeric_target', 'continuous_numeric'].includes(declared)) return 'numeric'
    if (['occurrence', 'event_occurrence', 'binary_event', 'event_count'].includes(declared)) return 'occurrence'
    if (['compliance', 'option_response', 'manual_review', 'binary', 'boolean'].includes(declared)) return 'compliance'
  }

  // Profil lama yang mendeklarasikan pasangan kolom numerator/denominator pada
  // schema_json.fields secara struktural adalah indikator rasio (N/D), sehingga
  // respons {numerator, denominator} tidak lagi jatuh ke klasifikasi compliance.
  const fields = Array.isArray(schema.fields) ? schema.fields.map((field) => normalize(field)) : []
  if (fields.includes('numerator') && fields.includes('denominator')) return 'ratio'

  // Legacy profiles can be resolved from their declared N/D definitions, but not from grain alone.
  if (['daily_metric', 'provider_day'].includes(String(profile.measurement_grain ?? '')) &&
      readText(profile.numerator_definition) && readText(profile.denominator_definition)) return 'ratio'

  // Compatibility fallback for older profiles that predate explicit measurement metadata.
  const title = String(profile.title ?? '').toLowerCase()
  if (title.includes('jam visite dokter spesialis')) return 'visit'
  if (title.includes('door-to-decision')) return 'door'
  if (title.includes('response time') || title.includes('waktu tanggap')) return 'minutes'
  if (title.includes('kt/v')) return 'numeric'
  if (/kejadian |angka kematian|overcrowding|unplanned|kekosongan |dead stock|limfedema/.test(title)) return 'occurrence'
  return 'compliance'
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = String(value ?? '').trim().replace(/\s+/g, '')
  if (!text) return null
  // Ambil token numerik pertama; target sering tertanam dalam teks bebas ("≥ 82,5%").
  const token = text.match(/-?\d[\d.,]*/)
  if (!token) return null
  let candidate = token[0]
  // Notasi Indonesia dengan grouping: 1.234,5 → 1234.5 (bukan 1.234 lalu salah baca).
  if (/^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(candidate)) candidate = candidate.replace(/\./g, '').replace(',', '.')
  // Desimal koma tunggal: 82,5 → 82.5.
  else if (/^-?\d+,\d+$/.test(candidate)) candidate = candidate.replace(',', '.')
  // Angka ambigu seperti "1.234" tidak ditebak (kebijakan yang sama dengan oppe-engine).
  const number = Number(candidate)
  return Number.isFinite(number) ? number : null
}

function operatorFromText(text: string): string | null {
  const match = text.match(/^(\s*)(<=|>=|≤|≥|<|>)/)
  if (!match) return null
  if (match[2] === '≤') return '<='
  if (match[2] === '≥') return '>='
  return match[2]
}

export function readTarget(profile: IndicatorProfile): { value: number | null; operator: string | null } {
  const schema = profile.schema_json ?? {}
  const text = readText(profile.target_text) || readText(schema.target_text)
  const rawValue = profile.target_value ?? schema.target_value
  const value = numericValue(rawValue) ?? numericValue(text)
  const rawOperator = String(profile.target_operator ?? schema.target_operator ?? '').trim()
  const operator = rawOperator === '≤' ? '<=' : rawOperator === '≥' ? '>=' : rawOperator || operatorFromText(text)
  return { value, operator }
}

export function compareToTarget(profile: IndicatorProfile, actual: number | null | undefined, defaultOperator = '='): boolean | null {
  if (actual == null || !Number.isFinite(Number(actual))) return null
  const { value, operator } = readTarget(profile)
  if (value == null) return null
  const op = operator || defaultOperator
  const n = Number(actual)
  // Toleransi epsilon simetris untuk SEMUA operator: hasil agregat pecahan akibat
  // aritmetika float (mis. rata-rata 89.99999999999999 yang bermaksud 90) tidak
  // boleh gagal/ lolos hanya karena operatornya ketat (<, >). Nilai yang berada
  // dalam epsilon dianggap SAMA dengan target.
  if (Math.abs(n - value) < 1e-9) return op === '>=' || op === '<=' || op === '='
  if (op === '<=') return n <= value
  if (op === '>=') return n >= value
  if (op === '<') return n < value
  if (op === '>') return n > value
  return false
}

function clockMinute(value: unknown): number | null {
  const text = String(value ?? '').trim().replace('.', ':')
  const match = text.match(/^(\d{1,2}):(\d{2})$/)
  if (!match) return null
  const hour = Number(match[1])
  const minute = Number(match[2])
  return hour >= 0 && hour < 24 && minute >= 0 && minute < 60 ? hour * 60 + minute : null
}

export function readVisitWindow(profile: IndicatorProfile): { startMinute: number; endMinute: number } | null {
  const schema = profile.schema_json ?? {}
  const start = clockMinute(schema.target_start_time ?? schema.window_start)
  const end = clockMinute(schema.target_end_time ?? schema.window_end)
  if (start != null && end != null) return { startMinute: start, endMinute: end }

  const target = readText(profile.target_text) || readText(schema.target_text)
  const match = target.match(/(\d{1,2}[.:]\d{2})\s*(?:-|–|—|sampai|hingga|to)\s*(\d{1,2}[.:]\d{2})/i)
  if (!match) return null
  const parsedStart = clockMinute(match[1])
  const parsedEnd = clockMinute(match[2])
  return parsedStart == null || parsedEnd == null ? null : { startMinute: parsedStart, endMinute: parsedEnd }
}

export function isWithinVisitWindow(profile: IndicatorProfile, time: string): boolean | null {
  const window = readVisitWindow(profile)
  const actual = clockMinute(time)
  if (!window || actual == null) return null
  if (window.startMinute <= window.endMinute) return actual >= window.startMinute && actual <= window.endMinute
  return actual >= window.startMinute || actual <= window.endMinute
}
