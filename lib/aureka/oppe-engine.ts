export type OppeMeasurementMethod =
  | 'numerator_denominator'
  | 'option_response'
  | 'numeric_target'
  | 'manual_review'

export type OppeRule = {
  id?: string
  profile_id: string
  room_id: number
  profile_year: number
  is_oppe_eligible: boolean
  profession_label: string
  responsibility_field: string
  measurement_method: OppeMeasurementMethod
  minimum_observations: number
  criticality: 'standard' | 'high' | 'critical'
  status: 'draft' | 'active' | 'retired'
  notes?: string
}

export type OppeProfile = {
  id: string
  code: string
  title: string
  room_id: number
  unit_name?: string
  profile_year: number
  indicator_type?: string
  category?: string
  unit_of_measure?: string
  target_text?: string | null
  target_operator?: string | null
  target_value?: number | string | null
  numerator_definition?: string | null
  denominator_definition?: string | null
  measurement_grain?: string
  options_json?: unknown
  schema_json?: Record<string, unknown> | null
}

export type OppeQualityRecord = {
  id: string
  room_id: number
  profile_year: number
  record_date?: string | null
  period_start?: string | null
  period_end?: string | null
  status: string
  core_data?: Record<string, any> | null
  subject_json?: Record<string, any> | null
  measurement_grain?: string | null
  staff_attributions?: Array<{ staff_id: string; field_key: string }> | null
}

export type OppeResponseRow = {
  record_id: string
  indicator_id: string
  raw_value?: Record<string, any> | null
  response_label?: string | null
  response_code?: number | null
}

export type OppeResponseIndex = ReadonlyMap<string, OppeResponseRow>

const responseIndexKey = (recordId: string, indicatorId: string) => `${recordId}::${indicatorId}`

export function buildOppeResponseIndex(rows: OppeResponseRow[]): OppeResponseIndex {
  const index = new Map<string, OppeResponseRow>()
  for (const row of rows) index.set(responseIndexKey(String(row.record_id), String(row.indicator_id)), row)
  return index
}

export type ClinicalIndicatorResult = {
  profileId: string
  code: string
  title: string
  unitName: string
  unitOfMeasure: string
  grain: string
  profession: string
  attributionField: string
  measurementMethod: OppeMeasurementMethod
  criticality: 'standard' | 'high' | 'critical'
  observations: number
  attributedRecords: number
  missingResponses: number
  numerator: number | null
  denominator: number | null
  rate: number | null
  numericMean: number | null
  targetText: string
  targetValue: number | null
  targetOperator: string | null
  targetMet: boolean | null
  status: 'meets_target' | 'below_target' | 'insufficient_data' | 'manual_review' | 'not_applicable'
  reason: string
  sourceRecordIds: string[]
}

export type ManualItemStatus = 'pending' | 'good' | 'needs_review' | 'na' | 'insufficient_data'
export type ManualAssessmentItem = {
  id: string
  label: string
  target: string
  status: ManualItemStatus
  count: string
  evidence: string
  notes: string
}

export type DomainScore = {
  score: number | null
  assessed: number
  applicable: number
  complete: boolean
  label: string
  reason: string
}

const norm = (value: unknown) => String(value ?? '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .trim()
  .toLocaleLowerCase('id-ID')
  .replace(/\s+/g, ' ')

export function professionMatches(expected: string, actual: string): boolean {
  const e = norm(expected)
  const a = norm(actual)
  if (!e || !a) return false
  if (e === a) return true
  const groups: Array<[RegExp, RegExp]> = [
    [/^(tenaga medis|dokter|dokter spesialis)$/, /(dokter|dokter gigi)/],
    [/^dokter gigi$/, /dokter gigi/],
    [/^(perawat|nurse)$/, /perawat|nurse/],
    [/^(bidan|midwife)$/, /bidan|midwife/],
    [/^(farmasi\/apoteker|apoteker|farmasi|tenaga teknis kefarmasian)$/, /apoteker|farmasi|tenaga teknis kefarmasian|asisten apoteker/],
    [/^(atlm\/analis|atlm|analis laboratorium|teknologi laboratorium medik)$/, /atlm|analis laboratorium|teknologi laboratorium medik/],
    [/^(radiografer|tenaga radiologi)$/, /radiografer|radiologi/],
    [/^(nutrisionis\/dietisien|nutrisionis|dietisien)$/, /nutrisionis|dietisien|dietitian|gizi/],
    [/^(tenaga rehabilitasi medik|rehabilitasi medik)$/, /fisioterapis|fisioterapi|terapis okupasi|terapis wicara|rehabilitasi medik/],
    [/^(tenaga kesehatan lainnya|tenaga kesehatan)$/, /(psikolog|penata anestesi|terapis|elektromedis|refraksionis|sanitarian|epidemiolog|pembimbing kesehatan kerja|administrator kesehatan|penyuluh kesehatan)/],
  ]
  return groups.some(([pattern, group]) => pattern.test(e) && group.test(a))
}

const asObject = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {}

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let text = String(value).trim().replace(/\s+/g, '')
  if (!text) return null
  // Accept Indonesian decimal notation (95,5) and grouped values (1.234,5) without guessing on 1.234.
  if (/^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(text)) text = text.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d+,\d+$/.test(text)) text = text.replace(',', '.')
  const result = Number(text)
  return Number.isFinite(result) ? result : null
}

const optionsOf = (profile: OppeProfile): Array<Record<string, any>> =>
  Array.isArray(profile.options_json)
    ? profile.options_json.filter((item): item is Record<string, any> => !!item && typeof item === 'object')
    : []

export function periodBounds(year: number, quarter: number) {
  const startMonth = (quarter - 1) * 3
  const start = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`
  const endMonth = startMonth + 3
  const endDate = new Date(Date.UTC(year, endMonth, 0))
  const end = `${endDate.getUTCFullYear()}-${String(endDate.getUTCMonth() + 1).padStart(2, '0')}-${String(endDate.getUTCDate()).padStart(2, '0')}`
  return { start, end }
}

const normalizeDate = (value: unknown): string => {
  const text = String(value ?? '').trim()
  if (!text) return ''

  const toIso = (year: number, month: number, day: number) => {
    const date = new Date(Date.UTC(year, month - 1, day))
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return ''
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const iso = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?=$|[T\s])/)
  if (iso) return toIso(Number(iso[1]), Number(iso[2]), Number(iso[3]))

  // The application is Indonesian: slash/dot dates are interpreted as DD/MM/YYYY.
  const local = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?=$|[T\s])/)
  if (local) {
    const first = Number(local[1])
    const second = Number(local[2])
    const year = Number(local[3])
    if (first > 12) return toIso(year, second, first)
    if (second > 12) return toIso(year, first, second)
    return toIso(year, second, first)
  }
  return ''
}

export function recordDate(record: OppeQualityRecord): string {
  const core = asObject(record.core_data)
  const subject = asObject(record.subject_json)
  const fields = recordFields(record)
  const candidates = [
    record.record_date,
    core.record_date,
    fields['Tanggal Pengamatan'],
    fields['Tanggal Audit'],
    fields['Tanggal Dilayani'],
    fields['Tanggal Kunjungan'],
    fields['Tanggal Masuk'],
    fields['Tanggal Lapor'],
    fields['Tanggal'],
    core.admission_at,
    core.admit,
    subject.record_date,
    record.period_end,
    record.period_start,
  ]
  for (const candidate of candidates) {
    const date = normalizeDate(candidate)
    if (date) return date
  }
  return ''
}

export function isInPeriod(record: OppeQualityRecord, year: number, quarter: number): boolean {
  if (!Number.isInteger(quarter) || quarter < 1 || quarter > 4) return false
  const bounds = periodBounds(year, quarter)
  const core = recordCore(record)
  const fields = recordFields(record)
  const periodStartCandidates = [
    record.period_start, core.period_start, core.periodStart,
    fields['Periode Mulai'], fields['Tanggal Mulai Periode'], fields['Period Start'],
  ]
  const periodEndCandidates = [
    record.period_end, core.period_end, core.periodEnd,
    fields['Periode Selesai'], fields['Tanggal Selesai Periode'], fields['Period End'],
  ]
  const periodStart = periodStartCandidates.map(normalizeDate).find(Boolean) || ''
  const periodEnd = periodEndCandidates.map(normalizeDate).find(Boolean) || ''

  // Aggregated records must belong wholly to one quarter; do not allocate a cross-quarter aggregate arbitrarily.
  if (periodStart && periodEnd) {
    return periodStart <= periodEnd && periodStart >= bounds.start && periodEnd <= bounds.end
  }
  if (periodStart || periodEnd) {
    const boundary = periodStart || periodEnd
    return boundary >= bounds.start && boundary <= bounds.end
  }

  const date = recordDate(record)
  if (!date) return false
  return date >= bounds.start && date <= bounds.end
}

export function recordCore(record: OppeQualityRecord): Record<string, any> {
  const core = asObject(record.core_data)
  const subject = asObject(record.subject_json)
  // Core values take precedence, but subject fields remain available if core_data is partial.
  return { ...subject, ...core }
}

export function recordFields(record: OppeQualityRecord): Record<string, any> {
  const core = asObject(record.core_data)
  const subject = asObject(record.subject_json)
  const candidates = [core.form_fields, core.form_data, subject.form_fields, subject.form_data]
  for (const candidate of candidates) {
    const fields = asObject(candidate)
    if (Object.keys(fields).length) return fields
  }
  return {}
}

export function responsibleName(record: OppeQualityRecord, field: string): string {
  const core = recordCore(record)
  const fields = recordFields(record)
  const wanted = norm(field)
  const exactKey = Object.keys(fields).find((key) => norm(key) === wanted)
  const fromField = exactKey ? fields[exactKey] : undefined
  if (String(fromField ?? '').trim()) return String(fromField).trim()

  const coreKey = Object.keys(core).find((key) => norm(key) === wanted)
  if (coreKey && String(core[coreKey] ?? '').trim()) return String(core[coreKey]).trim()

  const aliases: Record<string, string[]> = {
    dpjp: ['dpjp', 'dokter penanggung jawab pelayanan'],
    dokter: ['dokter', 'nama dokter', 'dokter umum', 'dokter igd'],
    'perawat penerima': ['perawat penerima', 'perawat', 'perawat igd'],
    'bidan penerima': ['bidan penerima', 'bidan'],
    'nama terapis': ['nama terapis', 'terapis'],
    'radiografer penerima': ['radiografer penerima', 'radiografer'],
    'analis penerima': ['analis penerima', 'analis', 'atlm'],
  }
  const alias = aliases[wanted] || []
  for (const key of alias) {
    const candidate = Object.keys(fields).find((fieldName) => norm(fieldName) === norm(key))
    if (candidate && String(fields[candidate] ?? '').trim()) return String(fields[candidate]).trim()
  }
  if (wanted === 'dpjp') {
    const value = core.dpjp ?? core.DPJP
    if (String(value ?? '').trim()) return String(value).trim()
  }
  return ''
}

export function responseFor(
  record: OppeQualityRecord,
  profile: OppeProfile,
  responseRows: OppeResponseRow[] | OppeResponseIndex,
): Record<string, any> | null {
  const core = recordCore(record)
  const values = asObject(core.indicator_values)
  const byCode = asObject(values[profile.code])
  if (Object.keys(byCode).length) return byCode

  const row = Array.isArray(responseRows)
    ? responseRows.find((item) => item.record_id === record.id && item.indicator_id === profile.id)
    : (responseRows as OppeResponseIndex).get(responseIndexKey(String(record.id), String(profile.id)))

  if (row?.raw_value && typeof row.raw_value === 'object' && Object.keys(row.raw_value).length) return row.raw_value
  if (row?.raw_value !== null && row?.raw_value !== undefined && typeof row.raw_value !== 'object') {
    return { answer: String(row.raw_value), value: row.raw_value }
  }
  if (row?.response_label || (row?.response_code !== null && row?.response_code !== undefined)) {
    return { answer: row.response_label || '', code: row.response_code, response_code: row.response_code }
  }
  return null
}



function targetOf(profile: OppeProfile): { value: number | null; operator: string | null; reason: string } {
  const text = String(profile.target_text ?? '').trim()
  if (/target\s+(dikaji|akan\s+dikaji|belum\s+ditetapkan)|target\s+absolut/i.test(text)) {
    return { value: null, operator: null, reason: 'Target master perlu diverifikasi sebelum kalkulasi otomatis.' }
  }
  const directValue = numberOrNull(profile.target_value)
  const operatorFromText = text.match(/^(<=|>=|≤|≥|=|<|>)/)?.[1] ?? null
  const operator = operatorFromText
    ? ({ '≤': '<=', '≥': '>=' } as Record<string, string>)[operatorFromText] ?? operatorFromText
    : (profile.target_operator || null)
  if (directValue !== null) return { value: directValue, operator, reason: '' }

  const match = text.match(/^(?:<=|>=|≤|≥|=|<|>)?\s*(-?\d+(?:[.,]\d+)?)\s*(%|menit|min|jam|hari|kali)?/i)
  if (match && match[1]) {
    const value = Number(match[1].replace(',', '.'))
    if (Number.isFinite(value) && match[2] !== undefined) {
      return { value, operator: operator || (text.startsWith('≤') ? '<=' : text.startsWith('≥') ? '>=' : null), reason: '' }
    }
  }
  return { value: null, operator: null, reason: 'Target numerik/arah target belum dapat ditentukan dari master indikator.' }
}

function targetSatisfied(value: number, target: number, op: string | null): boolean | null {
  if (op === '>=' || op === '≥') return value >= target - 1e-9
  if (op === '<=' || op === '≤') return value <= target + 1e-9
  if (op === '>') return value > target
  if (op === '<') return value < target
  if (op === '=') return Math.abs(value - target) < 1e-9
  return null
}

function emptyResult(
  profile: OppeProfile,
  rule: OppeRule,
  attributedRecords: number,
  reason: string,
  status: ClinicalIndicatorResult['status'] = 'insufficient_data',
): ClinicalIndicatorResult {
  return {
    profileId: profile.id,
    code: profile.code,
    title: profile.title || profile.code,
    unitName: profile.unit_name || '',
    unitOfMeasure: profile.unit_of_measure || '',
    grain: profile.measurement_grain || '',
    profession: rule.profession_label,
    attributionField: rule.responsibility_field,
    measurementMethod: rule.measurement_method,
    criticality: rule.criticality,
    observations: 0,
    attributedRecords,
    missingResponses: attributedRecords,
    numerator: null,
    denominator: null,
    rate: null,
    numericMean: null,
    targetText: String(profile.target_text ?? ''),
    targetValue: null,
    targetOperator: null,
    targetMet: null,
    status,
    reason,
    sourceRecordIds: [],
  }
}

export function evaluateClinicalIndicator(args: {
  profile: OppeProfile
  rule: OppeRule
  records: OppeQualityRecord[]
  responseRows: OppeResponseRow[] | OppeResponseIndex
  staffName: string
  staffId?: string | null
  profession: string
  year: number
  quarter: number
}): ClinicalIndicatorResult {
  const { profile, rule, records, responseRows, staffName, staffId, year, quarter } = args
  const target = targetOf(profile)
  if (rule.status !== 'active' || !rule.is_oppe_eligible) {
    return emptyResult(profile, rule, 0, 'Aturan OPPE belum diaktifkan oleh pengelola.')
  }
  if (!rule.profession_label.trim() || !rule.responsibility_field.trim()) {
    return emptyResult(profile, rule, 0, 'Profesi dan field penanggung jawab belum dikonfigurasi.')
  }
  if (!professionMatches(rule.profession_label, args.profession)) {
    return emptyResult(profile, rule, 0, 'Profesi staf tidak sesuai dengan aturan indikator.')
  }
  const matchingRecords = records.filter((record) => {
    if (
      record.status !== 'validated'
      || Number(record.room_id) !== Number(profile.room_id)
      || Number(record.profile_year) !== Number(year)
      || !isInPeriod(record, year, quarter)
    ) return false

    const attribution = (record.staff_attributions || []).find(
      (item) => norm(item.field_key) === norm(rule.responsibility_field),
    )
    // A canonical staff_id attribution takes precedence over text matching.
    // Legacy records without an attribution still use exact-name matching for backward compatibility.
    if (attribution) return !!staffId && String(attribution.staff_id) === String(staffId)
    return norm(responsibleName(record, rule.responsibility_field)) === norm(staffName)
  })
  const withResponse = matchingRecords
    .map((record) => ({ record, response: responseFor(record, profile, responseRows) }))
    .filter((item): item is { record: OppeQualityRecord; response: Record<string, any> } => !!item.response)
  const missingResponses = matchingRecords.length - withResponse.length

  if (rule.measurement_method === 'manual_review') {
    return {
      ...emptyResult(profile, rule, matchingRecords.length, 'Indikator tampil sebagai konteks telaah dan tidak masuk skor otomatis.', 'manual_review'),
      observations: withResponse.length,
      missingResponses,
      sourceRecordIds: withResponse.map((item) => item.record.id),
    }
  }

  if (withResponse.length < Math.max(1, Number(rule.minimum_observations) || 1)) {
    return {
      ...emptyResult(
        profile,
        rule,
        matchingRecords.length,
        `Data terverifikasi belum mencukupi: ${withResponse.length} observasi; minimum ${Math.max(1, Number(rule.minimum_observations) || 1)}.`,
      ),
      observations: withResponse.length,
      missingResponses,
      sourceRecordIds: withResponse.map((item) => item.record.id),
    }
  }

  if (rule.measurement_method === 'numeric_target') {
    const values = withResponse
      .map(({ response }) => numberOrNull(response.value ?? response.minutes))
      .filter((value): value is number => value !== null)
    if (values.length < Math.max(1, Number(rule.minimum_observations) || 1)) {
      return {
        ...emptyResult(profile, rule, matchingRecords.length, 'Nilai numerik aktual atau target yang cocok belum tersedia.'),
        observations: values.length,
        missingResponses: matchingRecords.length - values.length,
        sourceRecordIds: withResponse.map((item) => item.record.id),
      }
    }
    if (target.value === null || target.operator === null) {
      return {
        ...emptyResult(profile, rule, matchingRecords.length, target.reason || 'Target belum dapat dibaca.'),
        observations: values.length,
        missingResponses,
        sourceRecordIds: withResponse.map((item) => item.record.id),
      }
    }
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length
    const met = targetSatisfied(mean, target.value, target.operator)
    return {
      profileId: profile.id, code: profile.code, title: profile.title || profile.code,
      unitName: profile.unit_name || '', unitOfMeasure: profile.unit_of_measure || '', grain: profile.measurement_grain || '',
      profession: rule.profession_label, attributionField: rule.responsibility_field,
      measurementMethod: rule.measurement_method, criticality: rule.criticality,
      observations: values.length, attributedRecords: matchingRecords.length,
      missingResponses: matchingRecords.length - values.length, numerator: null, denominator: null,
      rate: null, numericMean: mean, targetText: String(profile.target_text ?? ''),
      targetValue: target.value, targetOperator: target.operator, targetMet: met,
      status: met === null ? 'insufficient_data' : met ? 'meets_target' : 'below_target',
      reason: met === null ? 'Arah perbandingan target belum ditentukan dengan valid.' : `Rerata ${mean.toLocaleString('id-ID', { maximumFractionDigits: 2 })} dibandingkan dengan target master.`,
      sourceRecordIds: withResponse.map((item) => item.record.id),
    }
  }

  let numerator = 0
  let denominator = 0
  let valid = 0
  let unclassifiable = 0
  const sourceRecordIds: string[] = []
  const options = optionsOf(profile)
  for (const item of withResponse) {
    const response = item.response
    let n: number | null = null
    let d: number | null = null
    const rawN = numberOrNull(response.numerator)
    const rawD = numberOrNull(response.denominator)
    if (rawN !== null && rawD !== null && rawD > 0 && rawN >= 0 && rawN <= rawD) {
      n = rawN
      d = rawD
    } else if (rule.measurement_method === 'option_response') {
      const answer = norm(response.answer ?? response.occurrence ?? response.response_label)
      const option = options.find((candidate) => norm(candidate.label) === answer)
      if (option && typeof option.numerator === 'boolean' && typeof option.denominator === 'boolean') {
        d = option.denominator ? 1 : 0
        n = option.denominator && option.numerator ? 1 : 0
      }
    }
    if (n === null || d === null) {
      unclassifiable++
      continue
    }
    if (d === 0) continue
    numerator += n
    denominator += d
    valid++
    sourceRecordIds.push(item.record.id)
  }

  if (denominator <= 0 || valid < Math.max(1, Number(rule.minimum_observations) || 1)) {
    const reason = rule.measurement_method === 'option_response'
      ? `Respons belum cukup atau opsi numerator/denominator belum dapat ditafsirkan dengan aman (${valid} valid; ${unclassifiable} tidak terklasifikasi).`
      : `Pembilang/penyebut belum mencukupi (${valid} observasi valid; minimum ${Math.max(1, Number(rule.minimum_observations) || 1)}).`
    return {
      ...emptyResult(profile, rule, matchingRecords.length, reason),
      observations: valid,
      missingResponses: missingResponses + unclassifiable,
      numerator,
      denominator: denominator || null,
      rate: denominator > 0 ? numerator / denominator * 100 : null,
      sourceRecordIds,
    }
  }
  if (target.value === null || target.operator === null) {
    return {
      ...emptyResult(profile, rule, matchingRecords.length, target.reason || 'Target belum dapat dibaca.'),
      observations: valid, missingResponses: missingResponses + unclassifiable,
      numerator, denominator, rate: numerator / denominator * 100, sourceRecordIds,
    }
  }

  const rate = numerator / denominator * 100
  const met = targetSatisfied(rate, target.value, target.operator)
  return {
    profileId: profile.id, code: profile.code, title: profile.title || profile.code,
    unitName: profile.unit_name || '', unitOfMeasure: profile.unit_of_measure || '', grain: profile.measurement_grain || '',
    profession: rule.profession_label, attributionField: rule.responsibility_field,
    measurementMethod: rule.measurement_method, criticality: rule.criticality,
    observations: valid, attributedRecords: matchingRecords.length,
    missingResponses: missingResponses + unclassifiable,
    numerator, denominator, rate, numericMean: null,
    targetText: String(profile.target_text ?? ''), targetValue: target.value,
    targetOperator: target.operator, targetMet: met,
    status: met === null ? 'insufficient_data' : met ? 'meets_target' : 'below_target',
    reason: met === null ? 'Arah perbandingan target belum ditentukan dengan valid.' : `Capaian dihitung sebagai Σ numerator / Σ denominator × 100%.`,
    sourceRecordIds,
  }
}

export function scoreManualItems(items: ManualAssessmentItem[], quarter: number): DomainScore {
  const applicable = items.filter((item) => !(item.id === 'meetings_annual' && quarter < 4))
  const assessedItems = applicable.filter((item) => item.status !== 'pending')
  const scoredItems = assessedItems.filter((item) => item.status === 'good' || item.status === 'needs_review')
  if (!applicable.length) {
    return { score: null, assessed: 0, applicable: 0, complete: false, label: 'Belum dinilai', reason: 'Tidak ada indikator yang berlaku untuk periode ini.' }
  }
  const complete = assessedItems.length === applicable.length && !assessedItems.some((item) => item.status === 'insufficient_data')
  const score = scoredItems.length
    ? scoredItems.filter((item) => item.status === 'good').length / scoredItems.length * 100
    : null
  return {
    score,
    assessed: assessedItems.length,
    applicable: applicable.length,
    complete,
    label: score === null ? 'Belum dinilai' : complete ? 'Dinilai lengkap' : 'Penilaian parsial',
    reason: complete ? 'Semua butir yang berlaku telah dinilai.' : `${assessedItems.length} dari ${applicable.length} butir yang berlaku telah dinilai.`,
  }
}

export function scoreClinicalItems(items: ClinicalIndicatorResult[]): DomainScore {
  const applicable = items.filter((item) => item.status !== 'not_applicable' && item.status !== 'manual_review')
  const scored = applicable.filter((item) => item.targetMet !== null)
  const score = scored.length ? scored.filter((item) => item.targetMet === true).length / scored.length * 100 : null
  const complete = applicable.length > 0 && scored.length === applicable.length
  return {
    score,
    assessed: scored.length,
    applicable: applicable.length,
    complete,
    label: score === null ? 'Belum dapat dihitung' : complete ? 'Dinilai lengkap' : 'Data parsial',
    reason: !applicable.length
      ? 'Belum ada indikator klinis individual yang aktif dan dapat dihitung.'
      : complete
        ? 'Seluruh indikator klinis yang terpetakan memiliki data memadai.'
        : `${scored.length} dari ${applicable.length} indikator klinis memiliki data yang memadai.`,
  }
}

export function scoreCategory(score: number | null): string {
  if (score === null || !Number.isFinite(score)) return 'Belum dapat dinilai'
  if (score >= 90) return 'Sangat Baik'
  if (score >= 70) return 'Baik'
  if (score >= 60) return 'Cukup'
  return 'Kurang'
}

export function buildOppeScore(args: {
  behavior: ManualAssessmentItem[]
  professionalism: ManualAssessmentItem[]
  clinical: ClinicalIndicatorResult[]
  quarter: number
}) {
  const behavior = scoreManualItems(args.behavior, args.quarter)
  const professionalism = scoreManualItems(args.professionalism, args.quarter)
  const clinical = scoreClinicalItems(args.clinical)
  const domains = [behavior, professionalism, clinical]
  const complete = domains.every((domain) => domain.score !== null && domain.complete)
  const overall = domains.every((domain) => domain.score !== null && domain.complete)
    ? domains.reduce((sum, domain) => sum + (domain.score ?? 0), 0) / domains.length
    : null
  const criticalIssues = args.clinical.filter((item) => item.criticality === 'critical' && item.targetMet === false)
  const needsReview = criticalIssues.length > 0 || args.clinical.some((item) => item.criticality === 'high' && item.targetMet === false)
  return {
    method: 'Rerata sederhana tiga ranah; butir dalam tiap ranah berbobot sama. Nilai ini adalah ringkasan OPPE internal dan bukan keputusan otomatis tentang kewenangan klinis.',
    behavior,
    professionalism,
    clinical,
    overall,
    category: scoreCategory(overall),
    complete,
    needsReview,
    criticalIssues: criticalIssues.map((item) => ({ profileId: item.profileId, code: item.code, title: item.title, reason: item.reason })),
    decision: overall === null
      ? 'insufficient_data'
      : needsReview
        ? 'requires_review'
        : complete
          ? 'ready_for_review'
          : 'provisional',
  }
}
