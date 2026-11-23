import { compareToTarget, usesContinuousAttainmentTarget } from './indicator-engine.ts'
import { isResultStatusIncluded, type IndicatorResult, type IndicatorProfileForResults, type ResultRecord } from './quality-results-engine.ts'

export type QualityProgram = 'INM' | 'IMP-RS' | 'IMP-Unit' | 'Lainnya'
export type CategoryAnalysisKind = 'inm' | 'audit' | 'oppe' | 'program' | 'hospital' | 'unit'

export type QualityCategoryDefinition = {
  id: string
  program: QualityProgram
  name: string
  kind: CategoryAnalysisKind
  description: string
  diagnosis?: string
}

/**
 * This is a classification catalogue, NOT an imported indicator profile set.
 * It follows column G of the 2026 reference workbook. Values and targets remain
 * owned by the published, versioned profiles in Supabase.
 */
export const QUALITY_CATEGORY_CATALOG: readonly QualityCategoryDefinition[] = [
  { id: 'inm', program: 'INM', name: 'Indikator Nasional Mutu', kind: 'inm', description: 'Numerator, denominator, capaian bulanan, target, dan kesiapan pelaporan nasional' },
  { id: 'imp-rs-perbaikan-sistem', program: 'IMP-RS', name: 'Perbaikan Sistem', kind: 'hospital', description: 'Perbaikan sistem dan efektivitas tindak lanjut tingkat rumah sakit' },
  { id: 'imp-rs-klinis-prioritas', program: 'IMP-RS', name: 'Pelayanan Klinis Prioritas', kind: 'hospital', description: 'Tren mutu pelayanan klinis prioritas dan variasi antarunit' },
  { id: 'imp-rs-skp', program: 'IMP-RS', name: 'Sasaran Keselamatan Pasien', kind: 'hospital', description: 'Kepatuhan sasaran keselamatan pasien dan indikator risiko pelayanan' },
  { id: 'imp-rs-manajemen-risiko', program: 'IMP-RS', name: 'Manajemen Risiko', kind: 'hospital', description: 'Indikator pengelolaan risiko dan ketepatan pelaporan' },
  { id: 'imp-rs-penelitian-pendidikan', program: 'IMP-RS', name: 'Penelitian Klinis dan Pendidikan Kedokteran', kind: 'hospital', description: 'Mutu penyelenggaraan penelitian dan pendidikan klinis' },
  { id: 'imp-rs-renstra', program: 'IMP-RS', name: 'Rencana Strategis Rumah Sakit', kind: 'hospital', description: 'Pencapaian indikator sasaran strategis' },
  { id: 'imp-unit-lokal', program: 'IMP-Unit', name: 'Lokal Unit Pelayanan', kind: 'unit', description: 'Indikator pelayanan unit dan variasi hasil antarruangan' },
  { id: 'imp-unit-oppe', program: 'IMP-Unit', name: 'Audit OPPE', kind: 'oppe', description: 'Telaah pengukuran yang relevan dengan evaluasi kinerja profesional' },
  { id: 'imp-unit-program-nasional', program: 'IMP-Unit', name: 'Program Nasional', kind: 'program', description: 'Indikator program nasional sesuai definisi masing-masing program' },
  { id: 'audit-sc', program: 'IMP-Unit', name: 'Audit Medis Sectio Caesarea Elektif', kind: 'audit', diagnosis: 'Sectio Caesarea Elektif', description: 'Audit kriteria tata laksana sectio caesarea elektif' },
  { id: 'audit-asfiksia', program: 'IMP-Unit', name: 'Audit Medis Asfiksia Neonatorum', kind: 'audit', diagnosis: 'Asfiksia Neonatorum', description: 'Audit kriteria tata laksana dan luaran asfiksia neonatorum' },
  { id: 'audit-tb', program: 'IMP-Unit', name: 'Audit Medis Tuberkulosis', kind: 'audit', diagnosis: 'Tuberkulosis', description: 'Audit pemeriksaan, terapi, pencatatan, dan luaran TB' },
  { id: 'audit-sirosis', program: 'IMP-Unit', name: 'Audit Medis Sirosis', kind: 'audit', diagnosis: 'Sirosis', description: 'Audit pemeriksaan, terapi, dan luaran sirosis' },
  { id: 'audit-pgta', program: 'IMP-Unit', name: 'Audit Medis Penyakit Ginjal Tahap Akhir', kind: 'audit', diagnosis: 'Penyakit Ginjal Tahap Akhir', description: 'Audit diagnostik, tata laksana, dan luaran PGTA' },
  { id: 'audit-stemi', program: 'IMP-Unit', name: 'Audit Medis STEMI', kind: 'audit', diagnosis: 'STEMI', description: 'Audit tata laksana STEMI per episode dan per kriteria klinis' },
  { id: 'audit-stroke', program: 'IMP-Unit', name: 'Audit Medis Stroke', kind: 'audit', diagnosis: 'Stroke', description: 'Audit diagnostik, terapi, dan luaran stroke' },
  { id: 'audit-dm', program: 'IMP-Unit', name: 'Audit Medis Diabetes Mellitus', kind: 'audit', diagnosis: 'Diabetes Mellitus', description: 'Audit perawatan dan luaran diabetes mellitus' },
  { id: 'audit-mammae', program: 'IMP-Unit', name: 'Audit Medis Carcinoma Mammae', kind: 'audit', diagnosis: 'Carcinoma Mammae', description: 'Audit diagnosis, terapi, dan tindak lanjut carcinoma mammae' },
] as const

const clean = (value: unknown): string => String(value ?? '').normalize('NFKC')
  .toLocaleLowerCase('id-ID').replace(/[()]/g, ' ').replace(/[–—]/g, '-')
  .replace(/[^a-z0-9\s-]/g, ' ').replace(/\s+/g, ' ').trim()

function profileCategoryLabel(profile: IndicatorProfileForResults): string {
  const primary = String(profile.indicator_type ?? '').trim()
  if (primary) return primary
  const secondary = String((profile as Record<string, unknown>).category ?? '').trim()
  return /^(?:\(?inm\)?|\(?imp-rs\)?|\(?imp-unit\)?)/i.test(secondary) ? secondary : ''
}

export function resolveQualityCategory(profile: IndicatorProfileForResults): QualityCategoryDefinition {
  const value = clean(profileCategoryLabel(profile))
  const program: QualityProgram = value.startsWith('inm') || value.includes('indikator nasional mutu')
    ? 'INM'
    : value.startsWith('imp-rs') ? 'IMP-RS'
      : value.startsWith('imp-unit') ? 'IMP-Unit' : 'Lainnya'
  const suffix = value.replace(/^(inm|imp-rs|imp-unit)\s*/, '').trim()
  const match = QUALITY_CATEGORY_CATALOG.find(definition =>
    definition.program === program &&
    (clean(definition.name) === suffix ||
      (definition.program === 'INM' && (suffix === 'indikator nasional mutu' || suffix === '')))
  )
  if (match) return match
  // Unknown categories are preserved, never folded into a clinically unrelated family.
  const display = profileCategoryLabel(profile) || 'Kategori belum ditetapkan'
  return {
    id: 'custom-' + clean(display).replace(/[^a-z0-9]+/g, '-'),
    program,
    name: display,
    kind: program === 'INM' ? 'inm' : program === 'IMP-RS' ? 'hospital' : 'unit',
    description: 'Kategori baru: periksa metadata dan definisi pengukuran sebelum digunakan untuk pelaporan resmi',
  }
}

export type CategoryCodes = { code1: number; code2: number; code3: number; uncoded: number; pending: number }
export type IndicatorCodeDistribution = CategoryCodes & { profileKey: string; recorded: number }
export type CategoryMonth = { month: number; assessed: number; met: number; observations: number }
export type QualityCategoryAnalytics = {
  definition: QualityCategoryDefinition
  results: IndicatorResult[]
  configured: number
  assessed: number
  met: number
  withoutData: number
  withoutTarget: number
  observations: number
  validatedObservations: number
  codes: CategoryCodes
  byIndicator: Record<string, IndicatorCodeDistribution>
  // Number of distinct subjects/episodes with at least one categorised, validated response.
  // This is never used as the denominator of an individual clinical audit criterion.
  subjects: number
  trend: CategoryMonth[]
}

export const indicatorProfileKey = (profile: IndicatorProfileForResults): string =>
  String(profile.room_id ?? '') + '|' + String(profile.id ?? profile.code ?? '')

const emptyCodes = (): CategoryCodes => ({ code1: 0, code2: 0, code3: 0, uncoded: 0, pending: 0 })
const addCode = (target: CategoryCodes, code: keyof CategoryCodes) => { target[code] += 1 }
const validDate = (row: ResultRecord): string => {
  const core = row.core_data ?? {}
  const fields = core.form_fields ?? core.form_data ?? {}
  const options = [row.record_date, core.record_date, core.admission_at, fields['Tanggal pengamatan'], fields['Tanggal Masuk']]
  const found = options.find(value => /^\d{4}-\d{2}-\d{2}/.test(String(value ?? '')))
  return found ? String(found).slice(0, 10) : ''
}
const validYear = (row: ResultRecord, year: number): boolean =>
  Number(validDate(row).slice(0, 4)) === year

function responseCode(
  profile: IndicatorProfileForResults,
  response: Record<string, unknown>,
): keyof CategoryCodes | null {
  if (response.source_option === true || response.review_required === true ||
    ['pending', 'reopened'].includes(String(response.review_status ?? '').toLowerCase()) ||
    ['source_code_conflict', 'ambiguous_master', 'not_in_master'].includes(String(response.mapping_status ?? ''))) return 'pending'
  const answer = String(response.answer ?? '').normalize('NFKC').trim()
  if (!answer && response.code == null) return null
  const code = response.code == null || response.code === '' ? null : Number(response.code)
  const options = Array.isArray(profile.options_json) ? profile.options_json : []
  const matches = options.filter(option =>
    answer ? String(option.label ?? '').normalize('NFKC').trim() === answer :
      response.code_only === true && option.code != null && Number(option.code) === code)
  if (matches.length === 0) return 'pending'
  const option = matches[0]
  if (matches.length > 1 && (answer || !matches.every(item => item.code === option.code &&
    item.eligible === option.eligible && item.denominator_excluded === option.denominator_excluded))) return 'pending'
  if (option.eligible === false || option.denominator_excluded === true) return 'uncoded'
  const expected = option.code == null || option.code === '' ? null : Number(option.code)
  if (expected !== code) return 'pending'
  if (code === 1) return 'code1'
  if (code === 2) return 'code2'
  if (code === 3) return 'code3'
  return expected === null ? 'uncoded' : 'pending'
}

export function buildQualityCategoryAnalytics(
  results: IndicatorResult[],
  records: ResultRecord[],
  year: number,
  includeReady = false,
): QualityCategoryAnalytics[] {
  const categories = new Map<string, QualityCategoryAnalytics>()
  const subjects = new Map<string, Set<string>>()
  const profilesByRoom = new Map<number, IndicatorResult[]>()
  for (const result of results) {
    const definition = resolveQualityCategory(result.profile)
    let item = categories.get(definition.id)
    if (!item) {
      item = {
        definition, results: [], configured: 0, assessed: 0, met: 0,
        withoutData: 0, withoutTarget: 0, observations: 0, validatedObservations: 0,
        codes: emptyCodes(), byIndicator: {}, subjects: 0,
        trend: Array.from({ length: 12 }, (_, index) => ({ month: index + 1, assessed: 0, met: 0, observations: 0 })),
      }
      categories.set(definition.id, item)
      subjects.set(definition.id, new Set())
    }
    item.results.push(result)
    item.configured += 1
    item.observations += result.observations
    item.validatedObservations += result.validatedRecords
    if (!(result.validatedRecords + (includeReady ? result.readyRecords : 0))) item.withoutData += 1
    else if (result.targetMet == null) item.withoutTarget += 1
    else {
      item.assessed += 1
      if (result.targetMet) item.met += 1
    }
    item.byIndicator[indicatorProfileKey(result.profile)] = { ...emptyCodes(), profileKey: indicatorProfileKey(result.profile), recorded: 0 }
    for (const month of result.monthly) {
      const trend = item.trend[month.month - 1]
      const count = month.validatedRecords + (includeReady ? month.readyRecords : 0)
      trend.observations += count
      if (!count) continue
      const actual = result.continuous && !usesContinuousAttainmentTarget(result.profile) ? month.mean : month.rate
      const met = actual == null ? null : compareToTarget(result.profile, actual, result.continuous ? undefined : '=')
      if (met != null) {
        trend.assessed += 1
        if (met) trend.met += 1
      }
    }
    const room = Number(result.profile.room_id)
    if (!profilesByRoom.has(room)) profilesByRoom.set(room, [])
    profilesByRoom.get(room)!.push(result)
  }

  for (const record of records) {
    if (!isResultStatusIncluded(record.status, includeReady) || !validYear(record, year) || record.core_data?.source_import?.exclude_from_profile_year_metrics === true) continue
    const values = record.core_data?.indicator_values
    if (!values || typeof values !== 'object') continue
    for (const result of profilesByRoom.get(Number(record.room_id)) ?? []) {
      const response = values[String(result.profile.code ?? '')] ?? values[String(result.profile.id ?? '')]
      if (!response || typeof response !== 'object') continue
      const item = categories.get(resolveQualityCategory(result.profile).id)
      if (!item) continue
      const code = responseCode(result.profile, response)
      if (!code) continue
      addCode(item.codes, code)
      const breakdown = item.byIndicator[indicatorProfileKey(result.profile)]
      addCode(breakdown, code)
      breakdown.recorded += 1
      const identity = String((record as ResultRecord & { subject_key?: string | null }).subject_key ?? '').trim()
      // Preserve patient count separately from the number of assessed criteria.
      const recordKey = identity ? 'subject:' + identity : 'record:' + String(record.id ?? '')
      subjects.get(item.definition.id)?.add(recordKey)
    }
  }

  for (const category of categories.values()) category.subjects = subjects.get(category.definition.id)?.size ?? 0
  const order = new Map(QUALITY_CATEGORY_CATALOG.map((category, index) => [category.id, index]))
  return [...categories.values()].sort((a, b) =>
    (order.get(a.definition.id) ?? 1000) - (order.get(b.definition.id) ?? 1000) ||
    a.definition.name.localeCompare(b.definition.name, 'id'))
}

export function buildCategoryNaraBrief(
  category: QualityCategoryAnalytics,
  year: number,
  scopeLabel: string,
): string {
  const header = [
    'Analisis mutu AUREKA (hanya data agregat; tanpa identitas pasien).',
    'Tahun: ' + year + '; cakupan: ' + scopeLabel,
    'Kelompok: ' + category.definition.program + '; kategori: ' + category.definition.name,
    'Indikator aktif: ' + category.configured + '; dinilai: ' + category.assessed +
      '; memenuhi target: ' + category.met + '; belum punya data: ' + category.withoutData +
      '; belum dapat dinilai karena target: ' + category.withoutTarget + '.',
    'Distribusi respons per kriteria: Code 1=' +
      category.codes.code1 + ', Code 2=' + category.codes.code2 + ', Code 3=' +
      category.codes.code3 + ', tanpa Code=' + category.codes.uncoded +
      ', perlu rekonsiliasi=' + category.codes.pending + '.',
  ]
  const measures = [...category.results]
    .sort((a, b) => Number(a.targetMet === false ? 0 : a.targetMet === null ? 1 : 2) -
      Number(b.targetMet === false ? 0 : b.targetMet === null ? 1 : 2))
    .slice(0, 30)
    .map(result => [
      String(result.profile.code ?? '') + ' ' + String(result.profile.title ?? ''),
      'N=' + result.annualNumerator + '/D=' + result.annualDenominator,
      'capaian=' + (result.annualRate == null ? '-' : result.annualRate + '%'),
      'target=' + String(result.profile.target_text ?? '-'),
      'status=' + (result.targetMet == null ? 'belum dapat dinilai' : result.targetMet ? 'memenuhi' : 'belum memenuhi'),
    ].join('; '))
  return [...header, ...measures,
    'Jelaskan pola capaian, tren, variasi, kelemahan mutu data, dugaan faktor penyebab (sebagai hipotesis, bukan fakta), prioritas perbaikan, dan rekomendasi PMKP.',
    'Pisahkan angka terukur dari interpretasi AI; jangan mengarang data/target atau menyatakan pelaporan Kemenkes dan publikasi sudah disahkan.',
  ].join('\n')
}
