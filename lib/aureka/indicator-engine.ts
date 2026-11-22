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
  options_json?: Array<{ label?: unknown; code?: unknown; review_required?: boolean }> | null
}

function normalize(value: unknown): string {
  return String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

/**
 * Separates the per-episode response control from the aggregation method.
 * Patient episodes with a directional master and coded 1/2/3 options are
 * entered as one categorical response; the results engine still aggregates
 * the selected codes into the declared ratio.
 */
export function usesCategoricalResponseCapture(profile: IndicatorProfile): boolean {
  const schema = profile.schema_json ?? {}
  const declaredMode = normalize(schema.response_capture_mode)
  if (declaredMode) {
    return ['categorical', 'coded_choice', 'option_response'].includes(declaredMode)
  }

  if (normalize(schema.input_mode) === 'free_text_event') return false
  if (normalize(profile.measurement_grain) !== 'patient_episode') return false

  const explicitMeasurementKinds = [
    schema.measurement_type,
    schema.input_type,
    schema.measurement_method,
    profile.measurement_method,
    profile.input_type,
  ].map(normalize)
  const dedicatedContinuousModes = [
    'visit_window', 'clock_window', 'time_window', 'visit_time',
    'door_to_decision', 'duration_between_times', 'time_interval', 'duration_between_events',
    'duration', 'duration_minutes', 'minutes', 'response_time_minutes',
    'numeric', 'number', 'numeric_target', 'continuous_numeric',
  ]
  if (explicitMeasurementKinds.some(value => dedicatedContinuousModes.includes(value))) return false

  const direction = normalize(schema.indicator_direction)
  if (direction !== 'positive' && direction !== 'negative') return false

  const options = Array.isArray(profile.options_json) ? profile.options_json : []
  const codedOptions = options.filter(option => {
    const label = readText(option?.label)
    const code = Number(option?.code)
    return !!label && Number.isInteger(code) && [1, 2, 3].includes(code)
  })
  return codedOptions.length >= 2
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
  const text = String(value ?? '').trim().replace(',', '.')
  if (!text) return null
  const match = text.match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const number = Number(match[0])
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
  const textHasExplicitComparator = operatorFromText(text) != null
  const textIsBareNumericTarget = /^\s*-?\d+(?:[.,]\d+)?\s*%?\s*$/.test(text)
  // Do not extract incidental numbers from explanatory labels such as
  // "target belum ditetapkan pada sumber 2026" or "standar sumber 0%".
  // Descriptive text is provenance, not a numeric comparison target.
  const textValue = textHasExplicitComparator || textIsBareNumericTarget ? numericValue(text) : null
  const value = numericValue(rawValue) ?? textValue
  const rawOperator = String(profile.target_operator ?? schema.target_operator ?? '').trim()
  const operator = rawOperator === '≤' ? '<=' : rawOperator === '≥' ? '>=' : rawOperator || operatorFromText(text)
  return { value, operator }
}

/**
 * A percentage-of-observations target (e.g. 100% dialysis adequacy) is NOT
 * a threshold for a raw continuous observation (e.g. Kt/V 1.3 or 42 minutes).
 * A separately approved observation threshold is mandatory before counting
 * individual measurements as meeting that percentage target.
 */
export function usesContinuousAttainmentTarget(profile: IndicatorProfile): boolean {
  const kind = resolveMeasurementKind(profile)
  if (!['door', 'minutes', 'numeric'].includes(kind)) return false
  const schema = profile.schema_json ?? {}
  const aggregation = normalize(schema.result_aggregation ?? schema.aggregation_mode)
  return aggregation === 'attainment_percentage' ||
    /%/.test(readText(profile.target_text) || readText(schema.target_text))
}

export function compareContinuousObservation(
  profile: IndicatorProfile, actual: number | null | undefined, defaultOperator = '<=',
): boolean | null {
  if (!usesContinuousAttainmentTarget(profile)) {
    return compareToTarget(profile, actual, defaultOperator)
  }
  const schema = profile.schema_json ?? {}
  const rawThreshold = schema.observation_target_value
  if (rawThreshold == null || String(rawThreshold).trim() === '') return null
  const value = Number(String(rawThreshold).trim().replace(',', '.'))
  if (!Number.isFinite(value)) return null
  const operator = String(schema.observation_target_operator ?? defaultOperator).trim()
  if (!['=', '<', '<=', '>', '>=', '≤', '≥'].includes(operator)) return null
  return compareToTarget({
    ...profile, target_value: value,
    target_operator: operator,
    target_text: '',
    schema_json: {},
  }, actual, defaultOperator)
}

export function compareToTarget(profile: IndicatorProfile, actual: number | null | undefined, defaultOperator = '='): boolean | null {
  if (actual == null || !Number.isFinite(Number(actual))) return null
  const { value, operator } = readTarget(profile)
  if (value == null) return null
  const op = operator || defaultOperator
  const n = Number(actual)
  if (op === '<=') return n <= value + 1e-9
  if (op === '>=') return n >= value - 1e-9
  if (op === '<') return n < value
  if (op === '>') return n > value
  return Math.abs(n - value) < 1e-9
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
