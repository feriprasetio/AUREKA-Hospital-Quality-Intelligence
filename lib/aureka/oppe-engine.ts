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
}

export type OppeResponseRow = {
  record_id: string
  indicator_id: string
  raw_value?: Record<string, any> | null
  response_label?: string | null
  response_code?: number | null
}

export type ClinicalIndicatorResult = {
  profileId: string
  code: string
  title: string
  unitName: string
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

export type ManualItemStatus = 'pending' | 'good' | 'needs_review' | 'na'
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

const asObject = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {}

const numberOrNull = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null
  const result = Number(value)
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

export function recordDate(record: OppeQualityRecord): string {
  const core = asObject(record.core_data)
  const subject = asObject(record.subject_json)
  const fields = asObject(core.form_fields ?? core.form_data ?? subject.form_fields ?? subject.form_data)
  const raw = record.record_date
    ?? core.record_date
    ?? fields['Tanggal Pengamatan']
    ?? fields['Tanggal Audit']
    ?? fields['Tanggal Dilayani']
    ?? fields['Tanggal Kunjungan']
    ?? fields['Tanggal Masuk']
    ?? fields['Tanggal Lapor']
    ?? fields['Tanggal']
    ?? core.admission_at
    ?? core.admit
    ?? subject.record_date
    ?? ''
  return String(raw).slice(0, 10)
}

export function isInPeriod(record: OppeQualityRecord, year: number, quarter: number): boolean {
  const date = recordDate(record)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false
  const y = Number(date.slice(0, 4))
  const m = Number(date.slice(5, 7))
  return y === year && Math.ceil(m / 3) === quarter
}

export function recordCore(record: OppeQualityRecord): Record<string, any> {
  const core = asObject(record.core_data)
  const subject = asObject(record.subject_json)
  return Object.keys(core).length ? core : subject
}

export function recordFields(record: OppeQualityRecord): Record<string, any> {
  const core = recordCore(record)
  return asObject(core.form_fields ?? core.form_data)
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
  responseRows: OppeResponseRow[],
): Record<string, any> | null {
  const core = recordCore(record)
  const values = asObject(core.indicator_values)
  const byCode = asObject(values[profile.code])
  if (Object.keys(byCode).length) return byCode

  const row = responseRows.find((item) => item.record_id === record.id && item.indicator_id === profile.id)
  if (row?.raw_value && typeof row.raw_value === 'object') return row.raw_value
  if (row?.response_label) return { answer: row.response_label, code: row.response_code }
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
  responseRows: OppeResponseRow[]
  staffName: string
  year: number
  quarter: number
}): ClinicalIndicatorResult {
  const { profile, rule, records, responseRows, staffName, year, quarter } = args
  const target = targetOf(profile)
  if (rule.status !== 'active' || !rule.is_oppe_eligible) {
    return emptyResult(profile, rule, 0, 'Aturan OPPE belum diaktifkan oleh pengelola.')
  }
  if (!rule.profession_label.trim() || !rule.responsibility_field.trim()) {
    return emptyResult(profile, rule, 0, 'Profesi dan field penanggung jawab belum dikonfigurasi.')
  }
  if (norm(rule.profession_label) !== norm(args.rule.profession_label)) {
    return emptyResult(profile, rule, 0, 'Profil profesi tidak sesuai dengan aturan indikator.')
  }
  const matchingRecords = records.filter((record) =>
    record.status === 'validated'
    && Number(record.room_id) === Number(profile.room_id)
    && Number(record.profile_year) === Number(year)
    && isInPeriod(record, year, quarter)
    && norm(responsibleName(record, rule.responsibility_field)) === norm(staffName)
  )
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
      unitName: profile.unit_name || '', grain: profile.measurement_grain || '',
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
    unitName: profile.unit_name || '', grain: profile.measurement_grain || '',
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
  const complete = assessedItems.length === applicable.length
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
  const overall = domains.every((domain) => domain.score !== null)
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
