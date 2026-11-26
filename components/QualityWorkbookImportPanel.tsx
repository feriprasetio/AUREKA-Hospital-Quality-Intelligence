'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import QualityWorkbookStagedPreview from '@/components/quality/QualityWorkbookStagedPreview'
import unitAliases from '@/data/quality-audit-profile-aliases-2026.json'
import { inspectQualityWorkbookRouting, isStandardUnitWorkbook } from '@/lib/aureka/quality-workbook-source-audit'
import { exactWorkbookColumn, getStandardMappedRoomDate, getIncidentReportElapsedMinutes, readCodedWorkbookChoice } from '@/lib/aureka/standard-mapped-quality-workbook'
import { isExcelSourceError, isMaterialWorkbookSourceRow } from '@/lib/aureka/quality-import-row-filter'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { resolveMeasurementKind, usesCategoricalResponseCapture } from '@/lib/aureka/indicator-engine'
import { getIsolasiWorkbookIndicatorColumns, parseIsolasiSourceAnswer, type IsolasiIndicatorOption } from '@/lib/aureka/isolasi-inpatient-logbook'
import { shouldUseIndicatorDropdown } from '@/lib/aureka/indicator-dropdown'
import { isIndicatorApplicableToDiagnosis } from '@/lib/aureka/quality-logbook-coverage'
import { getWorkbookRuleColumn, readWorkbookSourceColumns, type WorkbookSourceColumn, type WorkbookSourceRule } from '@/lib/aureka/quality-workbook-columns'
import { toUserFacingError } from '@/lib/ui/error-feedback'
import { fuzzyFindHeader, pickBestBlock, type BlockRow } from '@/lib/aureka/smart-workbook-block'

type Profile = {
  [key: string]: any
  id?: string
  source_id?: string | null
  source_code?: string
  code: string
  title: string
  room_id: number
  unit_name?: string
  indicator_type?: string | null
  category?: string | null
  unit_of_measure?: string | null
  target_text?: string | null
  target_operator?: string | null
  target_value?: number | null
  numerator_definition?: string | null
  denominator_definition?: string | null
  measurement_grain?: string | null
  schema_json?: Record<string, any> | null
  options_json?: Array<{ label?: unknown; code?: unknown; review_required?: boolean }> | null
}
type SheetMeta = { name: string; headerRow: number; headers: string[]; columns: WorkbookSourceColumn[] }
type SavedMapping = WorkbookSourceRule & { target_type: string; target_key: string }
const headerText = (columnKey: string) => columnKey.replace(/^[A-Z]+: /, '')
type ImportIssue = { sheet: string; row: number; field: string; message: string }
type StagedRow = { source_key: string; source_sheet: string; source_row: number; row_payload: Record<string, any> }
type Preview = { heldRows: ImportIssue[]; master: Profile[]; profiles: Profile[]; rows: StagedRow[]; issues: ImportIssue[]; workbookRows: number; skippedTemplateRows: number; draftRows: number }

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const PROFILE_FIELDS = [
  ['code', 'Kode indikator', ['kode indikator', 'kode', 'indicator code', 'code']],
  ['title', 'Nama indikator', ['nama indikator', 'indikator', 'judul indikator', 'indicator name', 'title']],
  ['indicator_type', 'Program / jenis', ['program', 'jenis indikator', 'indicator type', 'jenis']],
  ['category', 'Kategori', ['kategori', 'category']],
  ['unit_of_measure', 'Satuan', ['satuan', 'unit', 'unit of measure']],
  ['target_text', 'Target', ['target', 'target indikator', 'standar']],
  ['target_operator', 'Operator target', ['operator target', 'target operator']],
  ['target_value', 'Nilai target', ['nilai target', 'target value']],
  ['numerator_definition', 'Definisi numerator', ['definisi pembilang', 'pembilang', 'numerator definition', 'numerator']],
  ['denominator_definition', 'Definisi denominator', ['definisi penyebut', 'penyebut', 'denominator definition', 'denominator']],
  ['measurement_grain', 'Grain pengukuran', ['grain pengukuran', 'measurement grain', 'metode pencatatan', 'granularitas']],
  ['measurement_type', 'Tipe pengukuran', ['tipe pengukuran', 'measurement type', 'measurement method', 'jenis pengukuran']],
  ['indicator_direction', 'Arah indikator', ['arah indikator', 'indicator direction', 'direction']],
  ['response_capture_mode', 'Mode respons', ['mode respons', 'response capture mode', 'input mode']],
  ['schema_json', 'Schema JSON', ['schema json', 'schema_json', 'konfigurasi teknis']],
  ['options_json', 'Opsi JSON', ['options json', 'options_json', 'opsi json']],
] as const
const normalize = (value: unknown) => String(value ?? '').normalize('NFKC').toLocaleLowerCase('id-ID').replace(/[\s_-]+/g, ' ').trim()
const clean = (value: unknown) => value == null ? '' : String(value).trim()
const asCell = (value: any): any => {
  if (value == null) return null
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if ('formula' in value || 'sharedFormula' in value) return asCell(value.result ?? null)
    if ('error' in value) return String(value.error)
    if ('text' in value) return value.text
    if ('richText' in value) return value.richText.map((part: any) => part.text).join('')
    if ('result' in value) return value.result
    if ('hyperlink' in value) return value.text ?? value.hyperlink
  }
  return value
}
const parseJson = (value: unknown, fallback: any, field: string) => {
  if (value == null || value === '') return fallback
  if (typeof value === 'object' && !Array.isArray(value)) return value
  if (Array.isArray(value)) return value
  try { return JSON.parse(String(value)) } catch { throw new Error(field + ' harus berupa JSON yang valid.') }
}
const numberValue = (value: unknown): number | null => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  let raw = clean(value).replace(/\s/g, '')
  if (!raw) return null
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.')
  else raw = raw.replace(',', '.')
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? parsed : null
}
const parseDate = (value: unknown): string | null => {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10)
  const raw = clean(value)
  if (!raw) return null
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ]\d{1,2}:\d{2}.*)?$/)
  if (iso) {
    const [, year, month, day] = iso
    const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)))
    return date.toISOString().slice(0, 10) === [year, month, day].join('-') ? date.toISOString().slice(0, 10) : null
  }
  if (typeof value === 'number' || /^\d{5}(?:\.\d+)?$/.test(raw)) {
    const serial = Number(value)
    if (serial >= 20000 && serial <= 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  }
  const dmy = raw.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})(?:\s+\d{1,2}:\d{2}.*)?$/)
  if (dmy) {
    const date = new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])))
    if (date.getUTCFullYear() === Number(dmy[3]) && date.getUTCMonth() === Number(dmy[2]) - 1 && date.getUTCDate() === Number(dmy[1])) return date.toISOString().slice(0, 10)
  }
  return null
}
const grainValue = (value: unknown): string => {
  const raw = normalize(value).replace(/ /g, '_')
  const aliases: Record<string, string> = {
    pasien: 'patient_episode', per_pasien: 'patient_episode', per_episode_pasien: 'patient_episode',
    patient: 'patient_episode', patient_episode: 'patient_episode', episode: 'patient_episode', 'per pasien episode': 'patient_episode', 'pasien episode': 'patient_episode',
    dokter_hari: 'provider_day', per_dokter_per_hari: 'provider_day', provider_day: 'provider_day',
    harian: 'daily_metric', per_hari: 'daily_metric', daily: 'daily_metric', daily_metric: 'daily_metric',
    kejadian: 'event', per_kejadian: 'event', event: 'event',
    aktivitas: 'activity', per_aktivitas: 'activity', activity: 'activity',
    agregat: 'aggregate', agregasi: 'aggregate', aggregate: 'aggregate',
  }
  return aliases[raw] ?? raw
}
const DATA_FIELD_SYNONYMS: Record<string, string[]> = {
  date: ['tanggal masuk','tanggal aduan','tanggal permintaan','tanggal audit','tanggal kunjungan','tanggal pengamatan','tanggal pelayanan','tanggal dilayani','tanggal survei','tanggal lapor','tanggal','date','record date'],
  subject_key: ['no. rm', 'no rm', 'nomor rekam medis', 'no. rekam medis', 'id subjek', 'kode pegawai'],
  patient_name: ['nama pasien', 'nama', 'patient name'],
  diagnosis: ['diagnosa', 'diagnosis', 'diagnosis tegak'],
  dpjp: ['dpjp', 'dokter penanggung jawab'],
}
/** Baca maksimal 40 baris pertama sheet sebagai teks sel untuk pencarian blok tabel. */
const sheetPreviewRows = (sheet: any, limit = 40): BlockRow[] => {
  const rows: BlockRow[] = []
  for (let rowNumber = 1; rowNumber <= Math.min(limit, sheet.rowCount); rowNumber++) {
    const cells: Array<{ index: number; text: string }> = []
    sheet.getRow(rowNumber).eachCell((cell: any, index: number) => {
      if (cell.isMerged && cell.master.address !== cell.address) return
      const text = String(cell.text ?? '').trim()
      if (text) cells.push({ index, text })
    })
    if (cells.length) rows.push({ rowNumber, cells })
  }
  return rows
}
const findHeader = (headers: string[], synonyms: string[]) => {
  const aliases = synonyms.filter(Boolean).map(normalize)
  const exact = headers.filter(header => aliases.includes(normalize(headerText(header))))
  if (exact.length === 1) return exact[0]
  if (exact.length > 1) return ''
  const partial = headers.filter(header => aliases.some(alias => alias.length >= 5 && normalize(headerText(header)).includes(alias)))
  return partial.length === 1 ? partial[0] : ''
}
const hash = async (value: string) => {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('')
}
const optionForValue = (profile: Profile, rawValue: unknown) => {
  const raw = clean(rawValue)
  if (!raw) return null
  const options = Array.isArray(profile.options_json) ? profile.options_json : []
  const choice = readCodedWorkbookChoice(raw)
  if (choice.conflictingCodes) return null
  const key = (value: unknown) => normalize(value).replace(/\s*([/:])\s*/g, '$1')
  const byCode = options.filter(option => String(option.code ?? '') === raw && [1, 2, 3].includes(Number(option.code)))
  const matches = byCode.length === 1 ? byCode : options.filter(option =>
    key(readCodedWorkbookChoice(clean(option.label)).label) === key(choice.label) &&
    (choice.sourceCode == null || Number(option.code) === choice.sourceCode))
  return matches.length === 1 ? matches[0] : null
}
const clockPair = (value: string) => {
  const m = value.match(/(\d{1,2}:\d{2})\s*(?:-|–|—|sampai|to|→)\s*(\d{1,2}:\d{2})/i)
  if (!m) return null
  const valid = (v: string) => {
    const [h, min] = v.split(':').map(Number)
    return h >= 0 && h < 24 && min >= 0 && min < 60
  }
  return valid(m[1]) && valid(m[2]) ? { start: m[1].padStart(5, '0'), end: m[2].padStart(5, '0') } : null
}

export default function QualityWorkbookImportPanel({
  roomId, roomName, year, importerKey, role, activeProfiles, onImported, dataOnly = false, profilesOnly = false, initialFile = null, onStandardWorkbook,
}: {
  roomId: number
  roomName: string
  year: number
  importerKey: string
  role: string | null
  activeProfiles: Profile[]
  onImported: () => void
  dataOnly?: boolean
  profilesOnly?: boolean
  onStandardWorkbook?: (file: File) => void
  initialFile?: File | null
}) {
  const workbookRef = useRef<any>(null)
  const fileRef = useRef<File | null>(null)
  const lastInitialFile = useRef<File | null>(null)
  const pendingLogbookPreview = useRef(false)
  const [sheets, setSheets] = useState<SheetMeta[]>([])
  const [fileName, setFileName] = useState('')
  const [fileHash, setFileHash] = useState('')
  const [profileSheet, setProfileSheet] = useState('')
  const [optionsSheet, setOptionsSheet] = useState('')
  const [dataSheet, setDataSheet] = useState('')
  const [profileHeaderRow, setProfileHeaderRow] = useState(1)
  const [optionsHeaderRow, setOptionsHeaderRow] = useState(1)
  const [dataHeaderRow, setDataHeaderRow] = useState(1)
  const [profileColumns, setProfileColumns] = useState<Record<string, string>>({})
  const [optionColumns, setOptionColumns] = useState<Record<string, string>>({})
  const [dataColumns, setDataColumns] = useState<Record<string, string>>({})
  const [indicatorColumns, setIndicatorColumns] = useState<Record<string, string>>({})
  const [numeratorColumns, setNumeratorColumns] = useState<Record<string, string>>({})
  const [denominatorColumns, setDenominatorColumns] = useState<Record<string, string>>({})
  const [selectedMode, setImportMode] = useState<'profiles_and_data' | 'profiles_only' | 'data_only'>('data_only')
  const importMode = profilesOnly ? 'profiles_only' : dataOnly ? 'data_only' : selectedMode
  const [dataMode, setDataMode] = useState<'append' | 'upsert'>('append')
  const [prepared, setPreview] = useState<Preview | null>(null)
  const preview = prepared?.master === activeProfiles ? prepared : null
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [sourceNotes, setSourceNotes] = useState<string[]>([])
  const [batchId, setBatchId] = useState('')
  const [replaceConfirmed, setReplaceConfirmed] = useState(false)

  const currentProfiles = useMemo(() => preview?.profiles ?? activeProfiles, [preview?.profiles, activeProfiles])
  const dataHeaders = sheets.find(sheet => sheet.name === dataSheet)?.headers ?? []
  const profileHeaders = sheets.find(sheet => sheet.name === profileSheet)?.headers ?? []
  const optionHeaders = sheets.find(sheet => sheet.name === optionsSheet)?.headers ?? []
  const roleCanImportProfiles = role === 'ADMIN' && !dataOnly
  const currentAliases = year === 2026 ? (unitAliases as Record<string, Record<string,string>>)[roomId] ?? {} : {}
  const aliasesFor = (profile: Profile) => Object.entries(currentAliases).filter(([, code]) => code === profile.code).map(([name]) => name)
  const dataScope = sheets.find(sheet => sheet.name === dataSheet)
  const isStandardMappedLogbook = dataOnly && year === 2026 && dataSheet === 'Logbook' &&
    Boolean(getStandardMappedRoomDate(roomId)) && isStandardUnitWorkbook(
      inspectQualityWorkbookRouting(fileName, roomId, year).hint, roomId, sheets.map(sheet => sheet.name),
    )
  const canSaveMappings = role === 'ADMIN' || role === 'PMKP'

  const applySheetHeader = (name: string, rowNumber: number) => {
    const sheet = workbookRef.current?.getWorksheet(name)
    if (!sheet || !Number.isInteger(rowNumber) || rowNumber < 1 || rowNumber > sheet.rowCount) return
    const columns = readWorkbookSourceColumns(sheet.getRow(rowNumber))
    setSheets(current => current.map(item => item.name === name
      ? { ...item, headerRow: rowNumber, headers: columns.map(column => column.key), columns } : item))
  }

  const changeDataSource = (name: string, header: number) => {
    setDataSheet(name); setDataHeaderRow(header); setPreview(null)
    setDataColumns({}); setIndicatorColumns({}); setNumeratorColumns({}); setDenominatorColumns({})
    applySheetHeader(name, header)
  }

  const inspect = async (file: File) => {
    pendingLogbookPreview.current = false
    setError(''); setNotice(''); setPreview(null); setBatchId(''); setReplaceConfirmed(false)
    setSheets([]); setFileName(''); setFileHash(''); setSourceNotes([])
    workbookRef.current = null
    fileRef.current = null
    if (!/\.xlsx$/i.test(file.name) || file.size <= 0 || file.size > 25 * 1024 * 1024) {
      setError('Pilih workbook .xlsx yang valid dengan ukuran maksimum 25 MB.')
      return
    }
    const routing = inspectQualityWorkbookRouting(file.name, roomId, year)
    const canRouteStandard = Boolean(onStandardWorkbook && dataOnly && routing.hint?.roomId === roomId &&
      (routing.hint.kind === 'pharmacy_multisheet' || routing.hint.kind === 'outpatient_matrix') &&
      routing.blockers.length === 1)
    if (routing.blockers.length && !canRouteStandard) {
      setError(routing.blockers.join(' '))
      return
    }
    setSourceNotes(routing.notes)
    try {
      const module = await import('exceljs-hardened')
      const ExcelJS: any = (module as any).default ?? module
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await file.arrayBuffer())
      if (dataOnly && onStandardWorkbook && isStandardUnitWorkbook(routing.hint, roomId, workbook.worksheets.map((sheet: { name: string }) => sheet.name))) {
        onStandardWorkbook(file)
        return
      }
      if (routing.blockers.length) throw new Error(routing.blockers.join(' '))
      const detected: SheetMeta[] = []
      // Target pencocokan: isian dasar logbook + setiap indikator aktif unit (kode, judul, alias).
      const targets: string[][] = [
        ...Object.values(DATA_FIELD_SYNONYMS),
        ...activeProfiles.map(p => [p.schema_json?.excel_mapping?.indicator_header, p.schema_json?.header_label, p.title, ...aliasesFor(p)].filter(Boolean).map(String)),
      ]
      const previews = workbook.worksheets.slice(0, 50).map((sheet: any) => ({ name: sheet.name as string, rows: sheetPreviewRows(sheet) }))
      const smartRow = new Map<string, number>()
      for (const preview of previews) {
        const pick = pickBestBlock([preview], targets)
        if (pick && pick.matched >= 2) smartRow.set(preview.name, pick.headerRow)
      }
      for (const sheet of workbook.worksheets.slice(0, 50)) {
        const smart = smartRow.get(sheet.name)
        if (smart) {
          const columns = readWorkbookSourceColumns(sheet.getRow(smart))
          if (columns.length) { detected.push({ name: sheet.name, headerRow: smart, columns, headers: columns.map(column => column.key) }); continue }
        }
        let bestRow = 1
        let bestColumns: WorkbookSourceColumn[] = []
        let bestScore = -1
        for (let rowNumber = 1; rowNumber <= Math.min(40, sheet.rowCount); rowNumber++) {
          const columns = readWorkbookSourceColumns(sheet.getRow(rowNumber))
          const structure = columns.filter(column => /^(no\.?$|nama pasien|tanggal |tanggal$|kode indikator|judul indikator|nama indikator|nomor rekam medis|no\.? rm|bulan$)/i.test(column.header)).length
          const score = structure * 100 + columns.filter(column => /\p{L}/u.test(column.header)).length
          if (score > bestScore && columns.length) { bestColumns = columns; bestRow = rowNumber; bestScore = score }
        }
        if (bestColumns.length) detected.push({ name: sheet.name, headerRow: bestRow, columns: bestColumns, headers: bestColumns.map(column => column.key) })
      }
      if (!detected.length) throw new Error('Tidak ditemukan judul tabel pada 40 baris pertama setiap sheet.')
      workbookRef.current = workbook
      fileRef.current = file
      setFileName(file.name)
      const bytes = await file.arrayBuffer()
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      setFileHash(Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join(''))
      setSheets(detected)
      const pSheet = detected.find(s => /^profil$|profil.*indikator|daftar.*indikator|master.*indikator/i.test(s.name))
        ?? detected.find(s => findHeader(s.headers, ['kode indikator', 'indicator code', 'code']) && findHeader(s.headers, ['nama indikator', 'indicator name', 'title']))
      const oSheet = detected.find(s => /opsi.*indikator|pilihan.*indikator|opsi/i.test(s.name))
        ?? detected.find(s => findHeader(s.headers, ['kode opsi', 'option code']) && findHeader(s.headers, ['kode indikator', 'indicator code']))
      const excluded = new Set([pSheet?.name, oSheet?.name].filter(Boolean) as string[])
      const bestBlock = pickBestBlock(previews, targets, { exclude: excluded })
      const smartSheet = bestBlock && bestBlock.matched >= 2 ? detected.find(s => s.name === bestBlock.sheet) : undefined
      let dSheet = detected.find(s => /^logbook$/i.test(s.name))
        ?? smartSheet
        ?? detected.find(s => /logbook|rekap|data/i.test(s.name) && s.name !== pSheet?.name && s.name !== oSheet?.name)
        ?? detected.find(s => s.name !== pSheet?.name && s.name !== oSheet?.name)
      // A known PMKP template (notably IGD) may use a non-default header row.
      const verifiedRow = routing.hint?.headerRow
      if (dSheet && /^logbook$/i.test(dSheet.name) && verifiedRow) {
        const namedSheet = workbook.getWorksheet(dSheet.name)
        const knownColumns = namedSheet ? readWorkbookSourceColumns(namedSheet.getRow(verifiedRow)) : []
        if (knownColumns.length >= 3) dSheet = {
          ...dSheet, headerRow: verifiedRow, columns: knownColumns,
          headers: knownColumns.map(column => column.key),
        }
      }
      const { data: savedMap } = profilesOnly ? { data: null } : await q().rpc('quality_excel_header_mapping_list', {
        p_room_id: roomId, p_profile_year: year, p_importer_key: importerKey,
      })
      const saved: SavedMapping[] = Array.isArray(savedMap?.mappings) ? savedMap.mappings : []
      const sources = new Map<string, { sheet: string; row: number }>()
      for (const rule of saved) {
        const sheet = rule.transform_json?.source_sheet
        const row = Number(rule.transform_json?.header_row)
        if (rule.mapping_status === 'needs_review' || !sheet || !Number.isInteger(row) || row < 1) continue
        const match = workbook.getWorksheet(sheet)
        if (match && row <= match.rowCount) sources.set(JSON.stringify([sheet, row]), { sheet, row })
      }
      const standardMappedDate = dataOnly && year === 2026 && isStandardUnitWorkbook(
        routing.hint, roomId, detected.map(sheet => sheet.name),
      ) ? getStandardMappedRoomDate(roomId) : undefined
      if (sources.size === 1 && !standardMappedDate) {
        const source = [...sources.values()][0]
        const sheet = workbook.getWorksheet(source.sheet)
        const columns = readWorkbookSourceColumns(sheet.getRow(source.row))
        if (columns.length) {
          dSheet = { name: source.sheet, headerRow: source.row, headers: columns.map(column => column.key), columns }
          setSheets(current => [...current.filter(item => item.name !== source.sheet), dSheet!])
        }
      }
      const findSaved = (type: string, key: string) => {
        if (!dSheet) return undefined
        const rule = saved.find(item => item.mapping_status !== 'needs_review' && item.target_type === type && item.target_key === key)
        return rule ? getWorkbookRuleColumn(dSheet.columns, dSheet.name, dSheet.headerRow, rule)?.key ?? '' : undefined
      }
      setProfileSheet(pSheet?.name ?? '')
      setOptionsSheet(oSheet?.name ?? '')
      setDataSheet(dSheet?.name ?? '')
      // Empty master: prefer a non-destructive profile-only bootstrap first.
      // The user can later import logbook rows separately after reviewing the new profiles.
      if (!profilesOnly && roleCanImportProfiles && pSheet && activeProfiles.length === 0) {
        setImportMode('profiles_only')
      }
      setProfileHeaderRow(pSheet?.headerRow ?? 1)
      setOptionsHeaderRow(oSheet?.headerRow ?? 1)
      setDataHeaderRow(dSheet?.headerRow ?? 1)
      const nextProfile: Record<string, string> = {}
      for (const [key, , synonyms] of PROFILE_FIELDS) nextProfile[key] = pSheet ? findHeader(pSheet.headers, [...synonyms]) : ''
      setProfileColumns(nextProfile)
      const nextOptions: Record<string, string> = oSheet ? {
        indicator_code: findHeader(oSheet.headers, ['kode indikator', 'indicator code', 'indicator', 'kode']),
        label: findHeader(oSheet.headers, ['label opsi', 'pilihan', 'opsi', 'option label', 'label', 'jawaban']),
        code: findHeader(oSheet.headers, ['kode opsi', 'kode jawaban', 'option code', 'response code', 'code']),
        review_required: findHeader(oSheet.headers, ['perlu review', 'review required']),
      } : {}
      setOptionColumns(nextOptions)
      const guessed: string[] = []
      const usedHeaders = new Set<string>()
      // Cocokkan persis dulu; bila tidak ada, tebak kolom yang paling mirip (mis. "Tgl Msk" → Tanggal Masuk).
      const pick = (savedValue: string | undefined, label: string, aliases: Array<string | null | undefined>) => {
        if (savedValue !== undefined) { if (savedValue) usedHeaders.add(savedValue); return savedValue }
        const headers = dSheet?.headers ?? []
        const exact = findHeader(headers, aliases.filter(Boolean) as string[])
        if (exact) { usedHeaders.add(exact); return exact }
        const fuzzy = fuzzyFindHeader(headers.map(headerText), aliases, { exclude: new Set([...usedHeaders].map(headerText)) })
        const key = fuzzy ? headers.find(h => headerText(h) === fuzzy.header) ?? '' : ''
        if (key) { usedHeaders.add(key); guessed.push(label + ' ← ' + headerText(key)) }
        return key
      }
      const isolasiColumns = roomId === 24 && year === 2026 && dSheet?.name === 'Logbook'
        ? getIsolasiWorkbookIndicatorColumns(dSheet.columns) : null
      const standardDateColumn = dSheet && standardMappedDate
        ? (roomId === 10
          ? dSheet.columns.find(column => column.index === 11 && normalize(column.header) === 'waktu permintaan')?.key ||
            exactWorkbookColumn(dSheet.columns, standardMappedDate)
          : exactWorkbookColumn(dSheet.columns, standardMappedDate))
        : ''
      const nextData: Record<string, string> = dSheet ? {
        date: standardDateColumn || (isolasiColumns ? findHeader(dSheet.headers, ['Tanggal Masuk']) : pick(findSaved('field', 'field:record_date'), 'Tanggal', DATA_FIELD_SYNONYMS.date)),
        subject_key: pick(findSaved('field','field:subject_key'), 'No. RM', DATA_FIELD_SYNONYMS.subject_key),
        patient_name: pick(findSaved('field','field:patient_name'), 'Nama pasien', DATA_FIELD_SYNONYMS.patient_name),
        diagnosis: pick(findSaved('field','field:diagnosis'), 'Diagnosis', DATA_FIELD_SYNONYMS.diagnosis),
        dpjp: pick(findSaved('field','field:dpjp'), 'DPJP', DATA_FIELD_SYNONYMS.dpjp),
      } : {}
      setDataColumns(nextData)
      const nextIndicators: Record<string, string> = {}
      const nextNums: Record<string, string> = {}
      const nextDens: Record<string, string> = {}
      for (const p of activeProfiles) {
        const schema = p.schema_json ?? {}
        const mapping = schema.excel_mapping ?? {}
        const exactStandardColumn = standardMappedDate && dSheet
          ? aliasesFor(p).map(alias => exactWorkbookColumn(dSheet.columns, alias)).find(Boolean)
          : ''
        nextIndicators[p.code] = isolasiColumns ? (isolasiColumns[p.code] ?? '') : exactStandardColumn || pick(findSaved('indicator', 'indicator:' + p.code), p.code + ' · ' + p.title, [
          mapping.indicator_header, schema.header_label, p.code, p.title, ...aliasesFor(p),
        ])
        nextNums[p.code] = findSaved('field', 'field:' + p.code + ':numerator') ?? findHeader(dSheet?.headers ?? [], [mapping.numerator_header, p.code + ' numerator'].filter(Boolean))
        nextDens[p.code] = findSaved('field', 'field:' + p.code + ':denominator') ?? findHeader(dSheet?.headers ?? [], [mapping.denominator_header, p.code + ' denominator'].filter(Boolean))
      }
      setIndicatorColumns(nextIndicators)
      setNumeratorColumns(nextNums)
      setDenominatorColumns(nextDens)
      pendingLogbookPreview.current = dataOnly && Boolean(dSheet)
      const blockNote = dSheet ? `Tabel data ditemukan di sheet "${dSheet.name}", judul kolom di baris ${dSheet.headerRow}. ` : ''
      const guessNote = guessed.length ? `${guessed.length} kolom dicocokkan berdasarkan kemiripan nama (${guessed.slice(0, 6).join('; ')}${guessed.length > 6 ? '; …' : ''}), mohon dicek. ` : ''
      setNotice(blockNote + guessNote + 'Periksa kembali peran sheet dan pemetaan setiap kolom sebelum membuat pratinjau. Aturan tersimpan per unit akan dipakai kembali. Baris data tidak dikirim ke NARA.')
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Workbook gagal dibaca. Pastikan berkas bukan hasil ekspor rusak atau dilindungi kata sandi.' }))
    }
  }

  // An inbox selection is inspected exactly once for this scoped importer
  // instance. Files remain in browser memory until the user validates/commits.
  useEffect(() => {
    if (!initialFile || lastInitialFile.current === initialFile) return
    lastInitialFile.current = initialFile
    setBusy(true)
    void inspect(initialFile).finally(() => setBusy(false))
    // The parent remounts this importer when room/year/workbook changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialFile])

  const sheetRows = (sheetName: string, headerRow: number): Array<{ rowNumber: number; values: Record<string, any> }> => {
    const sheet = workbookRef.current?.getWorksheet(sheetName)
    if (!sheet) return []
    const columns = readWorkbookSourceColumns(sheet.getRow(headerRow))
    const rows: Array<{ rowNumber: number; values: Record<string, any> }> = []
    for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber)
      const values: Record<string, any> = {}
      for (const column of columns) {
        const value = asCell(row.getCell(column.index).value)
        if (value != null && clean(value) !== '') values[column.key] = value
      }
      if (Object.keys(values).length) rows.push({ rowNumber, values })
    }
    return rows
  }

  async function persistMappings(profiles: Profile[]) {
    if (!dataScope || !canSaveMappings) return 0
    const rules: Array<Record<string, unknown>> = []
    const source = { source_sheet: dataSheet, header_row: dataHeaderRow }
    const add = (type: 'indicator' | 'field', target: string, title: string, key: string, code?: string) => {
      const column = dataScope.columns.find(item => item.key === key)
      if (!column) return
      rules.push({ target_type: type, target_key: type + ':' + target, target_label: title,
        source_header: column.header, occurrence: column.occurrence,
        transform_json: { ...source, column_index: column.index, column_letter: column.letter }, indicator_code: code })
    }
    for (const [field, value] of Object.entries(dataColumns)) {
      add('field', field === 'date' ? 'record_date' : field, field, value)
    }
    for (const profile of profiles) {
      add('indicator', profile.code, profile.code + ' · ' + profile.title, indicatorColumns[profile.code], profile.code)
      add('field', profile.code + ':numerator', profile.code + ' · Pembilang', numeratorColumns[profile.code])
      add('field', profile.code + ':denominator', profile.code + ' · Penyebut', denominatorColumns[profile.code])
    }
    if (!rules.length) return 0
    if (rules.length > 200) throw new Error('Simpan tautan untuk maksimal 200 kolom per unit.')
    const { data, error } = await q().rpc('quality_excel_header_mapping_upsert_bulk', {
      p_room_id: roomId, p_profile_year: year, p_importer_key: importerKey,
      p_rules: rules, p_decision_note: 'Kolom sumber workbook ditautkan melalui Indikator Mutu.',
    })
    if (error) throw error
    window.dispatchEvent(new CustomEvent('aureka:excel-mappings-updated', { detail: { roomId, year } }))
    return Number(data?.saved_count ?? rules.length)
  }

  async function saveSelectedMappings() {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      const saved = await persistMappings(activeProfiles)
      if (!saved) throw new Error('Tautkan minimal satu kolom sebelum menyimpan.')
      setNotice(saved.toLocaleString('id-ID') + ' tautan kolom tersimpan.')
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Tautan kolom belum dapat disimpan.' }))
    } finally { setBusy(false) }
  }

  const buildPreview = async () => {
    setError(''); setNotice(''); setPreview(null)
    if (!workbookRef.current || !fileRef.current) { setError('Unggah workbook terlebih dahulu.'); return }
    if (!roomId || !importerKey) { setError('Unit dan jenis workbook wajib dipilih.'); return }
    const issues: ImportIssue[] = []
    const profileRows = importMode === 'data_only' ? [] : sheetRows(profileSheet, profileHeaderRow)
    const optionRows = importMode !== 'data_only' && optionsSheet ? sheetRows(optionsSheet, optionsHeaderRow) : []
    const sourceDataRows = importMode === 'profiles_only' ? [] : sheetRows(dataSheet, dataHeaderRow)
    if (importMode !== 'data_only' && (!profileSheet || !profileRows.length)) issues.push({ sheet: profileSheet || '-', row: 0, field: 'Profil Indikator', message: 'Sheet profil tidak ditemukan atau tidak berisi baris data.' })
    if (importMode !== 'profiles_only' && (!dataSheet || !sourceDataRows.length)) issues.push({ sheet: dataSheet || '-', row: 0, field: 'Logbook', message: 'Sheet logbook tidak ditemukan atau tidak berisi baris data.' })

    let profiles: Profile[] = []
    if (importMode !== 'data_only') {
      const get = (row: Record<string, any>, key: string) => clean(row[profileColumns[key] ?? ''])
      const optionGroups = new Map<string, Array<Record<string, any>>>()
      for (const item of optionRows) {
        const code = clean(item.values[optionColumns.indicator_code ?? ''])
        const label = clean(item.values[optionColumns.label ?? ''])
        const optionCode = clean(item.values[optionColumns.code ?? ''])
        if (!code || !label) continue
        const list = optionGroups.get(code) ?? []
        list.push({
          label, code: numberValue(optionCode),
          review_required: /^(true|1|ya|yes)$/i.test(clean(item.values[optionColumns.review_required ?? ''])),
        })
        optionGroups.set(code, list)
      }
      for (const row of profileRows) {
        try {
          const code = get(row.values, 'code')
          const title = get(row.values, 'title')
          const grain = grainValue(get(row.values, 'measurement_grain'))
          if (!code || !title || !['patient_episode', 'provider_day', 'daily_metric', 'event', 'activity', 'aggregate'].includes(grain)) {
            throw new Error('Kode, nama indikator, dan grain pengukuran wajib dipetakan serta diisi.')
          }
          let schema = parseJson(get(row.values, 'schema_json'), {}, 'Schema JSON')
          if (!schema || typeof schema !== 'object' || Array.isArray(schema)) throw new Error('Schema JSON harus berupa objek.')
          const inlineOptions = parseJson(get(row.values, 'options_json'), [], 'Opsi JSON')
          if (!Array.isArray(inlineOptions)) throw new Error('Opsi JSON harus berupa daftar.')
          const options = inlineOptions.length ? inlineOptions : (optionGroups.get(code) ?? [])
          if (options.some(option => option.code != null && ![1, 2, 3].includes(Number(option.code)))) throw new Error('Kode opsi hanya boleh 1, 2, atau 3.')
          const rawMeasurementType = get(row.values, 'measurement_type') || clean(schema.measurement_type) || ''
          const normalizedMeasurement = normalize(rawMeasurementType)
          const measurementAliases: Record<string, string> = {
            rasio: 'ratio', proporsi: 'ratio', persentase: 'ratio', percentage: 'ratio',
            kepatuhan: 'compliance', kepatuhan_1_2_3: 'compliance',
            'waktu kunjungan': 'visit_window', 'jam visite': 'visit_window',
            'door to decision': 'door_to_decision', 'door-to-decision': 'door_to_decision',
            menit: 'minutes', durasi: 'minutes', 'waktu respons': 'minutes', 'response time': 'minutes',
            numerik: 'numeric', angka: 'numeric', kejadian: 'occurrence',
          }
          const measurementType = measurementAliases[normalizedMeasurement] ?? rawMeasurementType
          const rawDirection = get(row.values, 'indicator_direction') || clean(schema.indicator_direction) || ''
          const directionText = normalize(rawDirection)
          const direction = /positive|positif|meningkat|lebih tinggi lebih baik/.test(directionText)
            ? 'positive'
            : /negative|negatif|menurun|lebih rendah lebih baik/.test(directionText) ? 'negative' : rawDirection
          if (measurementType) schema = { ...schema, measurement_type: measurementType }
          if (direction) schema = { ...schema, indicator_direction: direction }
          const rawCaptureMode = get(row.values, 'response_capture_mode')
          const captureText = normalize(rawCaptureMode)
          const captureMode = /categor|dropdown|pilihan|coded/.test(captureText) ? 'categorical' : rawCaptureMode
          if (captureMode) schema = { ...schema, response_capture_mode: captureMode }
          if (!schema.response_capture_mode && grain === 'patient_episode' &&
              ['positive', 'negative'].includes(normalize(direction)) &&
              options.filter((option: any) => [1, 2, 3].includes(Number(option.code))).length >= 2 &&
              !['minutes', 'numeric', 'visit_window', 'door_to_decision'].includes(normalize(measurementType))) {
            schema = { ...schema, response_capture_mode: 'categorical' }
          }
          if (normalize(schema.response_capture_mode) && ['categorical', 'coded_choice', 'option_response'].includes(normalize(schema.response_capture_mode))) {
            const coded = options.filter((option: any) => [1, 2, 3].includes(Number(option.code)))
            if (coded.length < 2 || options.some((option: any) => option.code != null && ![1, 2, 3].includes(Number(option.code)))) {
              throw new Error('Profil kategorikal wajib memiliki sekurang-kurangnya dua opsi berkode 1, 2, atau 3.')
            }
          }
          const targetValue = get(row.values, 'target_value')
          profiles.push({
            code, source_code: code, room_id: roomId, unit_name: roomName,
            title, indicator_type: get(row.values, 'indicator_type') || null,
            category: get(row.values, 'category') || null,
            unit_of_measure: get(row.values, 'unit_of_measure') || null,
            target_text: get(row.values, 'target_text') || null,
            target_operator: get(row.values, 'target_operator') || (clean(get(row.values, 'target_text')).match(/^\s*(<=|>=|≤|≥|<|>)/)?.[1] ?? '='),
            target_value: targetValue ? numberValue(targetValue) : null,
            numerator_definition: get(row.values, 'numerator_definition') || null,
            denominator_definition: get(row.values, 'denominator_definition') || null,
            measurement_grain: grain, schema_json: schema, options_json: options,
          })
        } catch (cause) {
          issues.push({ sheet: profileSheet, row: row.rowNumber, field: get(row.values, 'code') || 'profil', message: cause instanceof Error ? cause.message : 'Profil tidak valid.' })
        }
      }
      const codes = profiles.map(p => p.code.toUpperCase())
      if (new Set(codes).size !== codes.length) issues.push({ sheet: profileSheet, row: 0, field: 'Kode indikator', message: 'Terdapat kode indikator duplikat.' })
    } else {
      profiles = activeProfiles
    }

    const rows: StagedRow[] = []
    const heldRows: ImportIssue[] = []
    const seenSourceKeys = new Set<string>()
    let skippedTemplateRows = 0
    const excludedIsolasiRows: number[] = []
    const isolasiColumns = roomId === 24 && year === 2026 && dataSheet === 'Logbook' && dataScope
      ? getIsolasiWorkbookIndicatorColumns(dataScope.columns) : null
    if (importMode !== 'profiles_only') {
      if (!dataColumns.date) issues.push({ sheet: dataSheet || '-', row: 0, field: 'Tanggal', message: 'Kolom tanggal wajib dipetakan agar catatan tidak hilang dari filter tahun laporan.' })
      if (importMode === 'data_only' && !activeProfiles.length) issues.push({ sheet: '-', row: 0, field: 'Profil aktif', message: 'Tidak ada profil indikator aktif untuk unit dan tahun terpilih.' })
      for (const source of sourceDataRows) {
        const identityAndDateColumns = Object.values(dataColumns).filter(Boolean)
        const responseColumns = [
          ...Object.values(indicatorColumns), ...Object.values(numeratorColumns),
          ...Object.values(denominatorColumns),
        ].filter(Boolean)
        if (!isMaterialWorkbookSourceRow(source.values, identityAndDateColumns, responseColumns)) {
          // Numbered blank PMKP template rows and cached formula errors are not cases.
          // Real rows with a person/date/selected observation still reach validation.
          skippedTemplateRows++
          continue
        }
        if (isolasiColumns && dataColumns.date && !clean(source.values[dataColumns.date])) {
          excludedIsolasiRows.push(source.rowNumber)
          continue
        }
        const readDate = (value: unknown) => parseDate(typeof value === 'number' && workbookRef.current?.properties.date1904 ? value + 1462 : value)
        const recordDate = readDate(source.values[dataColumns.date])
        const readExact = (header: string) => source.values[exactWorkbookColumn(dataScope?.columns ?? [], header)]
        const sourceSequence = isStandardMappedLogbook ? clean(readExact('No.')) || clean(readExact('No')) : ''
        const byGrain = new Map<string, any[]>()
        for (const profile of profiles) {
          const schemaMapping = profile.schema_json?.excel_mapping ?? {}
          const valueHeader = indicatorColumns[profile.code] ?? findHeader(dataHeaders, [schemaMapping.indicator_header, profile.schema_json?.header_label, profile.code, profile.title, ...aliasesFor(profile)].filter(Boolean))
          const numeratorHeader = numeratorColumns[profile.code] ?? findHeader(dataHeaders, [schemaMapping.numerator_header].filter(Boolean))
          const denominatorHeader = denominatorColumns[profile.code] ?? findHeader(dataHeaders, [schemaMapping.denominator_header].filter(Boolean))
          let rawCell = valueHeader ? source.values[valueHeader] : null
          let elapsedMinutes: number | null = null
          if (isStandardMappedLogbook && roomId === 29 && profile.code === '29.1' && (!clean(rawCell) || isExcelSourceError(rawCell))) {
            elapsedMinutes = getIncidentReportElapsedMinutes(
              readDate(readExact('Tanggal Insiden')), readExact('Jam Insiden'),
              readDate(readExact('Tanggal Lapor')), readExact('Jam Lapor'),
            )
            if (elapsedMinutes != null) {
              rawCell = elapsedMinutes < 2880
                ? 'Laporan Masuk Tepat Waktu (< 2x24 Jam) (Code 1)'
                : 'Laporan Masuk Terlambat (≥ 2x24 Jam) (Code 3)'
            }
          }
          const numeratorCell = numeratorHeader ? source.values[numeratorHeader] : null
          const denominatorCell = denominatorHeader ? source.values[denominatorHeader] : null
          const hasValue = [rawCell, numeratorCell, denominatorCell].some(value => value !== null && value !== undefined && clean(value) !== '')
          if (!hasValue) continue
          try {
            // Formula cache errors must never turn into zero, a valid answer,
            // or a patient observation during a clinical import.
            const excelError = [rawCell, numeratorCell, denominatorCell].find(value =>
              isExcelSourceError(value),
            )
            if (excelError) throw new Error('Sumber Excel berisi error ' + excelError + '. Perbaiki sumber/pemetaan sebelum impor.')
            const kind = resolveMeasurementKind(profile)
            const standardChoice = isStandardMappedLogbook && ((valueHeader && aliasesFor(profile)
              .some(alias => normalize(alias) === normalize(headerText(valueHeader)))) || elapsedMinutes != null)
              && (profile.options_json ?? []).some(option => [1, 2, 3].includes(Number(option.code)))
            const categorical = standardChoice || usesCategoricalResponseCapture(profile) || shouldUseIndicatorDropdown(profile as any)
            let response: Record<string, any> = { indicator_code: profile.code, response_label: null, response_code: null, raw_value: {}, review_status: 'not_required' }
            if (valueHeader && isolasiColumns?.[profile.code] === valueHeader) {
              const answer = parseIsolasiSourceAnswer(clean(rawCell), profile.options_json as IsolasiIndicatorOption[], profile.code)
              if (!answer) continue
              response.response_label = answer.label
              response.response_code = answer.code
              response.raw_value = {
                answer: answer.label, code: answer.code, numerator: answer.numerator,
                denominator: answer.denominator, source_value: answer.sourceLabel,
                source_code: answer.sourceCode, review_required: answer.reviewRequired,
                mapping_status: answer.mappingStatus,
              }
              response.other_text = answer.sourceLabel
              response.review_status = answer.reviewRequired ? 'pending' : 'not_required'
            } else if (categorical) {
              const option = optionForValue(profile, rawCell)
              if (!option || (option.code != null && ![1, 2, 3].includes(Number(option.code)))) {
                if (!standardChoice) throw new Error('Nilai "' + clean(rawCell) + '" tidak cocok tepat dengan opsi profil. Periksa pemetaan atau master opsi.')
                const sourceValue = clean(rawCell)
                const choice = readCodedWorkbookChoice(sourceValue)
                response.response_label = choice.label || sourceValue
                response.raw_value = { answer: response.response_label, code: null, source_value: sourceValue,
                  source_code: choice.sourceCode, review_required: true }
                response.other_text = sourceValue
                response.review_status = 'pending'
              } else {
                response.response_label = String(option.label)
                response.response_code = option.code == null ? null : Number(option.code)
                response.raw_value = { answer: String(option.label), code: response.response_code }
                response.review_status = option.review_required ? 'pending' : 'not_required'
                if (standardChoice) {
                  response.raw_value.source_value = clean(rawCell)
                  if (elapsedMinutes != null) response.raw_value.elapsed_minutes = elapsedMinutes
                }
              }
            } else if (kind === 'ratio') {
              let numerator = numberValue(numeratorCell), denominator = numberValue(denominatorCell)
              if (numerator == null || denominator == null) {
                const ratio = clean(rawCell).match(/^([\d.,]+)\s*\/\s*([\d.,]+)$/)
                if (ratio) { numerator = numberValue(ratio[1]); denominator = numberValue(ratio[2]) }
              }
              if (numerator == null || denominator == null || denominator <= 0 || numerator < 0 || numerator > denominator) {
                throw new Error('Rasio memerlukan kolom pembilang dan penyebut yang valid; pilih kedua kolom atau gunakan nilai n/d.')
              }
              response.raw_value = { numerator, denominator }
            } else if (kind === 'door') {
              const pair = clockPair(clean(rawCell))
              if (!pair) throw new Error('Durasi door-to-decision harus berbentuk jam mulai–jam selesai.')
              response.raw_value = pair
            } else if (kind === 'visit') {
              if (!/^\d{1,2}:\d{2}$/.test(clean(rawCell))) throw new Error('Waktu kunjungan harus berbentuk HH:MM.')
              response.raw_value = { time: clean(rawCell).padStart(5, '0'), answer: 'Ya', code: 1 }
              response.response_label = 'Ya'; response.response_code = 1
            } else if (kind === 'minutes' || kind === 'numeric') {
              const value = numberValue(rawCell)
              if (value == null || value < 0) throw new Error('Nilai numerik/durasi harus berupa angka nol atau lebih.')
              response.raw_value = kind === 'minutes' ? { minutes: value } : { value }
            } else if (kind === 'occurrence') {
              const option = optionForValue(profile, rawCell)
              if (option) {
                response.response_label = String(option.label)
                response.response_code = option.code == null ? null : Number(option.code)
                response.raw_value = { answer: String(option.label), code: response.response_code }
                response.review_status = option.review_required ? 'pending' : 'not_required'
              } else {
                const text = normalize(rawCell)
                if (['ya', 'terjadi', 'ada', 'ditemukan'].includes(text)) { response.response_label = 'Terjadi'; response.response_code = 3; response.raw_value = { occurrence: 'Terjadi', code: 3 } }
                else if (['tidak', 'tidak terjadi', 'nihil', 'tidak ada'].includes(text)) { response.response_label = 'Tidak terjadi'; response.response_code = 1; response.raw_value = { occurrence: 'Tidak terjadi', code: 1 } }
                else throw new Error('Klasifikasi kejadian tidak cocok dengan opsi profil.')
              }
            } else {
              const option = optionForValue(profile, rawCell)
              if (!option) throw new Error('Nilai respons tidak cocok dengan opsi profil indikator.')
              response.response_label = String(option.label)
              response.response_code = option.code == null ? null : Number(option.code)
              response.raw_value = { answer: String(option.label), code: response.response_code }
              response.review_status = option.review_required ? 'pending' : 'not_required'
            }
            const grain = grainValue(profile.measurement_grain)
            if (!['patient_episode', 'provider_day', 'daily_metric', 'event', 'activity', 'aggregate'].includes(grain)) throw new Error('Grain pengukuran profil tidak valid atau belum ditetapkan.')
            const group = byGrain.get(grain) ?? []
            group.push(response)
            byGrain.set(grain, group)
          } catch (cause) {
            issues.push({ sheet: dataSheet, row: source.rowNumber, field: profile.code, message: cause instanceof Error ? cause.message : 'Respons tidak valid.' })
          }
        }
        for (const [grain, responses] of byGrain.entries()) {
          const dateValue = recordDate
          const rowIssues = isStandardMappedLogbook && dataColumns.date ? heldRows : issues
          const subjectHeader = dataColumns.subject_key
          const nameHeader = dataColumns.patient_name
          const diagnosisHeader = dataColumns.diagnosis
          const dpjpHeader = dataColumns.dpjp
          const formFields = Object.fromEntries((dataScope?.columns ?? []).flatMap(column =>
            Object.hasOwn(source.values, column.key) ? [[column.occurrence === 1 ? column.header : column.key, source.values[column.key]]] : [],
          ))
          const sourceDiagnosis = dataColumns.diagnosis ? clean(source.values[dataColumns.diagnosis]) : ''
          const applicableProfiles = profiles.filter(profile =>
            grainValue(profile.measurement_grain) === grain &&
            (!isolasiColumns || Boolean(indicatorColumns[profile.code])) &&
            isIndicatorApplicableToDiagnosis(profile.indicator_type, sourceDiagnosis))
          // The verified unit workbook measures only the observations present for
          // each episode (for example Hifema or a specific radiology event).
          // Its unused indicator cells must not keep measured results in draft.
          const isReady = isStandardMappedLogbook
            ? responses.some(response => response.review_status === 'not_required' && response.response_code != null)
            : applicableProfiles.length > 0 && applicableProfiles.every(profile =>
              responses.some(response => response.indicator_code === profile.code))
          if (!dateValue) {
            rowIssues.push({ sheet: dataSheet, row: source.rowNumber, field: 'Tanggal', message: 'Tanggal pengamatan tidak valid atau belum dipetakan.' })
            continue
          }
          if (Number(dateValue.slice(0,4)) !== year) {
            rowIssues.push({ sheet: dataSheet, row: source.rowNumber, field: 'Tanggal', message: 'Tanggal data berada di luar tahun profil yang dipilih.' })
            continue
          }
          const payload = {
            record_payload: {
              room_id: roomId, profile_year: year, measurement_grain: grain,
              record_date: dateValue, subject_key: subjectHeader ? clean(source.values[subjectHeader]) || null : null,
              subject_json: {
                patient_name: nameHeader ? clean(source.values[nameHeader]) : '',
                medical_record_no: subjectHeader ? clean(source.values[subjectHeader]) : '',
                diagnosis: diagnosisHeader ? clean(source.values[diagnosisHeader]) : '',
                dpjp: dpjpHeader ? clean(source.values[dpjpHeader]) : '',
              },
              core_data: {
                form_fields: formFields, import_source: 'AUREKA Excel Workbook Import V2',
                record_date: dateValue,
                indicator_values: Object.fromEntries(responses.map(response => [
                  response.indicator_code,
                  { ...response.raw_value, review_status: response.review_status },
                ])),
              },
              status: isReady ? 'ready' : 'draft',
              review_required: responses.some(r => r.review_status === 'pending'),
            },
            responses, attributions: [],
          }
          const mappedIdentity = subjectHeader ? clean(source.values[subjectHeader]) : ''
          const identity = isStandardMappedLogbook && roomId === 29 && /^\d+$/.test(sourceSequence)
            ? 'insiden:' + sourceSequence : mappedIdentity
          if (!identity && (dataMode === 'upsert' || grain === 'patient_episode' || (roomId === 29 && grain === 'event'))) {
            rowIssues.push({ sheet: dataSheet, row: source.rowNumber, field: 'Identitas sumber',
              message: 'Data episode pasien, insiden, dan Upsert memerlukan ID yang stabil (No. RM/ID episode/ID insiden). Nomor baris dan hash berkas tidak dapat menjadi bukti episode unik lintas versi workbook.' })
            continue
          }
          const identityParts = [roomId, year, importerKey, dataSheet, grain,
            identity ? identity.normalize('NFKC').toUpperCase().replace(/\s+/g, '') : fileHash + ':' + source.rowNumber,
            identity ? dateValue : null]
          let sourceKey = await hash(JSON.stringify(identityParts))
          if (isStandardMappedLogbook && seenSourceKeys.has(sourceKey) && /^\d+$/.test(sourceSequence)) {
            sourceKey = await hash(JSON.stringify([...identityParts, 'no-sumber', sourceSequence]))
          }
          if (seenSourceKeys.has(sourceKey)) {
            rowIssues.push({ sheet: dataSheet, row: source.rowNumber, field: 'Identitas episode', message: 'ID subjek dan tanggal sama pada grain yang sama. Gunakan ID episode unik agar data tidak saling menimpa.' })
            continue
          }
          seenSourceKeys.add(sourceKey)
          rows.push({ source_key: sourceKey, source_sheet: dataSheet, source_row: source.rowNumber, row_payload: payload })
        }
      }
    }
    if (rows.length > 10000) issues.push({ sheet: dataSheet, row: 0, field: 'Batas impor', message: 'Jumlah record hasil pemetaan melebihi batas 10.000 per batch.' })
    if (importMode !== 'profiles_only' && !rows.length) issues.push({ sheet: dataSheet || '-', row: 0, field: 'Respons',
      message: isStandardMappedLogbook && roomId === 31
        ? 'Kolom Kontrol Dokter belum berisi hasil pengukuran. Isi hasil kontrol yang tercatat untuk membuat respons 31.1.'
        : 'Tidak ada respons indikator valid yang dapat disimpan.' })
    setPreview({ heldRows, master: activeProfiles, profiles, rows, issues, workbookRows: sourceDataRows.length, skippedTemplateRows, draftRows: rows.filter(row => row.row_payload.record_payload.status === 'draft').length })
    const pendingSourceResponses = isolasiColumns || isStandardMappedLogbook
      ? rows.reduce((total, row) => total + row.row_payload.responses.filter((response: Record<string, unknown>) =>
        response.review_status === 'pending').length, 0)
      : 0
    if (issues.length) setError('Pratinjau menemukan ' + issues.length.toLocaleString('id-ID') + ' masalah. Perbaiki pemetaan atau nilai sumber sebelum commit.')
    else setNotice('Pratinjau valid: ' + profiles.length.toLocaleString('id-ID') + ' profil, ' + rows.length.toLocaleString('id-ID') + ' record, ' + sourceDataRows.length.toLocaleString('id-ID') + ' baris sumber. ' + rows.filter(row => row.row_payload.record_payload.status === 'draft').length.toLocaleString('id-ID') + ' record parsial akan tetap draf.'
      + (excludedIsolasiRows.length ? ' Tanggal Masuk kosong pada baris Excel ' + excludedIsolasiRows.slice(0, 20).join(', ') + (excludedIsolasiRows.length > 20 ? ', …' : '') + '. Jumlah baris dilewati: ' + excludedIsolasiRows.length + '.' : '')
      + (pendingSourceResponses ? ' ' + pendingSourceResponses + ' respons sumber memerlukan peninjauan. Isi asli akan disimpan.' : ''))
  }

  const runImport = async () => {
    if (busy || !preview || preview.issues.length || (importMode !== 'data_only' && !preview.profiles.length)) return
    if (importMode !== 'data_only' && activeProfiles.length > 0 && !replaceConfirmed) {
      setError('Impor set profil penuh akan memensiunkan versi master yang aktif. Centang persetujuan eksplisit sebelum melanjutkan; gunakan impor penambahan profil yang belum ada untuk mempertahankan master.')
      return
    }
    if (importMode !== 'data_only' && !roleCanImportProfiles) { setError('Hanya Superadmin yang dapat mengimpor profil indikator.'); return }
    if (importMode !== 'profiles_only' && !preview.rows.length) { setError('Belum ada record valid untuk diimpor.'); return }
    if (!fileHash) { setError('Hash workbook belum tersedia; unggah ulang berkas.'); return }
    setBusy(true); setError(''); setNotice(''); setBatchId('')
    let createdBatch = ''
    try {
      const { data: created, error: createError } = await q().rpc('create_quality_import_batch', {
        p_room_id: roomId, p_profile_year: year, p_importer_key: importerKey,
        p_file_name: fileName, p_file_sha256: fileHash,
        p_import_mode: importMode, p_data_mode: dataMode,
        p_profiles: importMode === 'data_only' ? [] : preview.profiles,
        p_expected_rows: importMode === 'profiles_only' ? 0 : preview.rows.length,
      })
      if (createError) throw createError
      createdBatch = String(created?.batch_id ?? '')
      if (!createdBatch) throw new Error('Server tidak mengembalikan identitas batch impor.')
      setBatchId(createdBatch)
      for (let index = 0; index < preview.rows.length; index += 200) {
        const chunk = preview.rows.slice(index, index + 200)
        const { error: stageError } = await q().rpc('stage_quality_import_batch_rows', {
          p_batch_id: createdBatch, p_rows: chunk,
        })
        if (stageError) throw stageError
      }
      const { data: validation, error: validationError } = await q().rpc('validate_quality_import_batch', { p_batch_id: createdBatch })
      if (validationError) throw validationError
      if (validation?.status !== 'validated') throw new Error('Server belum menyatakan batch lolos validasi.')
      const { data: committed, error: commitError } = await q().rpc('commit_quality_import_batch', { p_batch_id: createdBatch })
      if (commitError) throw commitError
      if (committed?.status !== 'committed') throw new Error('Server belum menyatakan batch berhasil di-commit.')

      let mappingSaved = 0
      if (canSaveMappings && importMode !== 'profiles_only') {
        try { mappingSaved = await persistMappings(importMode === 'data_only' ? activeProfiles : preview.profiles) }
        catch (cause) { setError('Data sudah tersimpan. Tautan belum tersimpan: ' + toUserFacingError(cause)) }
      }
      setNotice('Impor selesai. ' + Number(committed.imported_rows ?? 0).toLocaleString('id-ID') +
        ' record tersimpan dan ' + Number(committed.profile_count ?? 0).toLocaleString('id-ID') +
        ' profil diproses. ' + mappingSaved.toLocaleString('id-ID') + ' aturan kolom disimpan untuk impor berikutnya. Batch: ' + createdBatch)
      setBatchId('')
      setPreview(null)
      // Release all original workbook references after a successful structured import.
      workbookRef.current = null
      fileRef.current = null
      setSheets([])
      setFileName('')
      setFileHash('')
      onImported()
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Impor belum selesai. Batch staging dipertahankan untuk pemeriksaan; tidak ada commit parsial.' }))
    } finally {
      setBusy(false)
    }
  }

  const cancelBatch = async () => {
    if (!batchId) return
    setBusy(true); setError('')
    try {
      const { error: rpcError } = await q().rpc('cancel_quality_import_batch', { p_batch_id: batchId })
      if (rpcError) throw rpcError
      setNotice('Batch staging dibatalkan. Baris staging akan ikut dibersihkan pada reset domain mutu atau proses retensi terjadwal.')
      setBatchId('')
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Batch tidak dapat dibatalkan.' }))
    } finally { setBusy(false) }
  }

  const previewWorkbook = async () => {
    if (busy) return
    setBusy(true)
    try {
      await buildPreview()
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Pratinjau gagal dibuat. Periksa workbook yang dipilih.' }))
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    if (!pendingLogbookPreview.current || busy) return
    pendingLogbookPreview.current = false
    void previewWorkbook()
  })

  const selectStyle: CSSProperties = { width: '100%', minHeight: 44, border: '1px solid var(--aureka-dialog-edge)', borderRadius: 8, padding: '6px 8px', background: 'var(--aureka-dialog-surface)', color: 'var(--aureka-color-foreground)', fontSize: 12 }
  const fieldStyle: CSSProperties = { display: 'grid', gap: 4, minWidth: 0, color: 'var(--aureka-color-foreground-secondary)', fontSize: 11, fontWeight: 700 }
  const mappingSelect = (headers: string[], value: string, onChange: (value: string) => void, label: string) => (
    <label style={fieldStyle}>{label}
      <select style={selectStyle} value={value} disabled={busy} onChange={event => { onChange(event.target.value); setPreview(null) }}>
        <option value="">— Tidak dipetakan —</option>
        {headers.map(header => <option key={header} value={header}>{header}</option>)}
      </select>
    </label>
  )

  return <section className="qwiImportPanel" aria-busy={busy}>
    <h3>{profilesOnly ? 'Impor profil indikator' : dataOnly ? 'Impor logbook' : 'Impor profil dan logbook dari Excel'}</h3>
    {profilesOnly && <p className="qwiHint">Pilih workbook berisi sheet profil indikator. Periksa daftar profil sebelum menyimpannya.</p>}
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 175px),1fr))', gap: 9 }}>
      {!dataOnly && !profilesOnly && <label style={fieldStyle}>Mode impor
        <select style={selectStyle} value={importMode} disabled={busy || !roleCanImportProfiles} onChange={event => { setImportMode(event.target.value as any); setReplaceConfirmed(false); setPreview(null) }}>
          {roleCanImportProfiles && <option value="profiles_and_data">Profil + Data logbook</option>}
          {roleCanImportProfiles && <option value="profiles_only">Profil indikator saja</option>}
          <option value="data_only">Data logbook saja</option>
        </select>
      </label>}
      {!profilesOnly && <label style={fieldStyle}>Perlakuan baris data
        <select style={selectStyle} value={dataMode} disabled={busy || importMode === 'profiles_only'} onChange={event => { setDataMode(event.target.value as 'append' | 'upsert'); setPreview(null) }}>
          <option value="append">Append · Tolak duplikasi</option>
          <option value="upsert">Upsert · Perbarui draf yang belum divalidasi</option>
        </select>
      </label>}
      <label style={fieldStyle}>{profilesOnly ? 'Workbook profil (.xlsx)' : dataOnly ? 'Workbook logbook (.xlsx)' : 'Workbook .xlsx'}
        <input type="file" accept=".xlsx" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) { setBusy(true); void inspect(file).finally(() => setBusy(false)) }; event.currentTarget.value = '' }} style={{ ...selectStyle, padding: '6px 8px' }}/>
      </label>
    </div>
    {busy && <p className="qwiHint" role="status">Memproses workbook…</p>}
    {fileName && <div style={{ fontSize: 11, color: 'var(--aureka-color-foreground-secondary)' }}>File: <strong>{fileName}</strong> · {sheets.length} worksheet terdeteksi · SHA-256 aktif</div>}
    {preview?.heldRows.length ? <details role="status">
      <summary>{new Set(preview.heldRows.map(issue => issue.row)).size} baris sumber memerlukan koreksi sebelum bisa diimpor</summary>
      <ul>{preview.heldRows.slice(0, 40).map((issue, index) =>
        <li key={index}>Baris {issue.row} · {issue.message}</li>)}</ul>
      {preview.heldRows.length > 40 && <p>Menampilkan 40 temuan pertama.</p>}
    </details> : null}
    {sourceNotes.length > 0 && <div role="status" style={{fontSize:12,lineHeight:1.55,color:'#6c6045',padding:10,border:'1px solid #e9dfc5',borderRadius:9,background:'#fffcf3'}}>
      {sourceNotes.map((item,index)=><p key={index} style={{margin:index?'5px 0 0':0}}>{item}</p>)}
    </div>}

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" disabled={!sheets.length || busy} onClick={() => void previewWorkbook()} style={{ border: 0, borderRadius: 8, padding: '9px 13px', background: '#e9f2f7', color: '#26536e', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>{profilesOnly ? 'Pratinjau profil' : dataOnly ? 'Pratinjau logbook' : 'Periksa data'}</button>
      <button type="button" disabled={!preview || !!preview.issues.length || busy || (importMode !== 'data_only' && !preview.profiles.length) || (importMode !== 'profiles_only' && !preview.rows.length) || (importMode !== 'data_only' && activeProfiles.length > 0 && !replaceConfirmed)} onClick={() => void runImport()} style={{ border: 0, borderRadius: 8, padding: '9px 13px', background: '#176d4d', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>{busy ? 'Memproses…' : profilesOnly ? 'Impor profil' : dataOnly ? 'Impor logbook' : 'Impor data terverifikasi'}</button>
      {canSaveMappings && dataSheet && importMode === 'data_only' && <button type="button" disabled={busy}
        className="workspaceSecondaryButton" onClick={() => void saveSelectedMappings()}>Simpan tautan kolom</button>}
      {batchId && <button type="button" disabled={busy} onClick={() => void cancelBatch()} style={{ border: '1px solid #e1d4ce', borderRadius: 8, padding: '9px 13px', background: '#fff', color: '#8d5142', fontWeight: 750, fontSize: 12, cursor: 'pointer' }}>Batalkan batch</button>}
    </div>

    {preview && !profilesOnly && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 130px),1fr))', gap: 8 }}>
      {[['Profil',preview.profiles.length],['Baris sumber (termasuk templat)',preview.workbookRows],['Baris templat diabaikan',preview.skippedTemplateRows],['Record per grain',preview.rows.length],['Masih draf',preview.draftRows],['Masalah',preview.issues.length]].map(([label,value])=><div key={String(label)} style={{ padding: 10, border: '1px solid var(--aureka-dialog-edge)', borderRadius: 9, background: 'var(--aureka-dialog-muted)' }}><span style={{ display: 'block', fontSize: 11, color: 'var(--aureka-color-foreground-secondary)' }}>{label}</span><strong style={{ fontSize: 18, color: 'var(--aureka-color-foreground)' }}>{Number(value).toLocaleString('id-ID')}</strong></div>)}
    </div>}
    {importMode !== 'profiles_only' && !preview?.rows.length && <p className="qwiHint">{preview ? 'Tidak ada baris valid untuk ditampilkan. Lihat hasil pemeriksaan di bawah.' : dataOnly ? 'Pilih workbook untuk melihat baris dan respons sebelum impor. Setelah mengubah pemetaan, klik Pratinjau logbook.' : 'Klik Periksa data untuk melihat baris dan respons sebelum impor.'}</p>}
    {preview && <QualityWorkbookStagedPreview rows={preview.rows} />}
    {preview?.issues?.length ? <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #f0d7d2', borderRadius: 9, background: '#fff9f8', padding: 10 }}>
      <strong style={{ display: 'block', marginBottom: 7, fontSize: 12, color: '#92483d' }}>Masalah yang harus diperbaiki</strong>
      {preview.issues.slice(0, 100).map((issue,index)=><div key={index} style={{ padding: '5px 0', borderBottom: '1px solid #f5e9e6', fontSize: 11, color: '#7f5049' }}>{issue.sheet} · baris {issue.row || '-'} · {issue.field}: {issue.message}</div>)}
      {preview.issues.length>100&&<div style={{ marginTop: 6, fontSize: 11, color: '#92584e' }}>Menampilkan 100 masalah pertama dari {preview.issues.length}.</div>}
    </div> : null}
    {error && <div role="alert" style={{ padding: 10, borderRadius: 8, background: '#fff0ee', border: '1px solid #efd0ca', color: '#93463d', fontSize: 11 }}>{error}</div>}
    {notice && <div role="status" style={{ padding: 10, borderRadius: 8, background: '#eef7f2', border: '1px solid #d4e9dc', color: '#3c7253', fontSize: 11 }}>{notice}</div>}
    {importMode !== 'data_only' && !!preview?.profiles.length &&
      <div className="qwiPreviewScroll" tabIndex={0} role="region" aria-label="Tabel pratinjau profil indikator">
        <table className="qwiProfileTable">
          <thead><tr><th>Kode</th><th>Nama indikator</th></tr></thead>
          <tbody>{preview.profiles.map(profile => <tr key={profile.code}><td>{profile.code}</td><td>{profile.title}</td></tr>)}</tbody>
        </table>
      </div>}
    {roleCanImportProfiles && activeProfiles.length > 0 && importMode !== 'data_only' && preview && !preview.issues.length &&
      <label style={{ ...fieldStyle, padding: 12, background: '#fff4ec', border: '1px solid #e9b39a', borderRadius: 8 }}>
        <span>Perhatian: impor profil penuh akan menonaktifkan versi master indikator yang sedang aktif pada unit/tahun ini, termasuk profil yang tidak tercantum dalam workbook.</span>
        <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <input type="checkbox" checked={replaceConfirmed} onChange={event => setReplaceConfirmed(event.target.checked)}
            disabled={busy} style={{ width: 18, height: 18 }}/>
          Saya menyetujui penggantian set profil aktif setelah memeriksa daftar indikator lengkap.
        </span>
      </label>}
    {sheets.length > 0 && <details className="qwiMapping" open={(!profilesOnly && !dataSheet) || (profilesOnly && !profileSheet) || undefined}>
      <summary>{profilesOnly ? 'Sheet dan kolom profil' : 'Sheet dan kolom workbook'}</summary>
    {sheets.length > 0 && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 180px),1fr))', gap: 9 }}>
        {roleCanImportProfiles && importMode !== 'data_only' && <>
          <label style={fieldStyle}>Sheet Profil Indikator
            <select style={selectStyle} value={profileSheet} disabled={busy} onChange={event => { setProfileSheet(event.target.value); setPreview(null); const s=sheets.find(x=>x.name===event.target.value); if(s)setProfileHeaderRow(s.headerRow) }}>
              <option value="">Pilih sheet profil</option>{sheets.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </label>
          <label style={fieldStyle}>Sheet Opsi Indikator
            <select style={selectStyle} value={optionsSheet} disabled={busy} onChange={event => { setOptionsSheet(event.target.value); setPreview(null); const s=sheets.find(x=>x.name===event.target.value); if(s)setOptionsHeaderRow(s.headerRow) }}>
              <option value="">Tanpa sheet opsi terpisah</option>{sheets.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </label>
        </>}
        {importMode !== 'profiles_only' && <label style={fieldStyle}>Sheet Logbook / Data
          <select style={selectStyle} value={dataSheet} disabled={busy} onChange={event => { const next=sheets.find(item=>item.name===event.target.value); changeDataSource(event.target.value,next?.headerRow??1) }}>
            <option value="">Pilih sheet data</option>{sheets.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </label>}
      </div>
      {dataSheet && importMode !== 'profiles_only' && <label style={fieldStyle}>Baris header sumber
        <select style={selectStyle} value={dataHeaderRow} disabled={busy} onChange={event => changeDataSource(dataSheet,Number(event.target.value))}>
          {Array.from({ length: Math.min(100, workbookRef.current?.getWorksheet(dataSheet)?.rowCount ?? 0) }, (_, index) => index + 1)
            .map(row => <option key={row} value={row}>Baris {row}</option>)}
        </select>
      </label>}
    </>}

    {roleCanImportProfiles && importMode !== 'data_only' && profileSheet && <details style={{ border: '1px solid var(--aureka-dialog-edge)', borderRadius: 9, padding: 10 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 800, color: 'var(--aureka-color-foreground)' }}>Pemetaan kolom sheet Profil Indikator</summary>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 210px),1fr))', gap: 9, marginTop: 10 }}>
        {PROFILE_FIELDS.map(([key, label]) => <div key={key}>{mappingSelect(profileHeaders, profileColumns[key] ?? '', value => setProfileColumns(current => ({ ...current, [key]: value })), label)}</div>)}
      </div>
    </details>}

    {roleCanImportProfiles && importMode !== 'data_only' && optionsSheet && <details style={{ border: '1px solid var(--aureka-dialog-edge)', borderRadius: 9, padding: 10 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 800, color: 'var(--aureka-color-foreground)' }}>Pemetaan kolom sheet Opsi Indikator</summary>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 210px),1fr))', gap: 9, marginTop: 10 }}>
        {(['indicator_code','label','code','review_required'] as const).map(key => <div key={key}>{mappingSelect(optionHeaders, optionColumns[key] ?? '', value => setOptionColumns(current => ({ ...current, [key]: value })), ({indicator_code:'Kode indikator',label:'Label opsi',code:'Kode opsi 1/2/3',review_required:'Perlu review'} as any)[key])}</div>)}
      </div>
    </details>}

    {importMode !== 'profiles_only' && dataSheet && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%, 180px),1fr))', gap: 9 }}>
        {(['date','subject_key','patient_name','diagnosis','dpjp'] as const).map(key => <div key={key}>{mappingSelect(dataHeaders, dataColumns[key] ?? '', value => setDataColumns(current => ({ ...current, [key]: value })), ({date:'Tanggal pencatatan',subject_key:'Nomor RM / kunci subjek',patient_name:'Nama pasien / subjek',diagnosis:'Diagnosa',dpjp:'DPJP / penanggung jawab'} as any)[key])}</div>)}
      </div>
      <details style={{ border: '1px solid var(--aureka-dialog-edge)', borderRadius: 9, padding: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 800, color: 'var(--aureka-color-foreground)' }}>Pilih kolom Excel untuk setiap indikator ({currentProfiles.length}) · dropdown N / O / dst.</summary>
        <p style={{ fontSize: 12, color: 'var(--aureka-color-foreground-secondary)', lineHeight: 1.6 }}>Pilih kolom respons, pembilang, dan penyebut langsung dari daftar huruf kolom dan nama header. Pemetaan tidak memerlukan pengetikan judul kolom atau konfigurasi kode.</p>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {currentProfiles.map(profile => {
            const isRatio = resolveMeasurementKind(profile) === 'ratio' && !usesCategoricalResponseCapture(profile)
            return <div key={profile.code} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(100%,170px),1fr))', gap: 8, alignItems: 'end', padding: '8px 0', borderBottom: '1px solid #edf1f4' }}>
              <div><strong style={{ display: 'block', fontSize: 11, color: 'var(--aureka-color-foreground)' }}>{profile.code} · {profile.title}</strong><span style={{ fontSize: 11, color: 'var(--aureka-color-foreground-secondary)' }}>{profile.measurement_grain} · {resolveMeasurementKind(profile)}{usesCategoricalResponseCapture(profile) ? ' · dropdown 1/2/3' : ''}</span></div>
              {mappingSelect(dataHeaders, indicatorColumns[profile.code] ?? '', value => setIndicatorColumns(current => ({ ...current, [profile.code]: value })), 'Kolom respons / nilai')}
              {isRatio ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {mappingSelect(dataHeaders, numeratorColumns[profile.code] ?? '', value => setNumeratorColumns(current => ({ ...current, [profile.code]: value })), 'Pembilang')}
                {mappingSelect(dataHeaders, denominatorColumns[profile.code] ?? '', value => setDenominatorColumns(current => ({ ...current, [profile.code]: value })), 'Penyebut')}
              </div> : <div style={{ fontSize: 11, color: 'var(--aureka-color-foreground-secondary)', paddingBottom: 9 }}>Satu kolom sumber</div>}
            </div>
          })}
        </div>
      </details>
    </>}

    </details>}
  </section>
}
