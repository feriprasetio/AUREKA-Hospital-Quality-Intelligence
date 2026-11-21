import type { Cell, Workbook, Worksheet } from 'exceljs-hardened'
import { normalizeIgdDateTime } from './igd-logbook.ts'
import { resolveMeasurementKind, usesCategoricalResponseCapture } from './indicator-engine.ts'

export type EpisodeOption = {
  label: string
  code: number
  review_required?: boolean
  numerator?: boolean | null
  denominator?: boolean | null
  eligible?: boolean
  denominator_excluded?: boolean
}

export type EpisodeProfile = {
  id?: string
  version?: number
  updated_at?: string
  status?: string
  profile_year?: number
  room_id: number
  unit_name?: string
  code: string
  title: string
  indicator_type?: string | null
  category?: string | null
  unit_of_measure?: string | null
  target_text?: string | null
  target_operator?: string | null
  target_value?: string | number | null
  numerator_definition?: string | null
  denominator_definition?: string | null
  measurement_grain?: string | null
  schema_json?: Record<string, unknown> | null
  options_json?: EpisodeOption[] | null
}
type Direction = 'positive' | 'negative'
export type WorkbookIssue = { location: string; message: string }
export type EpisodeColumn = { index: number; letter: string; occurrence: number; name: string }
export type EpisodeSheet = { sheet: Worksheet; header: number; columns: EpisodeColumn[] }
export type EpisodeWorkbook = {
  workbook: Workbook
  logbook: EpisodeSheet
  profileSheet: string | null
  hasLogbook: boolean
  entries: WorkbookProfile[]
}

export type WorkbookProfile = {
  row: number
  code: string
  title: string
  metadata: Partial<EpisodeProfile>
  direction: Direction | ''
  source: string
  sourceColumns: number[]
  options: EpisodeOption[]
}

export type ProfileMapping = {
  key: string
  entry?: WorkbookProfile
  master?: EpisodeProfile
  code: string
  title: string
  column: number
  direction: Direction | ''
}

type CoreField = 'date' | 'mrn' | 'episode' | 'name' | 'discharge' | 'diagnosis' | 'dpjp'
export type EpisodeFields = Record<CoreField, number>
export type EpisodeStageRow = {
  source_key: string
  source_sheet: string
  source_row: number
  row_payload: {
    record_payload: {
      room_id: number
      profile_year: number
      measurement_grain: 'patient_episode'
      record_date: string
      subject_key: string
      core_data: Record<string, unknown>
      subject_json: Record<string, unknown>
      status: 'ready'
      review_required: boolean
    }
    responses: EpisodeResponse[]
    attributions: []
  }
}
type EpisodeResponse = {
  indicator_code: string
  response_label: string | null
  response_code: number
  review_status: 'pending' | 'not_required'
  raw_value: { answer?: string; code: number; code_only?: true; source_value: string }
}

export const EPISODE_WORKBOOK_IMPORTER = 'patient-episode-workbook'
const EPISODE_ROOMS_WITHOUT_PROFILE = new Set([4, 6, 14, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 29, 31, 32, 33, 34, 35, 36, 37])

export function supportsEpisodeWorkbook(roomId: number | null, layoutGrain?: string, profiles: Array<{ room_id?: number; measurement_grain?: string | null }> = []) {
  if (roomId == null) return false
  if (layoutGrain) return layoutGrain === 'patient_episode'
  const scoped = profiles.filter(profile => profile.room_id === roomId)
  return scoped.length > 0
    ? scoped.some(profile => profile.measurement_grain === 'patient_episode')
    : EPISODE_ROOMS_WITHOUT_PROFILE.has(roomId)
}

const clean = (value: unknown) => String(value ?? '').normalize('NFKC').replace(/\s+/g, ' ').trim()
const normalize = (value: unknown) => clean(value).toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
const normalizeCode = (value: unknown) => clean(value).toUpperCase().replace(/\s/g, '')
const optionKey = (value: unknown) => clean(value).toLocaleLowerCase('id-ID')
const markedCode = /\s*\(\s*(?:kode|code)\s*[:=]?\s*(\d+)\s*\)\s*$/i

const PROFILE_ALIASES = {
  code: ['Kode indikator', 'Kode', 'Indicator code', 'Code'],
  title: ['Judul indikator', 'Nama indikator', 'Indikator mutu', 'Indikator', 'Judul', 'Indicator name', 'Title'],
  source: ['Kolom Logbook', 'Kolom sumber', 'Sumber kolom', 'Header Logbook', 'Kolom di Logbook', 'Header sumber', 'Kolom Excel', 'Logbook column', 'Source column'],
  direction: ['Arah indikator', 'Arah', 'Polaritas', 'Sifat indikator', 'Indicator direction'],
  kind: ['Tipe pengukuran', 'Jenis pengukuran', 'Metode pengukuran', 'Measurement type'],
  grain: ['Satuan observasi', 'Grain pengukuran', 'Measurement grain', 'Unit analisis', 'Metode pencatatan'],
  category: ['Kategori', 'Kategori indikator', 'Category'],
  kindLabel: ['Jenis indikator', 'Program indikator', 'Program', 'Indicator type'],
  measure: ['Satuan', 'Satuan pengukuran', 'Unit of measure'],
  target: ['Target', 'Target indikator', 'Standar', 'Standar capaian', 'Standar indikator', 'Target pencapaian'],
  targetOperator: ['Operator target', 'Target operator'],
  targetValue: ['Nilai target', 'Target value'],
  numerator: ['Pembilang', 'Definisi pembilang', 'Numerator', 'Definisi numerator'],
  denominator: ['Penyebut', 'Definisi penyebut', 'Denominator', 'Definisi denominator'],
  options: ['Opsi JSON', 'Options JSON', 'Pilihan jawaban', 'Opsi jawaban', 'Kode pilihan', 'Klasifikasi jawaban'],
  schema: ['Schema JSON', 'Konfigurasi teknis'],
  option1: ['Kode 1', 'Code 1', 'Opsi 1', 'Label kode 1'],
  option2: ['Kode 2', 'Code 2', 'Opsi 2', 'Label kode 2'],
  option3: ['Kode 3', 'Code 3', 'Opsi 3', 'Label kode 3'],
} as const

const CORE_ALIASES: Record<CoreField, string[]> = {
  date: ['Tanggal pencatatan', 'Tanggal Masuk', 'Waktu Masuk', 'Tanggal masuk pasien', 'Tanggal Kunjungan', 'Tanggal Berkunjung', 'Tanggal Visite', 'Tanggal pengamatan', 'Tanggal audit', 'Tanggal masuk IGD', 'Tanggal pelayanan', 'Tanggal tindakan', 'Tanggal operasi', 'Tanggal', 'Record date', 'Date'],
  mrn: ['No. Rekam Medis', 'Nomor Rekam Medis', 'No. RM', 'Nomor RM', 'No. Reg. Medis', 'No. MR', 'Medical record no', 'MRN'],
  episode: ['ID Episode', 'Kode Episode', 'No. Episode', 'Nomor Kunjungan', 'No. Kunjungan', 'No. Registrasi', 'Nomor Registrasi', 'Encounter ID'],
  name: ['Nama Pasien', 'Patient name', 'Nama'],
  discharge: ['Tanggal Keluar', 'Tanggal Pulang', 'Waktu Keluar', 'Waktu Pulang', 'Discharge date'],
  diagnosis: ['Diagnosa Tegak', 'Diagnosa IGD', 'Diagnosa Operasi', 'Diagnosa Infeksi', 'Diagnosa Pasien', 'Diagnosa', 'Diagnosis', 'Diagnosis Medis'],
  dpjp: ['DPJP', 'Dokter Penanggung Jawab', 'Nama Dokter', 'Dokter'],
}

function cellValue(cell: Cell): unknown {
  const value = cell.value
  if (value == null || typeof value !== 'object' || value instanceof Date) return value
  if ('formula' in value || 'sharedFormula' in value) return value.result
  if ('richText' in value) return value.richText.map(part => part.text).join('')
  if ('text' in value) return value.text
  return value
}

function identityCell(cell: Cell): string {
  const value = cellValue(cell)
  if (typeof value !== 'number') return clean(value)
  if (/^0+$/.test(cell.numFmt ?? '')) return String(value).padStart(cell.numFmt.length, '0')
  const decimals = /^0\.(0+)$/.exec(cell.numFmt ?? '')?.[1].length
  return decimals ? value.toFixed(decimals) : String(value)
}

function headerColumns(sheet: Worksheet, header: number): EpisodeColumn[] {
  const seen = new Map<string, number>()
  const result: EpisodeColumn[] = []
  sheet.getRow(header).eachCell((cell, index) => {
    const name = clean(cellValue(cell))
    if (!name || /^\[object /.test(name) || cell.isMerged && cell.master.address !== cell.address) return
    const key = normalize(name)
    const occurrence = (seen.get(key) ?? 0) + 1
    seen.set(key, occurrence)
    result.push({ index, letter: cell.address.replace(/\d+$/, ''), name, occurrence })
  })
  return result
}

function matchColumn(columns: EpisodeColumn[], aliases: readonly unknown[], requireUnique = true) {
  for (const alias of aliases) {
    const key = normalize(alias)
    if (!key) continue
    const matches = columns.filter(column => normalize(column.name) === key)
    if (matches.length > 1 && requireUnique) return 0
    if (matches.length) return matches[0].index
  }
  return 0
}

export function detectEpisodeFields(columns: EpisodeColumn[], roomDateField?: string): EpisodeFields {
  return Object.fromEntries(Object.entries(CORE_ALIASES).map(([key, names]) => [
    key, matchColumn(columns, key === 'date' && roomDateField ? [roomDateField, ...names] : names),
  ])) as EpisodeFields
}

function detectLogbook(sheet: Worksheet, roomDateField?: string): EpisodeSheet {
  let best: EpisodeSheet = { sheet, header: 1, columns: [] }
  let bestScore = -1
  for (let row = 1; row <= Math.min(sheet.rowCount, 30); row++) {
    const columns = headerColumns(sheet, row)
    const fields = detectEpisodeFields(columns, roomDateField)
    const score = (fields.date ? 12 : 0) + (fields.mrn || fields.episode ? 12 : 0) +
      (fields.name ? 5 : 0) + (fields.discharge ? 3 : 0) + (fields.diagnosis ? 3 : 0) +
      Math.min(columns.filter(col => /\p{L}/u.test(col.name)).length, 20) / 20
    if (score > bestScore) { best = { sheet, header: row, columns }; bestScore = score }
  }
  return best
}

export function overrideEpisodeLogbookHeader(parsed: EpisodeWorkbook, header: number): EpisodeWorkbook {
  return { ...parsed, logbook: { ...parsed.logbook, header, columns: headerColumns(parsed.logbook.sheet, header) } }
}

function directionValue(value: unknown): Direction | '' {
  const label = normalize(value)
  if (/^(positif|positive|lebih tinggi lebih baik|kepatuhan)$/.test(label)) return 'positive'
  if (/^(negatif|negative|lebih rendah lebih baik|kejadian)$/.test(label)) return 'negative'
  return ''
}

function normalizeOptions(value: unknown): EpisodeOption[] {
  if (!Array.isArray(value)) return []
  return value.flatMap(item => {
    if (typeof item === 'string') {
      const parts = item.match(markedCode)
      const prefix = item.match(/^\s*([1-3])\s*[=:.–-]\s*(.+)$/)
      const code = Number(parts?.[1] ?? prefix?.[1])
      const label = clean(parts ? item.slice(0, parts.index) : prefix?.[2])
      return label && [1, 2, 3].includes(code) ? [{ label, code }] : []
    }
    if (!item || typeof item !== 'object') return []
    const label = clean(item.label)
    const code = Number(item.code)
    return label && [1, 2, 3].includes(code) ? [{ ...item, code, label }] : []
  })
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  const text = clean(value).replace(',', '.')
  return text && /^-?\d+(\.\d+)?$/.test(text) ? Number(text) : null
}

function cellDisplay(cell?: Cell): string {
  if (!cell) return ''
  const value = cellValue(cell)
  if (typeof value === 'number' && /%/.test(cell.numFmt ?? '')) return (Math.round(value * 1000000) / 10000) + '%'
  return clean(value)
}

function referencedLogbookColumns(cells: Array<Cell | undefined>, logbook: EpisodeSheet): number[] {
  const indices = new Set<number>()
  const name = logbook.sheet.name.toLowerCase()
  // Only column references in workbook formulas are read here. Excel's instructions are never executed.
  const ref = /(?:'((?:[^']|'')+)'|([\p{L}\p{N}_]+))!\$?([A-Z]{1,3})(?:\$?\d+|(?=\s*:|\s*[,;)]|$))/giu
  for (const cell of cells) {
    for (const match of (cell?.formula ?? '').matchAll(ref)) {
      if ((match[1]?.replace(/''/g, "'") ?? match[2]).toLowerCase() !== name) continue
      const column = logbook.columns.find(item => item.letter === match[3].toUpperCase())
      if (column) indices.add(column.index)
    }
  }
  return [...indices]
}

function declaredSourceIndex(source: string, columns: EpisodeColumn[]) {
  if (!source) return 0
  const byHeader = matchColumn(columns, [source])
  if (byHeader) return byHeader
  const letter = /^(?:kolom\s+|[^!]+!)?\$?([A-Z]{1,3})(?:\$?\d+)?$/i.exec(source)?.[1]
  return columns.find(column => column.letter === letter?.toUpperCase())?.index ?? 0
}

function readOptionsSheet(workbook: Workbook) {
  const sheet = workbook.worksheets.find(item => ['opsi', 'opsi indikator', 'pilihan indikator'].includes(normalize(item.name)))
  const groups = new Map<string, EpisodeOption[]>()
  if (!sheet) return groups
  for (let header = 1; header <= Math.min(sheet.rowCount, 20); header++) {
    const columns = headerColumns(sheet, header)
    const id = matchColumn(columns, PROFILE_ALIASES.code)
    const label = matchColumn(columns, ['Label opsi', 'Label', 'Opsi', 'Pilihan', 'Jawaban'])
    const code = matchColumn(columns, ['Kode opsi', 'Kode jawaban', 'Response code', 'Option code'])
    const review = matchColumn(columns, ['Perlu review', 'Perlu telaah', 'Review required'])
    if (!(id && label && code) || id === code) continue
    for (let row = header + 1; row <= sheet.rowCount; row++) {
      const source = sheet.getRow(row)
      const indicator = normalizeCode(identityCell(source.getCell(id)))
      const options = normalizeOptions([{
        code: cellValue(source.getCell(code)), label: cellValue(source.getCell(label)),
        review_required: review ? /^(1|true|ya)$/i.test(cellDisplay(source.getCell(review))) : undefined,
      }])
      if (indicator && options.length) groups.set(indicator, [...(groups.get(indicator) ?? []), ...options])
    }
    break
  }
  return groups
}

function readProfile(get: (key: keyof typeof PROFILE_ALIASES) => Cell | undefined, position: number, logbook: EpisodeSheet, optionGroups: Map<string, EpisodeOption[]>): WorkbookProfile | null {
  const codeCell = get('code')
  const code = codeCell ? identityCell(codeCell) : ''
  const title = cellDisplay(get('title'))
  if (!title && !code) return null
  const grain = normalize(cellDisplay(get('grain')))
  if (grain && !['patient episode', 'episode pasien', 'per episode pasien', 'per pasien', 'pasien', 'episode', 'patient'].includes(grain)) return null
  const optionsText = cellDisplay(get('options'))
  let options = optionGroups.get(normalizeCode(code)) ?? []
  if (optionsText.startsWith('[')) {
    try { options = normalizeOptions(JSON.parse(optionsText)) } catch { options = [] }
  } else if (optionsText) {
    options = normalizeOptions(optionsText.split(/\s*[;|\n]\s*|,(?=\s*[1-3]\s*[=:.–-])/))
  }
  const inline = [1, 2, 3].flatMap((code, i) => {
    const label = cellDisplay(get((['option1', 'option2', 'option3'] as const)[i]))
    return label ? [{ label, code }] : []
  })
  if (inline.length) options = inline
  const schemaCell = cellDisplay(get('schema'))
  let schema: Record<string, unknown> = {}
  if (schemaCell.startsWith('{')) {
    try { schema = JSON.parse(schemaCell) as Record<string, unknown> } catch { /* Unknown fields are not applied. */ }
  }
  const metadata: Partial<EpisodeProfile> = {}
  const textFields = {
    category: 'category', indicator_type: 'kindLabel', unit_of_measure: 'measure', target_text: 'target',
    target_operator: 'targetOperator', numerator_definition: 'numerator', denominator_definition: 'denominator',
  } as const
  for (const [field, key] of Object.entries(textFields) as [keyof typeof textFields, keyof typeof PROFILE_ALIASES][]) {
    const text = cellDisplay(get(key))
    if (text) metadata[field] = text
  }
  const targetValue = cellDisplay(get('targetValue')).replace(/%$/, '')
  const parseTarget = /^(<=|>=|≤|≥|<|>|=)?\s*(-?\d+(?:[.,]\d+)?)\s*%?$/.exec(metadata.target_text ?? '')
  if (targetValue || parseTarget) metadata.target_value = readNumber(targetValue || parseTarget?.[2])
  if (parseTarget?.[1] && !metadata.target_operator) metadata.target_operator = parseTarget[1].replace('≤', '<=').replace('≥', '>=')
  const kind = normalize(cellDisplay(get('kind')))
  const declaredKinds: Record<string, string> = {
    rasio: 'ratio', persentase: 'ratio', proporsi: 'ratio', ratio: 'ratio', kepatuhan: 'compliance',
    compliance: 'compliance', kejadian: 'occurrence', occurrence: 'occurrence', minutes: 'minutes', durasi: 'minutes',
    'waktu kunjungan': 'visit_window', 'door to decision': 'door_to_decision', numeric: 'numeric',
  }
  if (declaredKinds[kind]) schema.measurement_type = declaredKinds[kind]
  metadata.schema_json = schema
  return {
    row: position, code, title, metadata, direction: directionValue(cellDisplay(get('direction')) || schema.indicator_direction),
    source: cellDisplay(get('source')), sourceColumns: referencedLogbookColumns([get('source'), get('numerator'), get('denominator'), get('target')], logbook), options,
  }
}

function profileEntries(sheet: Worksheet, logbook: EpisodeSheet, groups: Map<string, EpisodeOption[]>): WorkbookProfile[] {
  const entries: WorkbookProfile[] = []
  const aliases = Object.entries(PROFILE_ALIASES) as [keyof typeof PROFILE_ALIASES, readonly string[]][]
  let bestHeader = 0
  let best: Partial<Record<keyof typeof PROFILE_ALIASES, number>> = {}
  for (let row = 1; row <= Math.min(sheet.rowCount, 25); row++) {
    const cols = headerColumns(sheet, row)
    const fields = Object.fromEntries(aliases.flatMap(([key, names]) => {
      const col = matchColumn(cols, names)
      return col ? [[key, col]] : []
    }))
    if (fields.title && Object.keys(fields).length >= 2 && Object.keys(fields).length > Object.keys(best).length) {
      bestHeader = row
      best = fields
    }
  }
  if (bestHeader) {
    sheet.eachRow((row, index) => {
      if (index <= bestHeader) return
      const entry = readProfile(key => best[key] ? row.getCell(best[key]!) : undefined, index, logbook, groups)
      if (entry) entries.push(entry)
    })
    return entries
  }
  // Profile templates also use a matrix with field labels in a single column.
  for (let labelCol = 1; labelCol <= Math.min(sheet.columnCount, 4); labelCol++) {
    const rows: Partial<Record<keyof typeof PROFILE_ALIASES, number>> = {}
    for (let row = 1; row <= Math.min(sheet.rowCount, 200); row++) {
      const text = normalize(cellValue(sheet.getCell(row, labelCol)))
      const key = aliases.find(([, names]) => names.some(name => normalize(name) === text))?.[0]
      if (key && !rows[key]) rows[key] = row
    }
    if (!rows.title || Object.keys(rows).length < 2) continue
    for (let col = labelCol + 1; col <= Math.min(sheet.columnCount, 250); col++) {
      const entry = readProfile(key => rows[key] ? sheet.getCell(rows[key]!, col) : undefined, rows.title, logbook, groups)
      if (entry?.title) entries.push(entry)
    }
    if (entries.length) break
  }
  return entries
}

export function inspectEpisodeWorkbook(workbook: Workbook, roomDateField?: string): EpisodeWorkbook {
  const sheet = workbook.worksheets.find(item => normalize(item.name) === 'logbook')
    ?? workbook.worksheets.find(item => /^logbook\b/.test(normalize(item.name)))
  const profile = workbook.worksheets.find(item => ['profil', 'profil indikator', 'profil indikator mutu', 'master indikator'].includes(normalize(item.name)))
  if (!sheet && !profile) throw new Error('Sheet Logbook atau Profil/Master Indikator tidak ditemukan.')
  // A profile-only workbook can seed the empty master without any patient rows.
  const logbook: EpisodeSheet = sheet ? detectLogbook(sheet, roomDateField) :
    { sheet: profile!, header: 0, columns: [] }
  if (sheet && !logbook.columns.length) throw new Error('Header sheet Logbook tidak ditemukan.')
  return {
    workbook, logbook, profileSheet: profile?.name ?? null, hasLogbook: Boolean(sheet),
    entries: profile ? profileEntries(profile, logbook, readOptionsSheet(workbook)) : [],
  }
}

/**
 * Derive only *missing* patient-episode indicator profiles from the workbook.
 * This path deliberately does not depend on valid Logbook rows, nor does it
 * invent clinical answer choices or numerator/denominator definitions.
 * The server repeats all security and uniqueness checks transactionally.
 */
export function prepareMissingEpisodeProfiles(
  book: EpisodeWorkbook, active: EpisodeProfile[], reference: EpisodeProfile[],
  roomId: number, roomName: string, year: number,
) {
  const issues: WorkbookIssue[] = []
  const profiles: EpisodeProfile[] = []
  const seen = new Set<string>()
  const activeCodes = new Set(active.map(profile => normalizeCode(profile.code)))
  let skipped = 0
  let needsReview = 0
  for (const entry of book.entries) {
    const code = clean(entry.code)
    const title = clean(entry.title)
    const key = normalizeCode(code)
    const location = (book.profileSheet ?? 'Profil') + ' · baris ' + entry.row
    if (!code || !title) {
      issues.push({ location, message: 'Kode dan nama indikator wajib tersedia untuk mengisi master otomatis.' })
      continue
    }
    if (code.length > 120 || title.length > 500) {
      issues.push({ location, message: 'Kode atau nama indikator terlalu panjang.' })
      continue
    }
    const codedRoom = /^(\d+)\./.exec(code)
    if (codedRoom && Number(codedRoom[1]) !== roomId) {
      issues.push({ location, message: 'Kode ' + code + ' bukan milik unit ' + roomId + '.' })
      continue
    }
    if (seen.has(key)) {
      issues.push({ location, message: 'Kode ' + code + ' berulang pada sheet Profil.' })
      continue
    }
    seen.add(key)
    if (activeCodes.has(key)) { skipped++; continue }
    const baseline = reference.find(profile => normalizeCode(profile.code) === key &&
      profile.measurement_grain === 'patient_episode')
    const schema: Record<string, unknown> = {
      ...(baseline?.schema_json ?? {}), ...(entry.metadata.schema_json ?? {}),
      episode_workbook_profile: true, source_profile_sheet: book.profileSheet,
      response_capture_mode: 'categorical',
    }
    const sourceColumn = declaredSourceIndex(entry.source, book.logbook.columns) ||
      (entry.sourceColumns.length === 1 ? entry.sourceColumns[0] : 0) ||
      matchColumn(book.logbook.columns, [title, code, baseline?.title])
    const dropdownOptions = book.hasLogbook ? optionsFromValidation(book, sourceColumn) : []
    const options = entry.options.length ? entry.options :
      dropdownOptions.length ? dropdownOptions : normalizeOptions(baseline?.options_json)
    const direction = entry.direction || directionValue(schema.indicator_direction)
    if (direction) schema.indicator_direction = direction
    if (!options.length || !direction || !schema.measurement_type) {
      schema.import_requires_review = true
      needsReview++
    }
    const metadata = entry.metadata
    profiles.push({
      profile_year: year, room_id: roomId, unit_name: roomName, code, title,
      indicator_type: metadata.indicator_type ?? baseline?.indicator_type ?? null,
      category: metadata.category ?? baseline?.category ?? null,
      unit_of_measure: metadata.unit_of_measure ?? baseline?.unit_of_measure ?? null,
      target_text: metadata.target_text ?? baseline?.target_text ?? null,
      target_operator: metadata.target_operator ?? baseline?.target_operator ?? '=',
      target_value: metadata.target_value ?? baseline?.target_value ?? null,
      numerator_definition: metadata.numerator_definition ?? baseline?.numerator_definition ?? null,
      denominator_definition: metadata.denominator_definition ?? baseline?.denominator_definition ?? null,
      measurement_grain: 'patient_episode', schema_json: schema, options_json: options,
    })
  }
  if (profiles.length > 250) issues.push({
    location: 'Profil', message: 'Maksimal 250 indikator baru dapat diisi dalam satu unggahan.',
  })
  return { profiles, issues, skipped, needsReview }
}

export function isWorkbookCodedProfile(profile: EpisodeProfile) {
  if (profile.measurement_grain !== 'patient_episode') return false
  if (usesCategoricalResponseCapture(profile)) return true
  return ['ratio', 'compliance', 'occurrence'].includes(resolveMeasurementKind(profile)) && normalizeOptions(profile.options_json).length > 0
}

export function buildEpisodeMappings(
  book: EpisodeWorkbook, active: EpisodeProfile[], reference: EpisodeProfile[], aliases: Record<string, string>,
  saved: Array<{ indicator_code?: string; source_header?: string; occurrence?: number }>,
  includeProfiles: boolean,
): ProfileMapping[] {
  const profiles = active.filter(isWorkbookCodedProfile)
  const map = new Map<string, EpisodeProfile>()
  for (const profile of [...reference, ...active]) map.set(normalizeCode(profile.code), profile)
  const columns = book.logbook.columns
  const create = (entry: WorkbookProfile | undefined, master: EpisodeProfile | undefined, key: string): ProfileMapping => {
    const code = master?.code || entry?.code || ''
    const title = entry?.title || master?.title || code
    const savedRule = saved.find(item => normalizeCode(item.indicator_code) === normalizeCode(code))
    const savedColumn = columns.find(item => normalize(item.name) === normalize(savedRule?.source_header) && item.occurrence === (savedRule?.occurrence ?? 1))?.index ?? 0
    const schema = master?.schema_json ?? {}
    const schemaMapping = schema.excel_mapping as { indicator_header?: string } | undefined
    const matchingAliases = Object.entries(aliases).filter(([, value]) => normalizeCode(value) === normalizeCode(code)).map(([name]) => name)
    let column = declaredSourceIndex(entry?.source ?? '', columns)
    if (!column && !entry?.source) {
      column = entry?.sourceColumns.length === 1 ? entry.sourceColumns[0] : savedColumn
      column ||= matchColumn(columns, [schemaMapping?.indicator_header, schema.header_label, code, title, master?.title, ...matchingAliases])
    }
    return { key, entry, master, code, title, column, direction: entry?.direction || directionValue(schema.indicator_direction) }
  }
  if (!includeProfiles) return profiles.map(profile => {
    const entries = book.entries.filter(entry => entry.code
      ? normalizeCode(entry.code) === normalizeCode(profile.code)
      : normalize(entry.title) === normalize(profile.title) || normalizeCode(aliases[normalize(entry.title)]) === normalizeCode(profile.code))
    return create(entries.length === 1 ? entries[0] : undefined, profile, profile.code)
  })
  return book.entries.flatMap((entry, index) => {
    const explicit = normalizeCode(entry.code)
    const alias = normalizeCode(aliases[normalize(entry.title)])
    const byName = Array.from(map.values()).filter(profile => normalize(profile.title) === normalize(entry.title))
    const master = explicit ? map.get(explicit) : byName.length === 1 ? byName[0] : alias ? map.get(alias) : undefined
    if (master && (master.measurement_grain !== 'patient_episode' || !isWorkbookCodedProfile(master) && !entry.options.length && !entry.direction)) return []
    return [create(entry, master, 'profile-' + index)]
  })
}

function optionsFromValidation(book: EpisodeWorkbook, column: number): EpisodeOption[] {
  if (!column) return []
  const sheet = book.logbook.sheet
  const rules: Set<string> = new Set()
  for (let row = book.logbook.header + 1; row <= Math.min(sheet.rowCount, book.logbook.header + 100); row++) {
    const cell = sheet.getCell(row, column)
    const rule = cell.dataValidation
    if (rule?.type === 'list' && rule.formulae?.[0]) rules.add(String(rule.formulae[0]))
  }
  if (rules.size !== 1) return []
  const formula = [...rules][0].replace(/^=/, '')
  if (/^".*"$/.test(formula)) return normalizeOptions(formula.slice(1, -1).split(/[,;]/))
  const reference = /^(?:'((?:[^']|'')+)'|([^!]+))!\$?([A-Z]{1,3})\$?(\d+):\$?\3\$?(\d+)$/i
  let match = reference.exec(formula)
  if (!match && /^[A-Z_][A-Z0-9_.]*$/i.test(formula)) {
    const ranges = book.workbook.definedNames.getRanges(formula)?.ranges ?? []
    if (ranges.length === 1) match = reference.exec(ranges[0])
  }
  if (!match || Number(match[5]) - Number(match[4]) > 150) return []
  const list = book.workbook.getWorksheet(match[1]?.replace(/''/g, "'") ?? match[2])
  if (!list) return []
  const labels = []
  for (let row = Number(match[4]); row <= Number(match[5]); row++) labels.push(cellDisplay(list.getCell(match[3] + row)))
  return normalizeOptions(labels)
}

function mergeOptions(described: EpisodeOption[], baseline: EpisodeOption[]) {
  const matched = described.map(option => {
    const old = baseline.find(item => optionKey(item.label) === optionKey(option.label) && item.code === option.code)
    return { ...old, ...option }
  })
  return [...matched, ...baseline.filter(option => !described.some(item =>
    optionKey(item.label) === optionKey(option.label) && item.code === option.code,
  ))]
}

function readyProfile(book: EpisodeWorkbook, mapping: ProfileMapping, roomId: number, roomName: string, includeProfiles: boolean) {
  if (!includeProfiles && mapping.master) return mapping.master
  const master = mapping.master
  const existing = normalizeOptions(master?.options_json)
  const fromSheet = mapping.entry?.options ?? []
  const fromList = optionsFromValidation(book, mapping.column)
  const options = fromSheet.length ? mergeOptions(fromSheet, existing) :
    fromList.length ? mergeOptions(fromList, existing) : existing
  const finalOptions: EpisodeOption[] = options.length ? options : [1, 2, 3].map(code => ({ label: 'Kode ' + code, code }))
  return {
    ...master, ...mapping.entry?.metadata, code: master?.code || clean(mapping.code), title: mapping.title, room_id: roomId,
    unit_name: roomName, measurement_grain: 'patient_episode',
    schema_json: {
      ...master?.schema_json, ...mapping.entry?.metadata.schema_json,
      response_capture_mode: 'categorical', indicator_direction: mapping.direction || undefined, episode_workbook_profile: true,
    },
    options_json: finalOptions,
  }
}

export function matchEpisodeOption(input: unknown, options: EpisodeOption[], directional = false) {
  const text = clean(input)
  if (!text) return { error: 'Respons kosong.' } as const
  if (typeof input === 'object' && input !== null) return { error: 'Sel respons berisi galat Excel.' } as const
  const suffix = text.match(markedCode)
  const bare = /^(?:(?:kode|code)\s*)?([1-3])$/i.exec(text)
  const label = suffix ? text.slice(0, suffix.index).trim() : text
  const code = Number(bare?.[1] ?? suffix?.[1])
  const matches = (Array.isArray(options) ? options : []).filter(option => {
    if (![1, 2, 3].includes(Number(option.code))) return false
    return bare ? Number(option.code) === code : optionKey(option.label) === optionKey(label) && (!suffix || Number(option.code) === code)
  })
  if (matches.length === 1) return { option: { ...matches[0], code: Number(matches[0].code) }, codeOnly: false } as const
  if (bare && matches.length > 1) {
    const first = matches[0]
    const same = matches.every(option =>
      (option.eligible === false || option.denominator_excluded === true) ===
        (first.eligible === false || first.denominator_excluded === true) &&
      Boolean(option.review_required) === Boolean(first.review_required) &&
      (directional || (option.numerator === first.numerator && option.denominator === first.denominator)),
    )
    if (same) return { option: { ...first, code }, codeOnly: true } as const
    return { error: 'Kode memiliki beberapa makna. Gunakan label lengkap dari workbook.' } as const
  }
  return { error: 'Respons tidak cocok dengan kode 1, 2, atau 3 pada profil.' } as const
}

export async function workbookSha256(bytes: ArrayBuffer | string) {
  const value = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes
  const hash = await crypto.subtle.digest('SHA-256', value)
  return Array.from(new Uint8Array(hash)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJson)
  if (!value || typeof value !== 'object') return value
  return Object.fromEntries(Object.entries(value).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => [key, sortJson(item)]))
}

function profileContent(profile: EpisodeProfile) {
  return JSON.stringify(sortJson({
    code: profile.code, title: profile.title, room_id: profile.room_id, unit_name: profile.unit_name,
    indicator_type: profile.indicator_type ?? null, category: profile.category ?? null,
    unit_of_measure: profile.unit_of_measure ?? null, target_text: profile.target_text ?? null,
    target_operator: profile.target_operator ?? '=', target_value: profile.target_value == null ? null : Number(profile.target_value),
    numerator_definition: profile.numerator_definition ?? null, denominator_definition: profile.denominator_definition ?? null,
    measurement_grain: profile.measurement_grain, schema_json: profile.schema_json ?? {}, options_json: profile.options_json ?? [],
  }))
}

export async function prepareEpisodeImport({
  parsed, fields, mappings, activeProfiles, includeProfiles, roomId, roomName, year, layoutFields,
}: {
  parsed: EpisodeWorkbook; fields: EpisodeFields; mappings: ProfileMapping[]; activeProfiles: EpisodeProfile[];
  includeProfiles: boolean; roomId: number; roomName: string; year: number; layoutFields: string[];
}) {
  const issues: WorkbookIssue[] = []
  const rows: EpisodeStageRow[] = []
  const selected = mappings.filter(mapping => mapping.column)
  if (!fields.date || !(fields.mrn || fields.episode)) issues.push({ location: 'Logbook', message: 'Pilih kolom tanggal dan No. RM atau ID episode.' })
  if (!selected.length) issues.push({ location: 'Logbook', message: 'Petakan paling sedikit satu indikator.' })
  const targets = new Set<string>()
  const sourceColumns = new Set(Object.values(fields).filter(Boolean))
  const configured = mappings.map(mapping => ({ mapping, profile: readyProfile(parsed, mapping, roomId, roomName, includeProfiles) }))
  for (const { mapping, profile } of configured) {
    if (!mapping.column && !includeProfiles) continue
    if (!profile.code || !profile.title) issues.push({ location: mapping.title || 'Profil', message: 'Kode dan judul indikator wajib tersedia.' })
    if (targets.has(normalizeCode(profile.code))) issues.push({ location: profile.code, message: 'Kode indikator muncul lebih dari satu kali.' })
    targets.add(normalizeCode(profile.code))
    if (mapping.column && sourceColumns.has(mapping.column)) issues.push({ location: profile.code || profile.title, message: 'Kolom sumber sudah dipakai. Pilih kolom yang sesuai.' })
    if (mapping.column) sourceColumns.add(mapping.column)
    if (includeProfiles && !mapping.direction && (!mapping.master || !profile.options_json?.every(option => typeof option.numerator === 'boolean'))) {
      issues.push({ location: profile.code || profile.title, message: 'Tentukan arah untuk menghitung capaian dari kode respons.' })
    }
    if (includeProfiles && activeProfiles.some(active => normalizeCode(active.code) === normalizeCode(profile.code) && (!mapping.master?.id || active.id !== mapping.master.id))) {
      issues.push({ location: profile.code, message: 'Kode ini sudah dipakai profil lain di unit.' })
    }
    if (profile.options_json && new Set(profile.options_json.map(option => optionKey(option.label))).size !== profile.options_json.length) {
      issues.push({ location: profile.code || profile.title, message: 'Profil memiliki label jawaban ganda.' })
    }
  }
  const retained = activeProfiles.filter(profile => !targets.has(normalizeCode(profile.code)))
  const profileChanged = includeProfiles && configured.some(({ profile }) => {
    const active = activeProfiles.find(current => current.code === profile.code)
    return !active || profileContent(profile) !== profileContent(active)
  })
  const profiles = profileChanged ? [...configured.map(item => item.profile), ...retained] : []
  if (profiles.length > 500) issues.push({ location: 'Profil', message: 'Jumlah profil yang dapat disimpan adalah maksimal 500.' })
  if (profileChanged && activeProfiles.some(profile => profile.status === 'draft')) issues.push({ location: 'Profil', message: 'Selesaikan profil draf di Pengaturan sebelum menerapkan profil workbook.' })
  if (issues.length) return { issues, rows, profiles, codes: [0, 0, 0] }
  const { sheet, header, columns } = parsed.logbook
  const layoutColumns = layoutFields.flatMap(field => {
    const column = matchColumn(columns, [field])
    return column ? [{ field, column }] : []
  })
  const episodeKeys = new Set<string>()
  const codes = [0, 0, 0]
  const dateValue = (value: unknown) => normalizeIgdDateTime(
    parsed.workbook.properties.date1904 && typeof value === 'number' ? value + 1462 : value,
  )
  const picked = configured.filter(item => item.mapping.column > 0)
  const staged: Array<Omit<EpisodeStageRow, 'source_key'>> = []
  sheet.eachRow((row, index) => {
    if (index <= header || issues.length >= 100 || staged.length > 10000) return
    const get = (col: number) => col ? cellValue(row.getCell(col)) : null
    const id = (col: number) => col ? identityCell(row.getCell(col)) : ''
    const mrn = id(fields.mrn), episode = id(fields.episode)
    const name = clean(get(fields.name))
    const date = dateValue(get(fields.date))
    const location = sheet.name + ' · baris ' + index
    const hasIdentity = Boolean(mrn || episode || name)
    const filled = picked.filter(({ mapping, profile }) => {
      const cell = row.getCell(mapping.column)
      const value = get(mapping.column)
      if (!cell.formula) return clean(value) !== ''
      // Template formulas may extend beyond recorded episodes.
      if (!hasIdentity && !date) return false
      if (value == null && hasIdentity && date) {
        issues.push({ location: location + ' · ' + profile.code, message: 'Hasil formula belum tersimpan. Hitung ulang workbook di Excel dan simpan kembali.' })
      }
      return clean(value) !== ''
    })
    if (!filled.length) return
    if (!date || !(mrn || episode)) {
      issues.push({ location, message: 'Tanggal dan No. RM atau ID episode harus terisi.' })
      return
    }
    const normalizedMrn = mrn.toUpperCase().replace(/[\s.-]+/g, '')
    const key = JSON.stringify(episode ? ['episode', normalizeCode(episode)] : ['rm', normalizedMrn, date])
    if (episodeKeys.has(key)) {
      issues.push({ location, message: 'Episode ganda. Periksa ID episode atau waktu kunjungan.' })
      return
    }
    episodeKeys.add(key)
    const responses: EpisodeResponse[] = []
    for (const { mapping, profile } of filled) {
      const raw = get(mapping.column)
      const result = matchEpisodeOption(raw, profile.options_json ?? [], Boolean(directionValue(profile.schema_json?.indicator_direction)))
      if ('error' in result) {
        issues.push({ location: location + ' · ' + profile.code, message: result.error! })
        continue
      }
      const option = result.option
      codes[option.code - 1]++
      responses.push({
        indicator_code: profile.code,
        response_label: result.codeOnly ? null : option.label, response_code: option.code,
        review_status: option.review_required ? 'pending' : 'not_required',
        raw_value: { ...(result.codeOnly ? { code_only: true as const } : { answer: option.label }), code: option.code, source_value: clean(raw) },
      })
    }
    if (!responses.length) return
    const diagnosis = clean(get(fields.diagnosis)), dpjp = clean(get(fields.dpjp))
    const discharge = dateValue(get(fields.discharge))
    const formFields = Object.fromEntries(layoutColumns.map(({ field, column }) => {
      const value = get(column)
      const text = value instanceof Date ? dateValue(value) : cellDisplay(row.getCell(column))
      return [field, text]
    }).filter(([, value]) => value))
    const dateColumn = columns.find(column => column.index === fields.date)
    if (dateColumn) formFields[dateColumn.name] = date
    if (mrn) formFields['No. Rekam Medis'] = mrn
    if (name) formFields['Nama Pasien'] = name
    if (discharge) formFields['Tanggal Keluar'] = discharge
    const indicatorValues = Object.fromEntries(responses.map(response => [
      response.indicator_code, { ...response.raw_value, review_status: response.review_status },
    ]))
    const core = {
      patient_name: name, medical_record_no: mrn, admission_at: date, discharge_at: discharge,
      diagnosis, dpjp, unit_name: roomName, form_fields: formFields, indicator_values: indicatorValues,
      source_import: { source_sheet: sheet.name, source_excel_row: index, import_scope: EPISODE_WORKBOOK_IMPORTER },
    }
    staged.push({
      source_sheet: sheet.name, source_row: index,
      row_payload: {
        record_payload: {
          room_id: roomId, profile_year: year, measurement_grain: 'patient_episode',
          record_date: date.slice(0, 10), subject_key: key,
          core_data: core, subject_json: core, status: 'ready',
          review_required: responses.some(response => response.review_status === 'pending'),
        },
        responses, attributions: [],
      },
    })
  })
  if (staged.length > 10000) issues.push({ location: 'Logbook', message: 'Pisahkan workbook menjadi maksimal 10.000 episode per unggahan.' })
  if (!staged.length && !issues.length) issues.push({ location: 'Logbook', message: 'Tidak ada episode berisi respons indikator yang valid.' })
  if (issues.length) return { issues, rows, profiles, codes }
  for (let index = 0; index < staged.length; index += 250) {
    const chunk = staged.slice(index, index + 250)
    rows.push(...await Promise.all(chunk.map(async row => {
      const key = await workbookSha256(JSON.stringify([roomId, year, row.row_payload.record_payload.subject_key]))
      return { ...row, source_key: key, row_payload: { ...row.row_payload, record_payload: { ...row.row_payload.record_payload, subject_key: EPISODE_WORKBOOK_IMPORTER + ':' + key } } }
    })))
  }
  return { issues, rows, profiles, codes }
}
