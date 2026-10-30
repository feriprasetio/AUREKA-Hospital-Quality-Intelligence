'use client'

import { useCallback, useMemo, useState } from 'react'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import { DEFAULT_IMPORT_BATCH_SIZE, MIN_IMPORT_BATCH_SIZE, isStatementTimeout, nextBatchSizeAfterTimeout } from '@/lib/aureka/import-batching'
import {
  LABORATORY_INDICATORS,
  calculateLaboratoryWaitMinutes,
  laboratorySourceWarnings,
  maskLaboratoryMedicalRecord,
  maskLaboratoryPatientName,
  matchLaboratoryOption,
  normalizeLaboratoryDateTime,
  summarizeLaboratoryDuplicates,
  type LaboratoryIndicatorCode,
  type LaboratoryIndicatorOption,
} from '@/lib/aureka/laboratorium-logbook'
import { aurekaSupabase } from '@/lib/aureka/supabase'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_DATA_ROWS = 5000
const MAX_WORKSHEET_ROWS = 5003
const MAX_SHEETS = 50
const BATCH_SIZE = DEFAULT_IMPORT_BATCH_SIZE
const MIN_BATCH_SIZE = MIN_IMPORT_BATCH_SIZE
const SOURCE_KEY_PREFIX = 'excel-pmkp-laboratorium-2026:row:'

type IndicatorProfile = Record<string, any> & {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  is_active?: boolean
  status?: string
  options_json?: LaboratoryIndicatorOption[]
}
type PreparedRow = {
  sourceRow: number
  sourceNo: string
  patientName: string
  medicalRecordNo: string
  requestedAt: string
  completedAt: string | null
  rawRequestedAt: string
  rawCompletedAt: string
  waitMinutes: number | null
  origin: string
  orderingDoctor: string
  activity: string
  receivingAnalyst: string
  rawAnswers: Record<LaboratoryIndicatorCode, string>
  answers: Partial<Record<LaboratoryIndicatorCode, LaboratoryIndicatorOption>>
  warnings: string[]
}
type ExcludedRow = { sourceRow: number; sourceNo: string; reasons: string[] }
type DuplicateStats = {
  sourceNumber: { distinctValues: number; repeatedValues: number; extraRows: number }
  medicalRecord: { distinctValues: number; repeatedValues: number; extraRows: number }
}
type ImportCounts = { received: number; imported: number; skipped: number; completedBatches: number }
type ImportResponse = { received_count?: number; imported_count?: number; skipped_existing_count?: number }
type Props = {
  open: boolean
  roomId: number | null
  year: number
  authorized: boolean
  profiles: IndicatorProfile[]
  onClose: () => void
  onImported: (summary: { imported: number; skipped: number; received: number }) => void | Promise<void>
}

const REQUIRED_HEADERS: Record<string, string[]> = {
  sourceNo: ['No.', 'No'],
  patientName: ['Nama Pasien'],
  medicalRecordNo: ['No. Rekam Medis', 'No. RM', 'No RM'],
  requestedAt: ['Waktu Permintaan'],
  completedAt: ['Waktu Selesai'],
  origin: ['Asal Ruangan'],
  orderingDoctor: ['Dokter Pengirim'],
  activity: ['Tindakan'],
  receivingAnalyst: ['Analis Penerima'],
  indicator91: ['Darah Terbuang'],
  indicator92: ['Unordered Specimen'],
  indicator93: ['Delay Sampling'],
  indicator94: ['Lapor Tes Kritis'],
  indicator95: ['Histopatologi'],
}

const INDICATOR_FIELD_KEYS: Record<LaboratoryIndicatorCode, string> = {
  '9.1': 'indicator91',
  '9.2': 'indicator92',
  '9.3': 'indicator93',
  '9.4': 'indicator94',
  '9.5': 'indicator95',
}

function isFormulaCell(cell: any): boolean {
  const value = cell?.value
  return !!value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)
}

function readCellValue(cell: any): unknown {
  const value = cell?.value
  if (value == null || isFormulaCell(cell)) return ''
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if (Array.isArray(value.richText)) return value.richText.map((part: any) => String(part?.text ?? '')).join('')
    if (typeof value.text === 'string') return value.text
    if (typeof value.hyperlink === 'string') return value.text ?? value.hyperlink
    return ''
  }
  return value
}

function cellText(cell: any): string {
  const value = readCellValue(cell)
  if (value == null) return ''
  if (value instanceof Date) return normalizeLaboratoryDateTime(value) ?? ''
  return String(value).trim()
}

function findHeader(columns: Map<string, number>, candidates: string[]): number | null {
  for (const candidate of candidates) {
    const match = columns.get(normalizeExactHeader(candidate))
    if (match != null) return match
  }
  return null
}

function rowHasData(row: any): boolean {
  // Column A is an auto-filled sequence through the template's blank rows.
  // Only source columns B:N can make an Excel row operational.
  for (let column = 2; column <= 14; column++) {
    const cell = row.getCell(column)
    if (isFormulaCell(cell) || String(readCellValue(cell) ?? '').trim() !== '') return true
  }
  return false
}

function choicePreview(row: PreparedRow, code: LaboratoryIndicatorCode): string {
  const raw = row.rawAnswers[code]
  if (!raw) return 'Kosong · perlu review'
  const option = row.answers[code]
  if (!option) return 'Tidak cocok master · klasifikasi manual'
  if (option.code == null || option.review_required) return 'Review · ' + option.label
  return 'Kode ' + option.code + ' · ' + option.label
}

function makePayload(row: PreparedRow, fileName: string, userId: string, profiles: IndicatorProfile[]) {
  const sourceIndicatorValues: Record<LaboratoryIndicatorCode, string> = {
    '9.1': row.rawAnswers['9.1'],
    '9.2': row.rawAnswers['9.2'],
    '9.3': row.rawAnswers['9.3'],
    '9.4': row.rawAnswers['9.4'],
    '9.5': row.rawAnswers['9.5'],
  }
  const indicatorValues: Record<string, Record<string, unknown>> = {}
  const responses: Array<Record<string, unknown>> = []

  for (const indicator of LABORATORY_INDICATORS) {
    const profile = profiles.find(item =>
      Number(item.room_id) === 9 &&
      Number(item.profile_year) === 2026 &&
      String(item.code) === indicator.code &&
      item.id &&
      item.is_active === true &&
      item.status === 'published'
    )
    if (!profile?.id) throw new Error('Master indikator Laboratorium ' + indicator.code + ' tidak aktif/terbit. Muat ulang dan periksa master sebelum impor.')

    const option = row.answers[indicator.code]
    const sourceValue = row.rawAnswers[indicator.code]
    const responseLabel = option?.label ?? null
    const responseCode = option?.code == null ? null : Number(option.code)
    const matchStatus = !sourceValue ? 'missing' : !option ? 'unmatched' :
      option.code == null || option.review_required ? 'needs_review' : 'matched'
    const indicatorValue = {
      answer: option?.label ?? '',
      code: responseCode,
      source_value: sourceValue,
      match_status: matchStatus,
    }

    indicatorValues[indicator.code] = indicatorValue
    responses.push({
      indicator_id: profile.id,
      response_label: responseLabel,
      response_code: responseCode,
      raw_value: indicatorValue,
      other_text: matchStatus === 'unmatched' || matchStatus === 'needs_review' ? sourceValue || null : null,
      review_status: 'pending',
    })
  }

  const sourceImport = {
    source_workbook: fileName,
    source_sheet: 'Logbook',
    source_excel_row: row.sourceRow,
    source_excel_no: row.sourceNo || null,
    raw_request_datetime: row.rawRequestedAt,
    raw_completed_datetime: row.rawCompletedAt,
    source_indicator_values: sourceIndicatorValues,
    source_warnings: row.warnings,
    import_scope: 'laboratory_logbook_event_rows_only',
    idempotency_basis: 'physical_excel_row_number',
    ignored_template_columns: ['Column6', 'Column7', 'Column8', 'Column9', 'Column10', 'Column11', 'Column12', 'Column13', 'Column14', 'Column15', 'Column16', 'Column17', 'Column18', 'Column19', 'Column20', 'Tanggal Order', 'Waktu Tunggu'],
  }

  const formFields: Record<string, unknown> = {
    'Nama Pasien': row.patientName,
    'No. Rekam Medis': row.medicalRecordNo,
    'Waktu Permintaan': row.requestedAt,
    'Waktu Selesai': row.completedAt ?? row.rawCompletedAt,
    'Asal Ruangan': row.origin,
    'Dokter Pengirim': row.orderingDoctor,
    'Tindakan': row.activity,
    'Analis Penerima': row.receivingAnalyst,
    'Catatan Verifikasi Impor': row.warnings.join(' '),
  }

  const core = {
    patient_name: row.patientName,
    medical_record_no: row.medicalRecordNo,
    admission_at: row.requestedAt,
    unit_name: 'Instalasi Laboratorium',
    room_id: 9,
    status: 'Ready for Review',
    workflow_status: 'Ready for Review',
    form_fields: formFields,
    calculated_fields: { 'Waktu Tunggu (Menit)': row.waitMinutes },
    indicator_values: indicatorValues,
    measurement_grain: 'event',
    source_import: sourceImport,
  }

  return {
    payload: {
      room_id: 9,
      profile_year: 2026,
      measurement_grain: 'event',
      record_date: row.requestedAt.slice(0, 10),
      subject_key: SOURCE_KEY_PREFIX + row.sourceRow,
      subject_json: { source_import: sourceImport },
      core_data: core,
      status: 'ready',
      review_required: true,
      entered_by: userId,
    },
    responses,
    attributions: [],
  }
}

export default function LaboratoryExcelImportDialog({
  open, roomId, year, authorized, profiles, onClose, onImported,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<PreparedRow[]>([])
  const [excludedRows, setExcludedRows] = useState<ExcludedRow[]>([])
  const [duplicateStats, setDuplicateStats] = useState<DuplicateStats | null>(null)
  const [sourceRowCount, setSourceRowCount] = useState(0)
  const [ignoredSheetCount, setIgnoredSheetCount] = useState(0)
  const [matchedCount, setMatchedCount] = useState(0)
  const [unmatchedCount, setUnmatchedCount] = useState(0)
  const [blankCount, setBlankCount] = useState(0)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportCounts | null>(null)
  const [partial, setPartial] = useState<ImportCounts | null>(null)
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const eligible = useMemo(() => open && authorized && roomId === 9 && year === 2026, [open, authorized, roomId, year])
  const warningRows = useMemo(() => rows.filter(row => row.warnings.length > 0), [rows])

  const reset = useCallback(() => {
    setFile(null)
    setRows([])
    setExcludedRows([])
    setDuplicateStats(null)
    setSourceRowCount(0)
    setIgnoredSheetCount(0)
    setMatchedCount(0)
    setUnmatchedCount(0)
    setBlankCount(0)
    setParsing(false)
    setImporting(false)
    setResult(null)
    setPartial(null)
    setProgress(0)
    setErrorMessage('')
    setFileInputKey(value => value + 1)
  }, [])

  const close = () => {
    if (parsing || importing) return
    reset()
    onClose()
  }

  const parseWorkbook = async (selectedFile: File) => {
    setFile(selectedFile)
    setRows([])
    setExcludedRows([])
    setDuplicateStats(null)
    setSourceRowCount(0)
    setIgnoredSheetCount(0)
    setMatchedCount(0)
    setUnmatchedCount(0)
    setBlankCount(0)
    setResult(null)
    setPartial(null)
    setProgress(0)
    setErrorMessage('')

    if (!eligible) {
      setErrorMessage('Pilih unit Instalasi Laboratorium dan tahun profil 2026 sebelum mengimpor.')
      return
    }
    if (!/\.xlsx$/i.test(selectedFile.name)) {
      setErrorMessage('Pilih workbook .xlsx. Berkas .xls, .csv, dan .xlsm tidak diterima pada alur ini.')
      return
    }
    if (selectedFile.size <= 0 || selectedFile.size > MAX_FILE_BYTES) {
      setErrorMessage('Ukuran workbook harus lebih besar dari 0 dan tidak melebihi 15 MB.')
      return
    }
    if (typeof window === 'undefined') return

    setParsing(true)
    try {
      const ExcelJSModule = await import('exceljs-hardened')
      const ExcelJS: any = (ExcelJSModule as any).default ?? ExcelJSModule
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await selectedFile.arrayBuffer())

      if (!Array.isArray(workbook.worksheets) || workbook.worksheets.length === 0 || workbook.worksheets.length > MAX_SHEETS) {
        throw new Error('Struktur workbook tidak wajar atau jumlah sheet melebihi batas ' + MAX_SHEETS + '.')
      }
      const worksheet = workbook.getWorksheet('Logbook')
      if (!worksheet) throw new Error('Sheet "Logbook" tidak ditemukan. Periksa apakah workbook Instalasi Laboratorium yang benar dipilih.')
      if (worksheet.rowCount > MAX_WORKSHEET_ROWS) throw new Error('Sheet Logbook melewati batas ' + MAX_WORKSHEET_ROWS + ' baris fisik yang diizinkan.')
      setIgnoredSheetCount(Math.max(0, workbook.worksheets.length - 1))

      // The source workbook repeats Waktu Permintaan/Waktu Selesai in formula columns AE:AH.
      // Read only A:N so derived duplicate headers never collide with the clinical source headers.
      const columns = new Map<string, number>()
      const headerRow = worksheet.getRow(2)
      for (let column = 1; column <= 14; column++) {
        const name = cellText(headerRow.getCell(column))
        if (!name) continue
        const normalized = normalizeExactHeader(name)
        if (columns.has(normalized)) throw new Error('Header ganda pada kolom sumber A:N setelah normalisasi: "' + name + '".')
        columns.set(normalized, column)
      }

      const foundColumns: Record<string, number> = {}
      for (const [key, aliases] of Object.entries(REQUIRED_HEADERS)) {
        const index = findHeader(columns, aliases)
        if (index == null) throw new Error('Header wajib "' + aliases[0] + '" tidak ditemukan pada baris 2 sheet Logbook.')
        foundColumns[key] = index
      }

      for (const indicator of LABORATORY_INDICATORS) {
        const matches = profiles.filter(item =>
          Number(item.room_id) === 9 &&
          Number(item.profile_year) === 2026 &&
          String(item.code) === indicator.code &&
          item.is_active === true &&
          item.status === 'published'
        )
        if (matches.length !== 1 || !matches[0].id || !Array.isArray(matches[0].options_json)) {
          throw new Error('Master indikator ' + indicator.code + ' harus tepat satu, aktif, terbit, dan memiliki opsi. Muat ulang setelah master Laboratorium diperiksa.')
        }
        const headerLabel = String(matches[0].schema_json?.header_label ?? '').trim()
        if (headerLabel !== indicator.header) {
          throw new Error('Header indikator ' + indicator.code + ' pada master harus "' + indicator.header + '", ditemukan "' + (headerLabel || 'kosong') + '". Pemetaan dihentikan agar respons tidak tertukar.')
        }
      }

      const byCode: Record<LaboratoryIndicatorCode, IndicatorProfile> = {} as Record<LaboratoryIndicatorCode, IndicatorProfile>
      for (const indicator of LABORATORY_INDICATORS) {
        const profile = profiles.find(item =>
          Number(item.room_id) === 9 && Number(item.profile_year) === 2026 &&
          String(item.code) === indicator.code && item.is_active === true && item.status === 'published'
        )
        if (!profile) throw new Error('Master indikator ' + indicator.code + ' tidak ditemukan saat memetakan opsi.')
        byCode[indicator.code] = profile
      }

      const parsed: PreparedRow[] = []
      const excluded: ExcludedRow[] = []
      const sourceNoValues: string[] = []
      const medicalRecordValues: string[] = []
      let actualSourceRows = 0
      let matchedResponses = 0
      let unmatchedResponses = 0
      let blankResponses = 0

      for (let excelRow = 3; excelRow <= Math.min(worksheet.rowCount, MAX_WORKSHEET_ROWS); excelRow++) {
        const sourceRow = worksheet.getRow(excelRow)
        if (!rowHasData(sourceRow)) continue
        actualSourceRows += 1
        if (actualSourceRows > MAX_DATA_ROWS) throw new Error('Workbook melebihi batas ' + MAX_DATA_ROWS + ' baris operasional.')

        const sourceNo = cellText(sourceRow.getCell(foundColumns.sourceNo))
        const patientName = cellText(sourceRow.getCell(foundColumns.patientName))
        const medicalRecordNo = cellText(sourceRow.getCell(foundColumns.medicalRecordNo))
        const rawRequestedValue = readCellValue(sourceRow.getCell(foundColumns.requestedAt))
        const rawCompletedValue = readCellValue(sourceRow.getCell(foundColumns.completedAt))
        const requestedAt = normalizeLaboratoryDateTime(rawRequestedValue)
        const completedAt = normalizeLaboratoryDateTime(rawCompletedValue)
        const rawRequestedAt = rawRequestedValue instanceof Date ? normalizeLaboratoryDateTime(rawRequestedValue) ?? '' : String(rawRequestedValue ?? '').trim()
        const rawCompletedAt = rawCompletedValue instanceof Date ? normalizeLaboratoryDateTime(rawCompletedValue) ?? '' : String(rawCompletedValue ?? '').trim()
        const origin = cellText(sourceRow.getCell(foundColumns.origin))
        const orderingDoctor = cellText(sourceRow.getCell(foundColumns.orderingDoctor))
        const activity = cellText(sourceRow.getCell(foundColumns.activity))
        const receivingAnalyst = cellText(sourceRow.getCell(foundColumns.receivingAnalyst))

        sourceNoValues.push(sourceNo)
        medicalRecordValues.push(medicalRecordNo)

        const reasons: string[] = []
        const formulaColumns = Object.entries(foundColumns)
          .filter(([key]) => key !== 'sourceNo')
          .filter(([, column]) => isFormulaCell(sourceRow.getCell(column)))
        if (formulaColumns.length > 0) reasons.push('Terdapat formula pada kolom sumber klinis; hasil formula tidak digunakan sebagai data sumber.')
        if (!requestedAt) {
          reasons.push(rawRequestedAt
            ? 'Waktu Permintaan tidak valid; baris dikecualikan dan timestamp tidak ditebak.'
            : 'Waktu Permintaan kosong; tanggal kejadian tidak ditebak.')
        } else if (requestedAt.slice(0, 4) !== '2026') {
          reasons.push('Tanggal Waktu Permintaan berada di luar tahun profil 2026; baris tidak dimasukkan ke profil ini.')
        }
        if (reasons.length > 0) {
          excluded.push({ sourceRow: excelRow, sourceNo, reasons })
          continue
        }

        const rawAnswers = {} as Record<LaboratoryIndicatorCode, string>
        const answers: Partial<Record<LaboratoryIndicatorCode, LaboratoryIndicatorOption>> = {}
        for (const indicator of LABORATORY_INDICATORS) {
          const column = foundColumns[INDICATOR_FIELD_KEYS[indicator.code]]
          const raw = cellText(sourceRow.getCell(column))
          rawAnswers[indicator.code] = raw
          if (!raw) {
            blankResponses += 1
            continue
          }
          const option = matchLaboratoryOption(raw, byCode[indicator.code].options_json ?? [])
          if (!option) {
            unmatchedResponses += 1
            continue
          }
          matchedResponses += 1
          answers[indicator.code] = option
        }

        const waitMinutes = calculateLaboratoryWaitMinutes(requestedAt, completedAt)
        const warnings = laboratorySourceWarnings({
          patientName,
          medicalRecordNo,
          requestedAt,
          completedAt: rawCompletedAt,
          origin,
          orderingDoctor,
          activity,
          receivingAnalyst,
        })
        for (const indicator of LABORATORY_INDICATORS) {
          if (rawAnswers[indicator.code] && !answers[indicator.code]) {
            warnings.push('Nilai sumber "' + indicator.header + '" tidak cocok persis dengan opsi master; nilai dipertahankan untuk klasifikasi manual.')
          }
        }

        parsed.push({
          sourceRow: excelRow,
          sourceNo,
          patientName,
          medicalRecordNo,
          requestedAt: requestedAt as string,
          completedAt,
          rawRequestedAt,
          rawCompletedAt,
          waitMinutes,
          origin,
          orderingDoctor,
          activity,
          receivingAnalyst,
          rawAnswers,
          answers,
          warnings,
        })
      }

      if (actualSourceRows === 0) throw new Error('Tidak ada baris operasional Logbook yang berisi data pada kolom sumber B:N mulai baris 3.')
      const sourceNumberSummary = summarizeLaboratoryDuplicates(sourceNoValues)
      const medicalRecordSummary = summarizeLaboratoryDuplicates(medicalRecordValues)
      const sourceNumberCounts = new Map<string, number>()
      const medicalRecordCounts = new Map<string, number>()
      for (const value of sourceNoValues) if (value) sourceNumberCounts.set(value, (sourceNumberCounts.get(value) ?? 0) + 1)
      for (const value of medicalRecordValues) if (value) medicalRecordCounts.set(value, (medicalRecordCounts.get(value) ?? 0) + 1)

      const withDuplicateWarnings = parsed.map(row => {
        const warnings = [...row.warnings]
        if (row.sourceNo && (sourceNumberCounts.get(row.sourceNo) ?? 0) > 1) warnings.push('Nomor No. sumber berulang; kunci impor tetap menggunakan baris fisik Excel.')
        if (row.medicalRecordNo && (medicalRecordCounts.get(row.medicalRecordNo) ?? 0) > 1) warnings.push('No. Rekam Medis muncul pada lebih dari satu baris sumber; setiap event tetap dipertahankan terpisah.')
        return { ...row, warnings }
      })

      setDuplicateStats({ sourceNumber: sourceNumberSummary, medicalRecord: medicalRecordSummary })
      setSourceRowCount(actualSourceRows)
      setMatchedCount(matchedResponses)
      setUnmatchedCount(unmatchedResponses)
      setBlankCount(blankResponses)
      setRows(withDuplicateWarnings.sort((a, b) => a.sourceRow - b.sourceRow))
      setExcludedRows(excluded.sort((a, b) => a.sourceRow - b.sourceRow))
    } catch (error) {
      setRows([])
      setExcludedRows([])
      setErrorMessage(error instanceof Error ? error.message : 'Workbook tidak dapat dibaca. Periksa format .xlsx dan integritas file sumber.')
    } finally {
      setParsing(false)
    }
  }

  const importRows = async () => {
    if (!file || !rows.length || !eligible || !authorized || importing || result) return
    setImporting(true)
    setErrorMessage('')
    setPartial({ received: 0, imported: 0, skipped: 0, completedBatches: 0 })
    setProgress(0)

    try {
      const authResult = await sb.auth.getUser()
      if (authResult.error) throw authResult.error
      const userId = authResult.data.user?.id
      if (!userId) throw new Error('Sesi login tidak ditemukan. Masuk ke AUREKA lalu ulangi impor.')

      const allItems = rows.map(row => makePayload(row, file.name, userId, profiles))
      const counts: ImportCounts = { received: 0, imported: 0, skipped: 0, completedBatches: 0 }
      let start = 0
      let batchSize = BATCH_SIZE
      let batchNumber = 0

      while (start < allItems.length) {
        const batch = allItems.slice(start, start + batchSize)
        batchNumber += 1
        const { data, error } = await quality().rpc('import_laboratorium_logbook_batch', { p_rows: batch })

        if (error) {
          if (/function .*import_laboratorium_logbook_batch.*not found|schema cache/i.test(error.message)) {
            throw new Error('Fungsi impor Laboratorium belum tersedia di Supabase. Pastikan migrasi secure_laboratorium_logbook_excel_import sudah diterapkan.')
          }
          const smaller = nextBatchSizeAfterTimeout(error, batchSize, MIN_BATCH_SIZE)
          if (smaller != null) {
            batchSize = smaller
            batchNumber -= 1
            setErrorMessage('Server membatasi waktu transaksi. Sistem mengecilkan batch menjadi ' + batchSize + ' baris dan mengulangi batch yang sama secara aman…')
            continue
          }
          throw new Error('Batch ' + batchNumber + ' (' + batch.length + ' baris) gagal: ' + error.message + (isStatementTimeout(error) ? ' Server masih timeout pada ukuran minimum; periksa beban basis data dan ulangi impor.' : ''))
        }

        setErrorMessage('')
        const summary = (data ?? {}) as ImportResponse
        const received = Number(summary.received_count ?? batch.length)
        const imported = Number(summary.imported_count ?? 0)
        const skipped = Number(summary.skipped_existing_count ?? 0)
        if (received !== batch.length || imported + skipped !== received) {
          throw new Error('Ringkasan hasil server pada batch ' + batchNumber + ' tidak konsisten. Periksa log sebelum mengulangi impor.')
        }

        counts.received += received
        counts.imported += imported
        counts.skipped += skipped
        counts.completedBatches += 1
        start += batch.length
        setPartial({ ...counts })
        setProgress(Math.round((counts.received / allItems.length) * 100))
      }

      if (counts.received !== allItems.length || counts.imported + counts.skipped !== counts.received) {
        throw new Error('Ringkasan akhir impor tidak konsisten. Periksa daftar logbook sebelum mengulangi impor.')
      }
      setResult({ ...counts })
      try {
        await onImported({ imported: counts.imported, skipped: counts.skipped, received: counts.received })
      } catch {
        setErrorMessage('Impor telah berhasil dicatat di server, tetapi daftar logbook belum berhasil dimuat ulang. Tutup dialog lalu muat ulang unit Laboratorium.')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impor Laboratorium gagal. Data tidak dianggap lengkap.')
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <div className="aqBack" role="presentation" onClick={event => { if (event.target === event.currentTarget) close() }}>
      <section className="aqDrawer aqLaboratoryImport" role="dialog" aria-modal="true" aria-labelledby="aqLaboratoryImportTitle">
        <style>{'.aqLaboratoryImport .aqBody{display:grid;align-content:start;gap:12px}.aqLaboratoryImport .ciIntro{font-size:12px;line-height:1.55;color:var(--muted)}.aqLaboratoryImport .ciUpload{display:grid;gap:8px;padding:13px;border:1px dashed var(--line);border-radius:13px;background:rgba(255,255,255,.65)}.aqLaboratoryImport .ciUpload input{width:100%;font-size:12px}.aqLaboratoryImport .ciStats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.aqLaboratoryImport .ciStat{padding:9px;background:#fff;border:1px solid var(--line);border-radius:11px;min-width:0}.aqLaboratoryImport .ciStat span{display:block;color:var(--muted);font-size:10px}.aqLaboratoryImport .ciStat strong{display:block;margin-top:4px;font-size:18px;overflow-wrap:anywhere}.aqLaboratoryImport .ciMessage{padding:11px 13px;border-radius:11px;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.aqLaboratoryImport .ciError{background:#fff0ef;color:#8b2822}.aqLaboratoryImport .ciSuccess{background:#eaf8ef;color:#206443}.aqLaboratoryImport .ciWarning{background:#fff8e7;color:#7b5d25}.aqLaboratoryImport .ciTable{overflow:auto;max-height:310px;border:1px solid var(--line);border-radius:11px}.aqLaboratoryImport table{width:100%;border-collapse:collapse;font-size:10px}.aqLaboratoryImport th,.aqLaboratoryImport td{padding:7px 8px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}.aqLaboratoryImport th{position:sticky;top:0;background:#f7faf8;white-space:nowrap}.aqLaboratoryImport td.ciWrap{white-space:normal;min-width:190px;max-width:360px;overflow-wrap:anywhere}.aqLaboratoryImport .ciPrivacy{font-size:10px;color:var(--muted);line-height:1.5}.aqLaboratoryImport .ciCode{font-size:9px;font-weight:800;border:1px solid var(--line);padding:3px 5px;border-radius:6px;display:inline-block;white-space:normal}.aqLaboratoryImport .ciPreviewName{white-space:nowrap}@media(max-width:800px){.aqLaboratoryImport .ciStats{grid-template-columns:repeat(2,minmax(0,1fr))}}'}</style>
        <div className="aqDHead">
          <div>
            <div className="eyebrow">Audit Indikator Mutu · Impor Terarah</div>
            <h4 id="aqLaboratoryImportTitle">Unggah workbook Instalasi Laboratorium</h4>
            <p>Profil 2026 · 5 indikator · satu event laboratorium per baris Logbook</p>
          </div>
          <button className="aqClose" type="button" disabled={parsing || importing} onClick={close} aria-label="Tutup">×</button>
        </div>
        <div className="aqBody">
          {!authorized && <div className="ciMessage ciError">Impor workbook hanya tersedia bagi administrator/Komite PMKP dengan akses ke Instalasi Laboratorium.</div>}
          {!eligible && <div className="ciMessage ciError">Pilih unit Instalasi Laboratorium dan tahun 2026 sebelum membuka alur impor ini.</div>}
          <div className="ciIntro">Sistem membaca sheet <strong>Logbook</strong>, header pada baris 2 (kolom sumber A:N), dan data mulai baris 3. Nomor urut yang terisi otomatis sampai baris 5.002 tidak dianggap sebagai baris operasional tanpa data sumber B:N. Kolom formula/turunan AE:AH, dashboard, profil, dan tab rekap tidak diimpor.</div>
          <div className="ciUpload">
            <label className="aqField"><span>Workbook Excel (.xlsx), maksimal 15 MB</span>
              <input key={fileInputKey} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!eligible || !authorized || parsing || importing} onChange={event => {
                const selectedFile = event.target.files?.[0]
                if (selectedFile) void parseWorkbook(selectedFile)
                event.currentTarget.value = ''
              }}/>
            </label>
            {file && <div className="ciPrivacy">Berkas dipilih: {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB · nama pasien dan No. RM disamarkan pada preview.</div>}
            <div className="ciPrivacy">Urutan indikator sumber dipetakan ke master secara eksplisit: Darah Terbuang → 9.1; Unordered Specimen → 9.2; Delay Sampling → 9.3; Lapor Tes Kritis → 9.4; Histopatologi → 9.5. Nomor baris fisik Excel menjadi kunci idempotensi; No. RM berulang tidak digabung. Seluruh catatan tersimpan sebagai Ready for Review.</div>
          </div>
          {parsing && <div className="ciMessage">Membaca Logbook dan memvalidasi header, timestamp, serta lima respons indikator Laboratorium…</div>}
          {errorMessage && <div className="ciMessage ciError" role="alert">{errorMessage}</div>}
          {(sourceRowCount > 0 || excludedRows.length > 0) && <div className="ciStats">
            <div className="ciStat"><span>Baris operasional</span><strong>{sourceRowCount}</strong></div>
            <div className="ciStat"><span>Siap diimpor</span><strong>{rows.length}</strong></div>
            <div className="ciStat"><span>Dikecualikan</span><strong>{excludedRows.length}</strong></div>
            <div className="ciStat"><span>Jawaban cocok</span><strong>{matchedCount}</strong></div>
            <div className="ciStat"><span>Perlu klasifikasi</span><strong>{unmatchedCount + blankCount}</strong></div>
          </div>}
          {ignoredSheetCount > 0 && <div className="ciPrivacy">{ignoredSheetCount} sheet non-Logbook diabaikan agar dashboard dan tab rekap tidak dihitung sebagai event.</div>}
          {excludedRows.length > 0 && <div className="ciMessage ciWarning" role="alert">
            <strong>{excludedRows.length} baris tidak ikut diimpor.</strong> Perbaiki timestamp atau struktur sumber berdasarkan dokumen resmi; sistem tidak menebak waktu kejadian.
            {'\n'}{excludedRows.slice(0, 50).map(row => 'Baris Excel ' + row.sourceRow + ' (No. sumber ' + (row.sourceNo || '—') + '): ' + row.reasons.join(' ')).join('\n')}
            {excludedRows.length > 50 ? '\n… dan ' + (excludedRows.length - 50) + ' baris lainnya.' : ''}
          </div>}
          {duplicateStats && (duplicateStats.medicalRecord.extraRows > 0 || duplicateStats.sourceNumber.extraRows > 0) && <div className="ciMessage ciWarning">
            <strong>Temuan pengulangan pada sumber.</strong>{'\n'}
            {duplicateStats.medicalRecord.extraRows > 0 ? 'No. Rekam Medis berulang pada ' + duplicateStats.medicalRecord.repeatedValues + ' nilai berbeda (' + duplicateStats.medicalRecord.extraRows + ' baris tambahan). Seluruh event tetap dipertahankan; tidak ada deduplikasi berdasarkan No. RM.' : ''}
            {duplicateStats.sourceNumber.extraRows > 0 ? (duplicateStats.medicalRecord.extraRows > 0 ? '\n' : '') + 'Kolom No. memiliki ' + duplicateStats.sourceNumber.extraRows + ' pengulangan; nomor ini hanya provenance.' : ''}
          </div>}
          {unmatchedCount > 0 && <div className="ciMessage ciWarning"><strong>{unmatchedCount} jawaban tidak cocok persis dengan opsi master.</strong> Nilai asli tetap disimpan pada provenance dan menunggu klasifikasi manual. Pemetaan tidak menggunakan fuzzy matching.</div>}
          {blankCount > 0 && <div className="ciMessage ciWarning"><strong>{blankCount} respons indikator kosong.</strong> Kolom yang kosong tetap kosong; sistem tidak menganggapnya sebagai kode 1 atau sebagai nilai yang tidak terjadi.</div>}
          {warningRows.length > 0 && <div className="ciMessage ciWarning"><strong>{warningRows.length} event memiliki catatan pemeriksaan sumber.</strong> Periksa metadata dan waktu selesai pada workbook sebelum validasi.</div>}
          {rows.length > 0 && <div className="ciTable">
            <table><thead><tr><th>Baris Excel</th><th>Waktu permintaan</th><th>Nama (masking)</th><th>No. RM (masking)</th><th>9.1 · Darah</th><th>9.2 · Unordered</th><th>9.3 · Delay</th><th>9.4 · Tes kritis</th><th>9.5 · Histopatologi</th><th>Catatan QA</th></tr></thead>
              <tbody>{rows.slice(0, 100).map(row => (
                <tr key={row.sourceRow}>
                  <td>{row.sourceRow}</td>
                  <td>{row.requestedAt.replace('T', ' ')}</td>
                  <td className="ciPreviewName">{maskLaboratoryPatientName(row.patientName)}</td>
                  <td className="ciPreviewName">{maskLaboratoryMedicalRecord(row.medicalRecordNo)}</td>
                  {LABORATORY_INDICATORS.map(indicator => <td className="ciWrap" key={indicator.code}><span className="ciCode">{choicePreview(row, indicator.code)}</span></td>)}
                  <td className="ciWrap" style={{ color: row.warnings.length ? '#8b5b13' : 'var(--muted)' }}>{row.warnings.length ? row.warnings.join(' ') : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
          {rows.length > 100 && <div className="ciPrivacy">Preview menampilkan 100 dari {rows.length} event yang siap diimpor.</div>}
          {partial && importing && <div className="ciMessage">Progres: {progress}% · {partial.completedBatches} batch selesai · {partial.imported} event baru · {partial.skipped} sudah ada dan dilewati.</div>}
          {partial && !importing && !result && partial.completedBatches > 0 && <div className="ciMessage ciWarning">Sebagian proses selesai sebelum terjadi kegagalan: {partial.received} baris diproses, {partial.imported} event baru tersimpan, {partial.skipped} sudah ada. Unggah ulang aman karena kunci setiap baris idempoten; periksa pesan galat sebelum mengulang.</div>}
          {result && <div className="ciMessage ciSuccess" role="status">Impor selesai untuk {result.received} event valid. {result.imported} event baru tersimpan; {result.skipped} baris yang sudah ada dilewati. {result.completedBatches} batch selesai; daftar dimuat ulang dari server. Record tetap Ready for Review.</div>}
        </div>
        <div className="aqFoot">
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Tinjau pilihan yang tidak cocok dan verifikasi setiap event sebelum validasi klinis.</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="aqBtn" disabled={parsing || importing} onClick={close}>Tutup</button>
            <button type="button" className="aqBtn primary" disabled={!eligible || !authorized || !rows.length || parsing || importing || !!result} onClick={() => void importRows()}>{importing ? 'Mengimpor…' : 'Impor ' + rows.length + ' event'}</button>
          </div>
        </div>
      </section>
    </div>
  )
}
