'use client'

import { useCallback, useMemo, useState } from 'react'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import { DEFAULT_IMPORT_BATCH_SIZE, MIN_IMPORT_BATCH_SIZE, isStatementTimeout, nextBatchSizeAfterTimeout } from '@/lib/aureka/import-batching'
import {
  giziSourceWarnings,
  maskGiziMedicalRecord,
  maskGiziPatientName,
  matchGiziOption,
  normalizeGiziDate,
  summarizeDuplicateValues,
  type GiziIndicatorOption,
} from '@/lib/aureka/gizi-logbook'
import { aurekaSupabase } from '@/lib/aureka/supabase'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_DATA_ROWS = 5000
const MAX_WORKSHEET_ROWS = 5003
const MAX_SHEETS = 50
const BATCH_SIZE = DEFAULT_IMPORT_BATCH_SIZE
const MIN_BATCH_SIZE = MIN_IMPORT_BATCH_SIZE

const INDICATORS = [
  { code: '7.1', header: 'Assessment', title: 'Kepatuhan Pelaksanaan Asesmen PAGT pada Pasien Berisiko Malnutrisi pada Hari Pertama Rawat' },
  { code: '7.2', header: 'Instruksi DPJP', title: 'Kepatuhan Preskripsi Diet Awal Spesifik oleh DPJP pada Pasien Gangguan Metabolik Terpilih' },
] as const

type IndicatorCode = typeof INDICATORS[number]['code']
type IndicatorProfile = Record<string, any> & {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  is_active?: boolean
  status?: string
  options_json?: GiziIndicatorOption[]
}
type PreparedRow = {
  sourceRow: number
  sourceNo: string
  patientName: string
  medicalRecordNo: string
  date: string
  admissionType: string
  dietitian: string
  dpjp: string
  answers: Partial<Record<IndicatorCode, GiziIndicatorOption>>
  rawAnswers: Record<IndicatorCode, string>
  warnings: string[]
}
type ExcludedRow = { sourceRow: number; sourceNo: string; reasons: string[] }
type ImportCounts = { received: number; imported: number; skipped: number; completedBatches: number }
type ImportResponse = { received_count?: number; imported_count?: number; skipped_existing_count?: number }
type DuplicateStats = {
  medicalRecord: { distinctValues: number; repeatedValues: number; extraRows: number }
  sourceNumber: { distinctValues: number; repeatedValues: number; extraRows: number }
}
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
  patientName: ['Column1', 'Nama Pasien'],
  medicalRecordNo: ['No. Rekam Medis', 'No RM', 'No. RM'],
  date: ['Tanggal Masuk'],
  admissionType: ['Rawat Inap'],
  dietitian: ['Nutrisionis'],
  assessment: ['Assessment'],
  dpjp: ['DPJP Utama', 'DPJP'],
  prescription: ['Instruksi DPJP', 'Instruksi'],
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
  if (value instanceof Date) return normalizeGiziDate(value) ?? ''
  return String(value).trim()
}

function findHeader(columns: Map<string, number>, candidates: string[]): number | null {
  for (const candidate of candidates) {
    const match = columns.get(normalizeExactHeader(candidate))
    if (match != null) return match
  }
  return null
}

function rowHasData(row: any, columns: Map<string, number>): boolean {
  return ['patientName', 'medicalRecordNo', 'date', 'admissionType', 'dietitian', 'assessment', 'dpjp', 'prescription'].some(key => {
    const column = findHeader(columns, REQUIRED_HEADERS[key])
    if (column == null) return false
    const cell = row.getCell(column)
    return isFormulaCell(cell) || String(readCellValue(cell) ?? '').trim() !== ''
  })
}

function makePayload(row: PreparedRow, fileName: string, userId: string, profiles: IndicatorProfile[]) {
  const sourceIndicatorValues: Record<IndicatorCode, string> = {
    '7.1': row.rawAnswers['7.1'],
    '7.2': row.rawAnswers['7.2'],
  }
  const indicatorValues: Record<string, Record<string, unknown>> = {}
  const responses: Array<Record<string, unknown>> = []

  for (const indicator of INDICATORS) {
    const profile = profiles.find(item =>
      Number(item.room_id) === 7 &&
      Number(item.profile_year) === 2026 &&
      String(item.code) === indicator.code &&
      item.id &&
      item.is_active === true &&
      item.status === 'published'
    )
    if (!profile?.id) throw new Error('Master indikator Gizi ' + indicator.code + ' tidak aktif/terbit. Muat ulang modul dan periksa master sebelum impor.')

    const option = row.answers[indicator.code]
    const sourceValue = row.rawAnswers[indicator.code]
    const matched = !!option
    const answer = option?.label ?? ''
    const responseCode = option?.code == null ? null : Number(option.code)
    const matchStatus = !sourceValue ? 'missing' : matched ? (option?.review_required ? 'needs_review' : 'matched') : 'unmatched'
    const responseValue = {
      answer,
      code: responseCode,
      source_value: sourceValue,
      match_status: matchStatus,
    }

    indicatorValues[indicator.code] = responseValue
    responses.push({
      indicator_id: profile.id,
      response_label: option?.label ?? null,
      response_code: responseCode,
      raw_value: responseValue,
      other_text: option?.code == null ? (sourceValue || null) : null,
      review_status: 'pending',
    })
  }

  const sourceImport = {
    source_workbook: fileName,
    source_sheet: 'Logbook',
    source_excel_row: row.sourceRow,
    source_excel_no: row.sourceNo || null,
    source_indicator_values: sourceIndicatorValues,
    source_warnings: row.warnings,
    import_scope: 'logbook_episode_rows_only',
    idempotency_basis: 'physical_excel_row_number',
  }
  const formFields: Record<string, unknown> = {
    'Nama Pasien': row.patientName,
    'No. Rekam Medis': row.medicalRecordNo,
    'Tanggal Masuk': row.date,
    'Rawat Inap': row.admissionType,
    'Nutrisionis': row.dietitian,
    'Nama Dokter': row.dpjp,
    'Instruksi': row.rawAnswers['7.2'],
  }
  const core = {
    patient_name: row.patientName,
    medical_record_no: row.medicalRecordNo,
    admission_at: row.date,
    unit_name: 'Instalasi Gizi',
    room_id: 7,
    status: 'Dilaporkan',
    workflow_status: 'Dilaporkan',
    form_fields: formFields,
    calculated_fields: {},
    indicator_values: indicatorValues,
    measurement_grain: 'patient_episode',
    source_import: sourceImport,
  }

  return {
    payload: {
      room_id: 7,
      profile_year: 2026,
      measurement_grain: 'patient_episode',
      record_date: row.date,
      subject_key: 'excel-pmkp-gizi-2026:row:' + row.sourceRow,
      subject_json: { source_import: sourceImport },
      core_data: core,
      status: 'ready',
      review_required: false,
      entered_by: userId,
    },
    responses,
    attributions: [],
  }
}

function choicePreview(row: PreparedRow, code: IndicatorCode): string {
  const option = row.answers[code]
  if (!row.rawAnswers[code]) return 'Kosong · perlu review'
  if (!option) return 'Tidak cocok master · perlu klasifikasi'
  return (option.code == null ? 'Review · ' : 'Kode ' + option.code + ' · ') + option.label
}

export default function GiziExcelImportDialog({
  open, roomId, year, authorized, profiles, onClose, onImported,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<PreparedRow[]>([])
  const [excludedRows, setExcludedRows] = useState<ExcludedRow[]>([])
  const [duplicateStats, setDuplicateStats] = useState<DuplicateStats | null>(null)
  const [sourceRowCount, setSourceRowCount] = useState(0)
  const [ignoredSheetCount, setIgnoredSheetCount] = useState(0)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportCounts | null>(null)
  const [partial, setPartial] = useState<ImportCounts | null>(null)
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const eligible = useMemo(() => open && authorized && roomId === 7 && year === 2026, [open, authorized, roomId, year])
  const warningRows = useMemo(() => rows.filter(row => row.warnings.length > 0), [rows])
  const assessmentCount = useMemo(() => rows.filter(row => !!row.answers['7.1']).length, [rows])
  const prescriptionCount = useMemo(() => rows.filter(row => !!row.answers['7.2']).length, [rows])

  const reset = useCallback(() => {
    setFile(null)
    setRows([])
    setExcludedRows([])
    setDuplicateStats(null)
    setSourceRowCount(0)
    setIgnoredSheetCount(0)
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
    setResult(null)
    setPartial(null)
    setProgress(0)
    setErrorMessage('')

    if (!eligible) {
      setErrorMessage('Pilih unit Instalasi Gizi dan tahun profil 2026 sebelum mengimpor.')
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
      if (!worksheet) throw new Error('Sheet "Logbook" tidak ditemukan. Periksa apakah workbook Instalasi Gizi yang benar dipilih.')
      if (worksheet.rowCount > MAX_WORKSHEET_ROWS) throw new Error('Sheet Logbook melewati batas ' + MAX_WORKSHEET_ROWS + ' baris fisik yang diizinkan.')
      setIgnoredSheetCount(Math.max(0, workbook.worksheets.length - 1))

      const columns = new Map<string, number>()
      const headerRow = worksheet.getRow(2)
      for (let column = 1; column <= Math.min(worksheet.columnCount, 100); column++) {
        const name = cellText(headerRow.getCell(column))
        if (!name) continue
        const normalized = normalizeExactHeader(name)
        if (columns.has(normalized)) throw new Error('Header ganda setelah normalisasi pada baris 2: "' + name + '".')
        columns.set(normalized, column)
      }

      const foundColumns: Record<string, number> = {}
      for (const [key, aliases] of Object.entries(REQUIRED_HEADERS)) {
        const index = findHeader(columns, aliases)
        if (index == null) throw new Error('Header wajib "' + aliases[0] + '" tidak ditemukan pada baris 2 sheet Logbook.')
        foundColumns[key] = index
      }

      const byCode: Record<IndicatorCode, IndicatorProfile> = {} as Record<IndicatorCode, IndicatorProfile>
      for (const indicator of INDICATORS) {
        const matches = profiles.filter(item =>
          Number(item.room_id) === 7 &&
          Number(item.profile_year) === 2026 &&
          String(item.code) === indicator.code &&
          item.is_active === true &&
          item.status === 'published'
        )
        if (matches.length !== 1 || !matches[0].id || !Array.isArray(matches[0].options_json)) {
          throw new Error('Master indikator ' + indicator.code + ' harus tepat satu, aktif, terbit, dan memiliki opsi. Muat ulang setelah master Instalasi Gizi diperiksa.')
        }
        byCode[indicator.code] = matches[0]
      }

      const parsed: PreparedRow[] = []
      const excluded: ExcludedRow[] = []
      const sourceNoValues: string[] = []
      const medicalRecordValues: string[] = []
      let actualSourceRows = 0

      for (let excelRow = 3; excelRow <= Math.min(worksheet.rowCount, MAX_WORKSHEET_ROWS); excelRow++) {
        const sourceRow = worksheet.getRow(excelRow)
        if (!rowHasData(sourceRow, columns)) continue
        actualSourceRows += 1
        if (actualSourceRows > MAX_DATA_ROWS) throw new Error('Workbook melebihi batas ' + MAX_DATA_ROWS + ' baris operasional.')

        const hasFormulaInSource = ['patientName', 'medicalRecordNo', 'date', 'admissionType', 'dietitian', 'assessment', 'dpjp', 'prescription']
          .some(key => isFormulaCell(sourceRow.getCell(foundColumns[key])))
        const sourceNo = cellText(sourceRow.getCell(foundColumns.sourceNo))
        const patientName = cellText(sourceRow.getCell(foundColumns.patientName))
        const medicalRecordNo = cellText(sourceRow.getCell(foundColumns.medicalRecordNo))
        const rawDate = readCellValue(sourceRow.getCell(foundColumns.date))
        const date = normalizeGiziDate(rawDate)
        const admissionType = cellText(sourceRow.getCell(foundColumns.admissionType))
        const dietitian = cellText(sourceRow.getCell(foundColumns.dietitian))
        const dpjp = cellText(sourceRow.getCell(foundColumns.dpjp))
        const rawAssessment = cellText(sourceRow.getCell(foundColumns.assessment))
        const rawPrescription = cellText(sourceRow.getCell(foundColumns.prescription))

        sourceNoValues.push(sourceNo)
        medicalRecordValues.push(medicalRecordNo)

        const reasons: string[] = []
        if (hasFormulaInSource) reasons.push('Terdapat formula pada kolom sumber; hasil formula tidak digunakan sebagai data klinis.')
        if (!date) {
          reasons.push(rawDate == null || String(rawDate).trim() === ''
            ? 'Tanggal Masuk kosong; tanggal tidak ditebak.'
            : 'Tanggal Masuk tidak valid; perbaiki berdasarkan sumber resmi.')
        } else if (date.slice(0, 4) !== '2026') {
          reasons.push('Tanggal berada di luar tahun profil 2026; baris tidak dimasukkan ke profil ini.')
        }
        if (reasons.length > 0) {
          excluded.push({ sourceRow: excelRow, sourceNo, reasons })
          continue
        }

        const rawAnswers: Record<IndicatorCode, string> = {
          '7.1': rawAssessment,
          '7.2': rawPrescription,
        }
        const answers: Partial<Record<IndicatorCode, GiziIndicatorOption>> = {}
        const warnings = giziSourceWarnings({
          patientName,
          medicalRecordNo,
          admissionType,
          dietitian,
          dpjp,
          assessment: rawAssessment,
          prescription: rawPrescription,
        })

        for (const indicator of INDICATORS) {
          const raw = rawAnswers[indicator.code]
          if (!raw) continue
          const option = matchGiziOption(raw, byCode[indicator.code].options_json ?? [])
          if (!option) {
            warnings.push('Pilihan sumber indikator ' + indicator.code + ' tidak cocok persis dengan opsi master; nilai sumber dipertahankan untuk klasifikasi manual.')
            continue
          }
          answers[indicator.code] = option
          if (option.code == null || option.review_required) {
            warnings.push('Pilihan indikator ' + indicator.code + ' memerlukan klasifikasi manual sebelum validasi.')
          }
        }

        parsed.push({
          sourceRow: excelRow,
          sourceNo,
          patientName,
          medicalRecordNo,
          date: date as string,
          admissionType,
          dietitian,
          dpjp,
          answers,
          rawAnswers,
          warnings,
        })
      }

      if (actualSourceRows === 0) throw new Error('Tidak ada baris operasional Logbook yang berisi data mulai dari baris 3.')
      const sourceNumberSummary = summarizeDuplicateValues(sourceNoValues)
      const medicalRecordSummary = summarizeDuplicateValues(medicalRecordValues)
      const sourceNumberCounts = new Map<string, number>()
      const medicalRecordCounts = new Map<string, number>()
      for (const value of sourceNoValues) if (value) sourceNumberCounts.set(value, (sourceNumberCounts.get(value) ?? 0) + 1)
      for (const value of medicalRecordValues) if (value) medicalRecordCounts.set(value, (medicalRecordCounts.get(value) ?? 0) + 1)
      const withDuplicateWarnings = parsed.map(row => {
        const warnings = [...row.warnings]
        if (row.sourceNo && (sourceNumberCounts.get(row.sourceNo) ?? 0) > 1) warnings.push('Nomor No. sumber berulang; tidak digunakan sebagai kunci impor.')
        if (row.medicalRecordNo && (medicalRecordCounts.get(row.medicalRecordNo) ?? 0) > 1) warnings.push('No. Rekam Medis muncul pada lebih dari satu baris sumber; periksa kemungkinan rawat ulang atau entri ganda.')
        return { ...row, warnings }
      })
      setDuplicateStats({ sourceNumber: sourceNumberSummary, medicalRecord: medicalRecordSummary })
      setSourceRowCount(actualSourceRows)
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
        const { data, error } = await quality().rpc('import_gizi_logbook_batch', { p_rows: batch })

        if (error) {
          if (/function .*import_gizi_logbook_batch.*not found|schema cache/i.test(error.message)) {
            throw new Error('Fungsi impor Gizi belum tersedia di Supabase. Pastikan migrasi secure_gizi_logbook_excel_import telah diterapkan.')
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
        setErrorMessage('Impor telah berhasil dicatat di server, tetapi daftar logbook belum berhasil dimuat ulang. Tutup dialog lalu muat ulang unit Gizi.')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impor Gizi gagal. Data tidak dianggap lengkap.')
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <div className="aqBack" role="presentation" onClick={event => { if (event.target === event.currentTarget) close() }}>
      <section className="aqDrawer aqGiziImport" role="dialog" aria-modal="true" aria-labelledby="aqGiziImportTitle">
        <style>{'.aqGiziImport .aqBody{display:grid;align-content:start;gap:12px}.aqGiziImport .ciIntro{font-size:12px;line-height:1.55;color:var(--muted)}.aqGiziImport .ciUpload{display:grid;gap:8px;padding:13px;border:1px dashed var(--line);border-radius:13px;background:rgba(255,255,255,.65)}.aqGiziImport .ciUpload input{width:100%;font-size:12px}.aqGiziImport .ciStats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.aqGiziImport .ciStat{padding:9px;background:#fff;border:1px solid var(--line);border-radius:11px;min-width:0}.aqGiziImport .ciStat span{display:block;color:var(--muted);font-size:10px}.aqGiziImport .ciStat strong{display:block;margin-top:4px;font-size:18px;overflow-wrap:anywhere}.aqGiziImport .ciMessage{padding:11px 13px;border-radius:11px;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.aqGiziImport .ciError{background:#fff0ef;color:#8b2822}.aqGiziImport .ciSuccess{background:#eaf8ef;color:#206443}.aqGiziImport .ciWarning{background:#fff8e7;color:#7b5d25}.aqGiziImport .ciTable{overflow:auto;max-height:310px;border:1px solid var(--line);border-radius:11px}.aqGiziImport table{width:100%;border-collapse:collapse;font-size:10px}.aqGiziImport th,.aqGiziImport td{padding:7px 8px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}.aqGiziImport th{position:sticky;top:0;background:#f7faf8;white-space:nowrap}.aqGiziImport td.ciWrap{white-space:normal;min-width:190px;max-width:360px;overflow-wrap:anywhere}.aqGiziImport .ciPrivacy{font-size:10px;color:var(--muted);line-height:1.5}.aqGiziImport .ciCode{font-size:9px;font-weight:800;border:1px solid var(--line);padding:3px 5px;border-radius:6px;display:inline-block;white-space:normal}.aqGiziImport .ciPreviewName{white-space:nowrap}@media(max-width:800px){.aqGiziImport .ciStats{grid-template-columns:repeat(2,minmax(0,1fr))}}'}</style>
        <div className="aqDHead">
          <div>
            <div className="eyebrow">Audit Indikator Mutu · Impor Terarah</div>
            <h4 id="aqGiziImportTitle">Unggah workbook Instalasi Gizi</h4>
            <p>Profil 2026 · 2 indikator · satu episode pasien per baris Logbook</p>
          </div>
          <button className="aqClose" type="button" disabled={parsing || importing} onClick={close} aria-label="Batal">×</button>
        </div>
        <div className="aqBody">
          {!authorized && <div className="ciMessage ciError">Impor workbook hanya tersedia bagi administrator/Komite PMKP dengan akses ke unit Instalasi Gizi.</div>}
          {!eligible && <div className="ciMessage ciError">Pilih unit Instalasi Gizi dan tahun 2026 sebelum membuka alur impor ini.</div>}
          <div className="ciIntro">Sistem membaca sheet <strong>Logbook</strong>, header pada baris 2, dan data mulai baris 3. Sheet Profil, Dashboard, dan sheet rekap lainnya tidak diimpor karena bukan sumber episode pasien. Nomor baris fisik Excel menjadi kunci idempotensi; No. urut dan No. RM tidak dipakai untuk menghapus atau menggabungkan episode.</div>
          <div className="ciUpload">
            <label className="aqField"><span>Workbook Excel (.xlsx), maksimal 15 MB</span>
              <input key={fileInputKey} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!eligible || !authorized || parsing || importing} onChange={event => {
                const selectedFile = event.target.files?.[0]
                if (selectedFile) void parseWorkbook(selectedFile)
                event.currentTarget.value = ''
              }}/>
            </label>
            {file && <div className="ciPrivacy">Berkas dipilih: {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB · identitas pasien disamarkan pada preview.</div>}
            <div className="ciPrivacy">Satu baris Logbook menjadi satu episode pasien dengan dua respons indikator 7.1 dan 7.2. Formula pada sel sumber tidak digunakan. Tanggal kosong/tidak valid dan formula pada kolom klinis dikecualikan; respons indikator kosong/tidak cocok tetap disimpan sebagai temuan untuk review, bukan ditebak. Seluruh record berstatus Ready for Review.</div>
          </div>
          {parsing && <div className="ciMessage">Membaca sheet Logbook dan memvalidasi tanggal, identitas, serta dua pilihan indikator Gizi…</div>}
          {errorMessage && <div className="ciMessage ciError" role="alert">{errorMessage}</div>}
          {(sourceRowCount > 0 || excludedRows.length > 0) && <div className="ciStats">
            <div className="ciStat"><span>Baris operasional</span><strong>{sourceRowCount}</strong></div>
            <div className="ciStat"><span>Siap diimpor</span><strong>{rows.length}</strong></div>
            <div className="ciStat"><span>Dikecualikan</span><strong>{excludedRows.length}</strong></div>
            <div className="ciStat"><span>Respons 7.1 cocok</span><strong>{assessmentCount}</strong></div>
            <div className="ciStat"><span>Respons 7.2 cocok</span><strong>{prescriptionCount}</strong></div>
          </div>}
          {ignoredSheetCount > 0 && <div className="ciPrivacy">{ignoredSheetCount} sheet non-Logbook diabaikan agar tabel dashboard/rekap tidak dihitung sebagai episode.</div>}
          {excludedRows.length > 0 && <div className="ciMessage ciWarning" role="alert">
            <strong>{excludedRows.length} baris tidak ikut diimpor.</strong> Perbaiki tanggal atau struktur sumber menggunakan dokumen resmi; sistem tidak mengisi tanggal secara otomatis.{'\\n'}
            {excludedRows.slice(0, 50).map(row => 'Baris Excel ' + row.sourceRow + ' (No. sumber ' + (row.sourceNo || '—') + '): ' + row.reasons.join(' ')).join('\\n')}
            {excludedRows.length > 50 ? '\\n… dan ' + (excludedRows.length - 50) + ' baris lainnya.' : ''}
          </div>}
          {duplicateStats && (duplicateStats.medicalRecord.extraRows > 0 || duplicateStats.sourceNumber.extraRows > 0) && <div className="ciMessage ciWarning">
            <strong>Temuan pengulangan pada sumber.</strong>{'\\n'}
            {duplicateStats.medicalRecord.extraRows > 0 ? 'No. Rekam Medis berulang pada ' + duplicateStats.medicalRecord.repeatedValues + ' nilai berbeda (' + duplicateStats.medicalRecord.extraRows + ' baris tambahan). Episode tetap dipertahankan terpisah; verifikasi kemungkinan rawat ulang atau entri ganda.' : ''}
            {duplicateStats.sourceNumber.extraRows > 0 ? (duplicateStats.medicalRecord.extraRows > 0 ? '\\n' : '') + 'Kolom No. memiliki ' + duplicateStats.sourceNumber.extraRows + ' pengulangan; nomor ini hanya provenance dan tidak menjadi kunci impor.' : ''}
          </div>}
          {rows.some(row => row.warnings.length > 0) && <div className="ciMessage ciWarning"><strong>{warningRows.length} episode perlu pemeriksaan sumber.</strong> Nilai asli dipertahankan pada provenance; respons yang kosong atau tidak cocok dengan master tidak diklasifikasikan otomatis.</div>}
          {rows.length > 0 && <div className="ciTable">
            <table><thead><tr><th>Baris Excel</th><th>Tanggal masuk</th><th>Nama (masking)</th><th>No. RM (masking)</th><th>7.1 · Assessment</th><th>7.2 · Instruksi DPJP</th><th>Catatan QA</th></tr></thead>
              <tbody>{rows.slice(0, 120).map(row => (
                <tr key={row.sourceRow}>
                  <td>{row.sourceRow}</td>
                  <td>{row.date}</td>
                  <td className="ciPreviewName">{maskGiziPatientName(row.patientName)}</td>
                  <td className="ciPreviewName">{maskGiziMedicalRecord(row.medicalRecordNo)}</td>
                  <td className="ciWrap"><span className="ciCode">{choicePreview(row, '7.1')}</span></td>
                  <td className="ciWrap"><span className="ciCode">{choicePreview(row, '7.2')}</span></td>
                  <td className="ciWrap" style={{ color: row.warnings.length ? '#8b5b13' : 'var(--muted)' }}>{row.warnings.length ? row.warnings.join(' ') : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
          {rows.length > 120 && <div className="ciPrivacy">Preview menampilkan 120 dari {rows.length} episode yang siap diimpor.</div>}
          {partial && importing && <div className="ciMessage">Progres: {progress}% · {partial.completedBatches} batch selesai · {partial.imported} episode baru · {partial.skipped} sudah ada dan dilewati.</div>}
          {partial && !importing && !result && partial.completedBatches > 0 && <div className="ciMessage ciWarning">Sebagian proses selesai sebelum terjadi kegagalan: {partial.received} baris diproses, {partial.imported} episode baru tersimpan, {partial.skipped} sudah ada. Unggah ulang aman karena kunci setiap baris idempoten; periksa pesan galat sebelum mengulang.</div>}
          {result && <div className="ciMessage ciSuccess" role="status">Impor selesai untuk {result.received} episode valid. {result.imported} episode baru tersimpan; {result.skipped} baris yang sudah ada dilewati. {result.completedBatches} batch selesai; daftar dimuat ulang dari server. Record tetap Ready for Review.</div>}
        </div>
        <div className="aqFoot">
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Verifikasi seluruh temuan sumber sebelum validasi klinis.</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="aqBtn" disabled={parsing || importing} onClick={close}>Batal</button>
            <button type="button" className="aqBtn primary" disabled={!eligible || !authorized || !rows.length || parsing || importing || !!result} onClick={() => void importRows()}>{importing ? 'Mengimpor…' : 'Impor ' + rows.length + ' episode'}</button>
          </div>
        </div>
      </section>
    </div>
  )
}
