'use client'

import { useMemo, useRef, useState, type CSSProperties } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { resolveMeasurementKind, usesCategoricalResponseCapture } from '@/lib/aureka/indicator-engine'
import { shouldUseIndicatorDropdown } from '@/lib/aureka/indicator-dropdown'
import { toUserFacingError } from '@/lib/ui/error-feedback'

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
type SheetMeta = { name: string; headerRow: number; headers: string[] }
type ImportIssue = { sheet: string; row: number; field: string; message: string }
type StagedRow = { source_key: string; source_sheet: string; source_row: number; row_payload: Record<string, any> }
type Preview = { profiles: Profile[]; rows: StagedRow[]; issues: ImportIssue[]; workbookRows: number }

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
    if ('formula' in value || 'sharedFormula' in value) return value.result ?? null
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
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  if (typeof value === 'number' || /^\d{5}(?:\.\d+)?$/.test(raw)) {
    const serial = Number(value)
    if (serial >= 20000 && serial <= 80000) return new Date(Date.UTC(1899, 11, 30) + serial * 86400000).toISOString().slice(0, 10)
  }
  const dmy = raw.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/)
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
const findHeader = (headers: string[], synonyms: string[]) => headers.find(h => synonyms.some(s => normalize(h) === normalize(s) || normalize(h).includes(normalize(s)))) ?? ''
const hash = async (value: string) => {
  const bytes = new TextEncoder().encode(value)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join('')
}
const optionForValue = (profile: Profile, rawValue: unknown) => {
  const raw = clean(rawValue)
  if (!raw) return null
  const options = Array.isArray(profile.options_json) ? profile.options_json : []
  const suffix = raw.match(/\(code\s*([1-3])\)\s*$/i)
  const label = suffix ? raw.slice(0, suffix.index).trim() : raw
  const byCode = options.filter(option => String(option.code ?? '') === raw && [1, 2, 3].includes(Number(option.code)))
  const matches = byCode.length === 1 ? byCode : options.filter(option => normalize(option.label) === normalize(label))
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
  roomId, roomName, year, importerKey, role, activeProfiles, onImported,
}: {
  roomId: number
  roomName: string
  year: number
  importerKey: string
  role: string | null
  activeProfiles: Profile[]
  onImported: () => void
}) {
  const workbookRef = useRef<any>(null)
  const fileRef = useRef<File | null>(null)
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
  const [importMode, setImportMode] = useState<'profiles_and_data' | 'profiles_only' | 'data_only'>(role === 'ADMIN' ? 'profiles_and_data' : 'data_only')
  const [dataMode, setDataMode] = useState<'append' | 'upsert'>('append')
  const [preview, setPreview] = useState<Preview | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [batchId, setBatchId] = useState('')

  const currentProfiles = useMemo(() => preview?.profiles ?? activeProfiles, [preview?.profiles, activeProfiles])
  const dataHeaders = sheets.find(sheet => sheet.name === dataSheet)?.headers ?? []
  const profileHeaders = sheets.find(sheet => sheet.name === profileSheet)?.headers ?? []
  const optionHeaders = sheets.find(sheet => sheet.name === optionsSheet)?.headers ?? []
  const roleCanImportProfiles = role === 'ADMIN'

  const inspect = async (file: File) => {
    setError(''); setNotice(''); setPreview(null); setBatchId('')
    if (!/\.xlsx$/i.test(file.name) || file.size <= 0 || file.size > 25 * 1024 * 1024) {
      setError('Pilih workbook .xlsx yang valid dengan ukuran maksimum 25 MB.')
      return
    }
    try {
      const module = await import('exceljs-hardened')
      const ExcelJS: any = (module as any).default ?? module
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await file.arrayBuffer())
      const detected: SheetMeta[] = []
      for (const sheet of workbook.worksheets.slice(0, 50)) {
        let bestRow = 1
        let bestHeaders: string[] = []
        for (let rowNumber = 1; rowNumber <= Math.min(15, sheet.rowCount); rowNumber++) {
          const row = sheet.getRow(rowNumber)
          const headers: string[] = []
          for (let column = 1; column <= Math.min(200, row.cellCount || 200); column++) {
            const label = clean(asCell(row.getCell(column).value))
            if (label && !headers.some(item => normalize(item) === normalize(label))) headers.push(label)
          }
          if (headers.length > bestHeaders.length) { bestHeaders = headers; bestRow = rowNumber }
        }
        if (bestHeaders.length) detected.push({ name: sheet.name, headerRow: bestRow, headers: bestHeaders })
      }
      if (!detected.length) throw new Error('Tidak ditemukan header pada 15 baris pertama workbook.')
      workbookRef.current = workbook
      fileRef.current = file
      setFileName(file.name)
      const bytes = await file.arrayBuffer()
      const digest = await crypto.subtle.digest('SHA-256', bytes)
      setFileHash(Array.from(new Uint8Array(digest)).map(x => x.toString(16).padStart(2, '0')).join(''))
      setSheets(detected)
      const pSheet = detected.find(s => /profil.*indikator|daftar.*indikator|master.*indikator/i.test(s.name))
        ?? detected.find(s => findHeader(s.headers, ['kode indikator', 'indicator code', 'code']) && findHeader(s.headers, ['nama indikator', 'indicator name', 'title']))
      const oSheet = detected.find(s => /opsi.*indikator|pilihan.*indikator|opsi/i.test(s.name))
        ?? detected.find(s => findHeader(s.headers, ['kode opsi', 'option code']) && findHeader(s.headers, ['kode indikator', 'indicator code']))
      const dSheet = detected.find(s => /logbook|rekap|data/i.test(s.name) && s.name !== pSheet?.name && s.name !== oSheet?.name)
        ?? detected.find(s => s.name !== pSheet?.name && s.name !== oSheet?.name)
      setProfileSheet(pSheet?.name ?? '')
      setOptionsSheet(oSheet?.name ?? '')
      setDataSheet(dSheet?.name ?? '')
      // Empty master: prefer a non-destructive profile-only bootstrap first.
      // The user can later import logbook rows separately after reviewing the new profiles.
      if (roleCanImportProfiles && pSheet && (activeProfiles.length === 0 || !dSheet)) {
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
      const nextData: Record<string, string> = dSheet ? {
        date: findHeader(dSheet.headers, ['tanggal', 'tanggal pengamatan', 'tanggal pelayanan', 'date', 'record date']),
        subject_key: findHeader(dSheet.headers, ['no. rm', 'no rm', 'nomor rekam medis', 'no. rekam medis', 'id subjek', 'kode pegawai']),
        patient_name: findHeader(dSheet.headers, ['nama pasien', 'nama', 'patient name']),
        diagnosis: findHeader(dSheet.headers, ['diagnosa', 'diagnosis', 'diagnosis tegak']),
        dpjp: findHeader(dSheet.headers, ['dpjp', 'dokter penanggung jawab']),
      } : {}
      setDataColumns(nextData)
      const nextIndicators: Record<string, string> = {}
      const nextNums: Record<string, string> = {}
      const nextDens: Record<string, string> = {}
      for (const p of activeProfiles) {
        const schema = p.schema_json ?? {}
        const mapping = schema.excel_mapping ?? {}
        nextIndicators[p.code] = findHeader(dSheet?.headers ?? [], [
          mapping.indicator_header, schema.header_label, p.code, p.title,
        ].filter(Boolean))
        nextNums[p.code] = findHeader(dSheet?.headers ?? [], [mapping.numerator_header, p.code + ' numerator'].filter(Boolean))
        nextDens[p.code] = findHeader(dSheet?.headers ?? [], [mapping.denominator_header, p.code + ' denominator'].filter(Boolean))
      }
      setIndicatorColumns(nextIndicators)
      setNumeratorColumns(nextNums)
      setDenominatorColumns(nextDens)
      // Reuse previously approved mappings for this unit/year/workbook type.
      try {
        const { data: savedMap, error: savedMapError } = await q().rpc('quality_excel_header_mapping_list', {
          p_room_id: roomId, p_profile_year: year, p_importer_key: importerKey,
        })
        if (!savedMapError) {
          const saved = Array.isArray(savedMap?.mappings) ? savedMap.mappings : []
          const sourceFor = (type: string, key: string) => saved.find((item: any) => item.target_type === type && item.target_key === key)?.source_header ?? ''
          setDataColumns(current => ({
            ...current,
            date: sourceFor('field','field:record_date') || current.date,
            subject_key: sourceFor('field','field:subject_key') || current.subject_key,
            patient_name: sourceFor('field','field:patient_name') || current.patient_name,
            diagnosis: sourceFor('field','field:diagnosis') || current.diagnosis,
            dpjp: sourceFor('field','field:dpjp') || current.dpjp,
          }))
          setIndicatorColumns(current => {
            const next = { ...current }
            for (const profile of activeProfiles) next[profile.code] = sourceFor('indicator','indicator:' + profile.code) || next[profile.code] || ''
            return next
          })
          setNumeratorColumns(current => {
            const next = { ...current }
            for (const profile of activeProfiles) next[profile.code] = sourceFor('field','field:' + profile.code + ':numerator') || next[profile.code] || ''
            return next
          })
          setDenominatorColumns(current => {
            const next = { ...current }
            for (const profile of activeProfiles) next[profile.code] = sourceFor('field','field:' + profile.code + ':denominator') || next[profile.code] || ''
            return next
          })
        }
      } catch { /* mapping lookup is optional; explicit user mapping remains available */ }
      setNotice('Worksheet dikenali. Periksa kembali peran sheet dan pemetaan setiap kolom sebelum membuat pratinjau. Aturan tersimpan per unit akan dipakai kembali. Baris data tidak dikirim ke NARA.')
    } catch (cause) {
      setError(toUserFacingError(cause, { fallback: 'Workbook gagal dibaca. Pastikan berkas bukan hasil ekspor rusak atau dilindungi kata sandi.' }))
    }
  }

  const sheetRows = (sheetName: string, headerRow: number): Array<{ rowNumber: number; values: Record<string, any> }> => {
    const sheet = workbookRef.current?.getWorksheet(sheetName)
    if (!sheet) return []
    const headers: Record<number, string> = {}
    sheet.getRow(headerRow).eachCell({ includeEmpty: false }, (cell: any, col: number) => {
      const name = clean(asCell(cell.value))
      if (name) headers[col] = name
    })
    const rows: Array<{ rowNumber: number; values: Record<string, any> }> = []
    for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber)
      const values: Record<string, any> = {}
      for (const [colText, header] of Object.entries(headers)) {
        const value = asCell(row.getCell(Number(colText)).value)
        if (value !== null && value !== undefined && clean(value) !== '') values[header] = value
      }
      if (Object.keys(values).length) rows.push({ rowNumber, values })
    }
    return rows
  }

  const buildPreview = async () => {
    setError(''); setNotice(''); setPreview(null)
    if (!workbookRef.current || !fileRef.current) { setError('Unggah workbook terlebih dahulu.'); return }
    if (!roomId || !importerKey) { setError('Unit dan jenis workbook wajib dipilih.'); return }
    const issues: ImportIssue[] = []
    const profileRows = importMode === 'data_only' ? [] : sheetRows(profileSheet, profileHeaderRow)
    const optionRows = optionsSheet ? sheetRows(optionsSheet, optionsHeaderRow) : []
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
    if (importMode !== 'profiles_only') {
      if (importMode === 'data_only' && !activeProfiles.length) issues.push({ sheet: '-', row: 0, field: 'Profil aktif', message: 'Tidak ada profil indikator aktif untuk unit dan tahun terpilih.' })
      for (const source of sourceDataRows) {
        const byGrain = new Map<string, any[]>()
        for (const profile of profiles) {
          const schemaMapping = profile.schema_json?.excel_mapping ?? {}
          const valueHeader = indicatorColumns[profile.code] || findHeader(dataHeaders, [schemaMapping.indicator_header, profile.schema_json?.header_label, profile.code, profile.title].filter(Boolean))
          const numeratorHeader = numeratorColumns[profile.code] || findHeader(dataHeaders, [schemaMapping.numerator_header].filter(Boolean))
          const denominatorHeader = denominatorColumns[profile.code] || findHeader(dataHeaders, [schemaMapping.denominator_header].filter(Boolean))
          const rawCell = valueHeader ? source.values[valueHeader] : null
          const numeratorCell = numeratorHeader ? source.values[numeratorHeader] : null
          const denominatorCell = denominatorHeader ? source.values[denominatorHeader] : null
          const hasValue = [rawCell, numeratorCell, denominatorCell].some(value => value !== null && value !== undefined && clean(value) !== '')
          if (!hasValue) continue
          try {
            const kind = resolveMeasurementKind(profile)
            const categorical = usesCategoricalResponseCapture(profile) || shouldUseIndicatorDropdown(profile as any)
            let response: Record<string, any> = { indicator_code: profile.code, response_label: null, response_code: null, raw_value: {}, review_status: 'not_required' }
            if (categorical) {
              const option = optionForValue(profile, rawCell)
              if (!option || ![1, 2, 3].includes(Number(option.code))) throw new Error('Nilai "' + clean(rawCell) + '" tidak cocok tepat dengan opsi berkode 1/2/3. Periksa pemetaan atau master opsi.')
              response.response_label = String(option.label)
              response.response_code = Number(option.code)
              response.raw_value = { answer: String(option.label), code: response.response_code }
              response.review_status = option.review_required ? 'pending' : 'not_required'
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
          const dateHeader = dataColumns.date
          const dateValue = dateHeader ? parseDate(source.values[dateHeader]) : null
          const subjectHeader = dataColumns.subject_key
          const nameHeader = dataColumns.patient_name
          const diagnosisHeader = dataColumns.diagnosis
          const dpjpHeader = dataColumns.dpjp
          const formFields = { ...source.values }
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
              core_data: { form_fields: formFields, import_source: 'AUREKA Excel Workbook Import V2' },
              status: 'ready',
              review_required: responses.some(r => r.review_status === 'pending'),
            },
            responses, attributions: [],
          }
          const sourceKey = await hash([roomId, year, importerKey, dataSheet, source.rowNumber, grain].join('|'))
          rows.push({ source_key: sourceKey, source_sheet: dataSheet, source_row: source.rowNumber, row_payload: payload })
        }
      }
    }
    if (rows.length > 10000) issues.push({ sheet: dataSheet, row: 0, field: 'Batas impor', message: 'Jumlah record hasil pemetaan melebihi batas 10.000 per batch.' })
    if (importMode !== 'profiles_only' && !rows.length) issues.push({ sheet: dataSheet || '-', row: 0, field: 'Respons', message: 'Tidak ada respons indikator valid yang dapat disimpan.' })
    setPreview({ profiles, rows, issues, workbookRows: sourceDataRows.length })
    if (issues.length) setError('Pratinjau menemukan ' + issues.length.toLocaleString('id-ID') + ' masalah. Perbaiki pemetaan atau nilai sumber sebelum commit.')
    else setNotice('Pratinjau valid: ' + profiles.length.toLocaleString('id-ID') + ' profil, ' + rows.length.toLocaleString('id-ID') + ' record, ' + sourceDataRows.length.toLocaleString('id-ID') + ' baris sumber.')
  }

  const runImport = async () => {
    if (!preview || preview.issues.length) return
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

      // Persist selected source columns so the next upload for this unit can reuse them.
      let mappingSaved = 0
      if (importMode !== 'profiles_only' && dataSheet) {
        const profilesForMapping = importMode === 'data_only' ? activeProfiles : preview.profiles
        const rules: Array<Record<string, any>> = []
        const addField = (key: string, label: string, header: string) => {
          if (header) rules.push({ target_type: 'field', target_key: 'field:' + key, target_label: label, source_header: header, occurrence: 1, transform_json: {} })
        }
        addField('record_date', 'Tanggal pencatatan', dataColumns.date)
        addField('subject_key', 'Kunci subjek / No. RM', dataColumns.subject_key)
        addField('patient_name', 'Nama pasien / subjek', dataColumns.patient_name)
        addField('diagnosis', 'Diagnosis', dataColumns.diagnosis)
        addField('dpjp', 'DPJP / penanggung jawab', dataColumns.dpjp)
        for (const profile of profilesForMapping) {
          const schemaMapping = profile.schema_json?.excel_mapping ?? {}
          const valueHeader = indicatorColumns[profile.code] || findHeader(dataHeaders, [schemaMapping.indicator_header, profile.schema_json?.header_label, profile.code, profile.title].filter(Boolean))
          if (valueHeader) rules.push({ target_type: 'indicator', target_key: 'indicator:' + profile.code, indicator_code: profile.code, target_label: profile.code + ' · ' + profile.title, source_header: valueHeader, occurrence: 1, transform_json: {} })
          const numHeader = numeratorColumns[profile.code] || findHeader(dataHeaders, [schemaMapping.numerator_header].filter(Boolean))
          const denHeader = denominatorColumns[profile.code] || findHeader(dataHeaders, [schemaMapping.denominator_header].filter(Boolean))
          if (numHeader) rules.push({ target_type: 'field', target_key: 'field:' + profile.code + ':numerator', target_label: profile.code + ' · numerator', source_header: numHeader, occurrence: 1, transform_json: {} })
          if (denHeader) rules.push({ target_type: 'field', target_key: 'field:' + profile.code + ':denominator', target_label: profile.code + ' · denominator', source_header: denHeader, occurrence: 1, transform_json: {} })
        }
        for (let index = 0; index < rules.length; index += 200) {
          const { error: mapError, data: mapResult } = await q().rpc('quality_excel_header_mapping_upsert_bulk', {
            p_room_id: roomId, p_profile_year: year, p_importer_key: importerKey,
            p_rules: rules.slice(index, index + 200),
            p_decision_note: 'Pemetaan kolom diverifikasi melalui impor workbook AUREKA V2.',
          })
          if (mapError) { setError('Data berhasil diimpor, tetapi penyimpanan aturan pemetaan tidak berhasil: ' + toUserFacingError(mapError)); break }
          mappingSaved += Number(mapResult?.saved_count ?? 0)
        }
      }
      setNotice('Impor selesai. ' + Number(committed.imported_rows ?? 0).toLocaleString('id-ID') +
        ' record tersimpan dan ' + Number(committed.profile_count ?? 0).toLocaleString('id-ID') +
        ' profil diproses. ' + mappingSaved.toLocaleString('id-ID') + ' aturan kolom disimpan untuk impor berikutnya. Batch: ' + createdBatch)
      setBatchId('')
      setPreview(null)
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

  const selectStyle: CSSProperties = { width: '100%', minHeight: 36, border: '1px solid #d7e2e9', borderRadius: 8, padding: '6px 8px', background: '#fff', color: '#243b4d', fontSize: 12 }
  const fieldStyle: CSSProperties = { display: 'grid', gap: 4, minWidth: 0, color: '#5e7381', fontSize: 11, fontWeight: 700 }
  const mappingSelect = (headers: string[], value: string, onChange: (value: string) => void, label: string) => (
    <label style={fieldStyle}>{label}
      <select style={selectStyle} value={value} onChange={event => { onChange(event.target.value); setPreview(null) }}>
        <option value="">— Tidak dipetakan —</option>
        {headers.map(header => <option key={header} value={header}>{header}</option>)}
      </select>
    </label>
  )

  return <section style={{ display: 'grid', gap: 12, padding: 14, border: '1px solid #dce7ed', borderRadius: 12, background: '#fbfdfe' }}>
    <header>
      <div style={{ fontSize: 10, letterSpacing: '.1em', fontWeight: 850, color: '#3a788e' }}>AUREKA · IMPORT ENGINE V2</div>
      <strong style={{ display: 'block', marginTop: 4, fontSize: 16 }}>Impor Profil dan Logbook dari Excel</strong>
      <p style={{ margin: '5px 0 0', color: '#708391', fontSize: 12, lineHeight: 1.5 }}>
        Workbook unit menjadi sumber konfigurasi dan data. AUREKA membaca sheet profil, opsi, dan logbook; setiap kolom dapat dipetakan ulang sebelum validasi dan commit.
      </p>
    </header>

    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(175px,1fr))', gap: 9 }}>
      <label style={fieldStyle}>Mode impor
        <select style={selectStyle} value={importMode} disabled={busy || !roleCanImportProfiles} onChange={event => { setImportMode(event.target.value as any); setPreview(null) }}>
          {roleCanImportProfiles && <option value="profiles_and_data">Profil + Data logbook</option>}
          {roleCanImportProfiles && <option value="profiles_only">Profil indikator saja</option>}
          <option value="data_only">Data logbook saja</option>
        </select>
      </label>
      <label style={fieldStyle}>Perlakuan baris data
        <select style={selectStyle} value={dataMode} disabled={busy || importMode === 'profiles_only'} onChange={event => setDataMode(event.target.value as any)}>
          <option value="append">Append · Tolak duplikasi</option>
          <option value="upsert">Upsert · Perbarui draf yang belum divalidasi</option>
        </select>
      </label>
      <label style={fieldStyle}>Workbook .xlsx
        <input type="file" accept=".xlsx" disabled={busy} onChange={event => { const file = event.target.files?.[0]; if (file) void inspect(file); event.currentTarget.value = '' }} style={{ ...selectStyle, padding: '6px 8px' }}/>
      </label>
    </div>
    {fileName && <div style={{ fontSize: 11, color: '#5d7481' }}>File: <strong>{fileName}</strong> · {sheets.length} worksheet terdeteksi · SHA-256 aktif</div>}

    {sheets.length > 0 && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 9 }}>
        {roleCanImportProfiles && <>
          <label style={fieldStyle}>Sheet Profil Indikator
            <select style={selectStyle} value={profileSheet} onChange={event => { setProfileSheet(event.target.value); setPreview(null); const s=sheets.find(x=>x.name===event.target.value); if(s)setProfileHeaderRow(s.headerRow) }}>
              <option value="">Pilih sheet profil</option>{sheets.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </label>
          <label style={fieldStyle}>Sheet Opsi Indikator
            <select style={selectStyle} value={optionsSheet} onChange={event => { setOptionsSheet(event.target.value); setPreview(null); const s=sheets.find(x=>x.name===event.target.value); if(s)setOptionsHeaderRow(s.headerRow) }}>
              <option value="">Tanpa sheet opsi terpisah</option>{sheets.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
            </select>
          </label>
        </>}
        {importMode !== 'profiles_only' && <label style={fieldStyle}>Sheet Logbook / Data
          <select style={selectStyle} value={dataSheet} onChange={event => { setDataSheet(event.target.value); setPreview(null); const s=sheets.find(x=>x.name===event.target.value); if(s)setDataHeaderRow(s.headerRow) }}>
            <option value="">Pilih sheet data</option>{sheets.map(s=><option key={s.name} value={s.name}>{s.name}</option>)}
          </select>
        </label>}
      </div>
      <div style={{ fontSize: 11, color: '#7b8c96' }}>Baris header dapat dipastikan melalui pemetaan kolom. AUREKA mendeteksi kandidat header pada 15 baris awal setiap sheet.</div>
    </>}

    {roleCanImportProfiles && importMode !== 'data_only' && profileSheet && <details style={{ border: '1px solid #e4ebef', borderRadius: 9, padding: 10 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 800, color: '#335d73' }}>Pemetaan kolom sheet Profil Indikator</summary>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 9, marginTop: 10 }}>
        {PROFILE_FIELDS.map(([key, label]) => <div key={key}>{mappingSelect(profileHeaders, profileColumns[key] ?? '', value => setProfileColumns(current => ({ ...current, [key]: value })), label)}</div>)}
      </div>
    </details>}

    {roleCanImportProfiles && importMode !== 'data_only' && optionsSheet && <details style={{ border: '1px solid #e4ebef', borderRadius: 9, padding: 10 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 800, color: '#335d73' }}>Pemetaan kolom sheet Opsi Indikator</summary>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 9, marginTop: 10 }}>
        {(['indicator_code','label','code','review_required'] as const).map(key => <div key={key}>{mappingSelect(optionHeaders, optionColumns[key] ?? '', value => setOptionColumns(current => ({ ...current, [key]: value })), ({indicator_code:'Kode indikator',label:'Label opsi',code:'Kode opsi 1/2/3',review_required:'Perlu review'} as any)[key])}</div>)}
      </div>
    </details>}

    {importMode !== 'profiles_only' && dataSheet && <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 9 }}>
        {(['date','subject_key','patient_name','diagnosis','dpjp'] as const).map(key => <div key={key}>{mappingSelect(dataHeaders, dataColumns[key] ?? '', value => setDataColumns(current => ({ ...current, [key]: value })), ({date:'Tanggal pencatatan',subject_key:'Nomor RM / kunci subjek',patient_name:'Nama pasien / subjek',diagnosis:'Diagnosa',dpjp:'DPJP / penanggung jawab'} as any)[key])}</div>)}
      </div>
      <details open style={{ border: '1px solid #e4ebef', borderRadius: 9, padding: 10 }}>
        <summary style={{ cursor: 'pointer', fontSize: 12, fontWeight: 800, color: '#335d73' }}>Pemetaan kolom per indikator ({currentProfiles.length})</summary>
        <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
          {currentProfiles.map(profile => {
            const isRatio = resolveMeasurementKind(profile) === 'ratio' && !usesCategoricalResponseCapture(profile)
            return <div key={profile.code} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,1fr) repeat(2,minmax(150px,1fr))', gap: 8, alignItems: 'end', padding: '8px 0', borderBottom: '1px solid #edf1f4' }}>
              <div><strong style={{ display: 'block', fontSize: 11, color: '#2d5368' }}>{profile.code} · {profile.title}</strong><span style={{ fontSize: 10, color: '#8a9aa2' }}>{profile.measurement_grain} · {resolveMeasurementKind(profile)}{usesCategoricalResponseCapture(profile) ? ' · dropdown 1/2/3' : ''}</span></div>
              {mappingSelect(dataHeaders, indicatorColumns[profile.code] ?? '', value => setIndicatorColumns(current => ({ ...current, [profile.code]: value })), 'Kolom respons / nilai')}
              {isRatio ? <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {mappingSelect(dataHeaders, numeratorColumns[profile.code] ?? '', value => setNumeratorColumns(current => ({ ...current, [profile.code]: value })), 'Pembilang')}
                {mappingSelect(dataHeaders, denominatorColumns[profile.code] ?? '', value => setDenominatorColumns(current => ({ ...current, [profile.code]: value })), 'Penyebut')}
              </div> : <div style={{ fontSize: 10, color: '#82929b', paddingBottom: 9 }}>Satu kolom sumber</div>}
            </div>
          })}
        </div>
      </details>
    </>}

    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" disabled={!sheets.length || busy} onClick={() => void buildPreview()} style={{ border: 0, borderRadius: 8, padding: '9px 13px', background: '#e9f2f7', color: '#26536e', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>Buat pratinjau & validasi lokal</button>
      <button type="button" disabled={!preview || !!preview.issues.length || busy} onClick={() => void runImport()} style={{ border: 0, borderRadius: 8, padding: '9px 13px', background: '#176d4d', color: '#fff', fontWeight: 800, fontSize: 12, cursor: 'pointer' }}>{busy ? 'Memproses batch…' : 'Validasi server & commit atomik'}</button>
      <button type="button" disabled={!batchId || busy} onClick={() => void cancelBatch()} style={{ border: '1px solid #e1d4ce', borderRadius: 8, padding: '9px 13px', background: '#fff', color: '#8d5142', fontWeight: 750, fontSize: 12, cursor: 'pointer' }}>Batalkan batch</button>
    </div>

    {preview && <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 8 }}>
      {[['Profil',preview.profiles.length],['Baris sumber',preview.workbookRows],['Record per grain',preview.rows.length],['Masalah',preview.issues.length]].map(([label,value])=><div key={String(label)} style={{ padding: 10, border: '1px solid #e4ebef', borderRadius: 9, background: '#fff' }}><span style={{ display: 'block', fontSize: 10, color: '#798b95' }}>{label}</span><strong style={{ fontSize: 18, color: '#294e64' }}>{Number(value).toLocaleString('id-ID')}</strong></div>)}
    </div>}
    {preview?.issues?.length ? <div style={{ maxHeight: 240, overflow: 'auto', border: '1px solid #f0d7d2', borderRadius: 9, background: '#fff9f8', padding: 10 }}>
      <strong style={{ display: 'block', marginBottom: 7, fontSize: 12, color: '#92483d' }}>Masalah yang harus diperbaiki</strong>
      {preview.issues.slice(0, 100).map((issue,index)=><div key={index} style={{ padding: '5px 0', borderBottom: '1px solid #f5e9e6', fontSize: 11, color: '#7f5049' }}>{issue.sheet} · baris {issue.row || '-'} · {issue.field}: {issue.message}</div>)}
      {preview.issues.length>100&&<div style={{ marginTop: 6, fontSize: 10, color: '#92584e' }}>Menampilkan 100 masalah pertama dari {preview.issues.length}.</div>}
    </div> : null}
    {error && <div role="alert" style={{ padding: 10, borderRadius: 8, background: '#fff0ee', border: '1px solid #efd0ca', color: '#93463d', fontSize: 11 }}>{error}</div>}
    {notice && <div role="status" style={{ padding: 10, borderRadius: 8, background: '#eef7f2', border: '1px solid #d4e9dc', color: '#3c7253', fontSize: 11 }}>{notice}</div>}
    <div style={{ fontSize: 10, color: '#8999a2', lineHeight: 1.5 }}>
      Unit: <strong>{roomName}</strong> · Tahun: <strong>{year}</strong> · Mode categorical mengikuti kode opsi 1/2/3 dari profil. Data pasien diproses di browser lalu dikirim ke staging Supabase dengan akses RPC terkontrol; data baris tidak dikirim ke NARA.
    </div>
  </section>
}
