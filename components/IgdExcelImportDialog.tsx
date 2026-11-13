'use client'

import { useState } from 'react'
import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import { DEFAULT_IMPORT_BATCH_SIZE, MIN_IMPORT_BATCH_SIZE, isStatementTimeout, nextBatchSizeAfterTimeout } from '@/lib/aureka/import-batching'
import {
  IGD_INDICATORS,
  calculateIgdElapsedMinutes,
  igdDateOnly,
  maskIgdMedicalRecord,
  maskIgdPatientName,
  matchIgdConsultationToEncounter,
  matchIgdSourceOption,
  normalizeIgdDateTime,
  parseIgdMonthFromFilename,
  igdSourceWarnings,
  type IgdIndicatorOption,
} from '@/lib/aureka/igd-logbook'
import { aurekaSupabase } from '@/lib/aureka/supabase'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 25 * 1024 * 1024
const MAX_MAIN_ROWS = 20000
const MAX_WORKSHEET_ROWS = 25000
const MAX_SHEETS = 50
const BATCH_SIZE = DEFAULT_IMPORT_BATCH_SIZE
const MIN_BATCH_SIZE = MIN_IMPORT_BATCH_SIZE
const MAIN_KEY_PREFIX = 'excel-pmkp-igd-2026:'

type IndicatorProfile = Record<string, any> & {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  is_active?: boolean
  status?: string
  options_json?: IgdIndicatorOption[]
  schema_json?: Record<string, any>
}
type MainRow = {
  sourceRow: number
  sourceNo: string
  sourceKey: string
  patientName: string
  medicalRecordNo: string
  diagnosis: string
  admissionAt: string
  rawAdmissionAt: string
  transferAt: string
  destination: string
  receivingNurse: string
  generalDoctor: string
  dpjp: string
  rawIndicators: Record<string, string>
  matchedIndicators: Record<string, IgdIndicatorOption | null>
  extraSource: Record<string, string>
  warnings: string[]
}
type ExcludedRow = { sourceRow: number; sourceNo: string; reason: string }
type ConsultRow = {
  sourceKey: string
  sourceWorkbook: string
  sourceHash: string
  sourceSheet: string
  sourceRow: number
  sourceMonth: number
  sourceNo: string
  patientName: string
  medicalRecordNo: string
  age: string
  sex: string
  patientType: string
  requestingDoctor: string
  specialist: string
  nurse: string
  registrationAt: string | null
  rawRegistrationAt: string
  consultationAt: string | null
  rawConsultationAt: string
  reportedElapsedMinutes: number | null
  rawReportedElapsed: string
  calculatedElapsedMinutes: number | null
  doorToDecisionSource: string
  performanceLabel: string
  reasonCode: string
  reasonOther: string
  linkedSubjectKey: string | null
  matchStatus: string
  matchNote: string
  warnings: string[]
}
type ImportCounts = { received: number; imported: number; skipped: number; batches: number }
type ImportResponse = {
  received_count?: number
  imported_count?: number
  skipped_existing_count?: number
  record_mappings?: Array<{ subject_key: string; record_id: string }>
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

const FIELD_HEADERS = {
  sourceNo: ['No', 'No.'],
  patientName: ['Nama Pasien'],
  medicalRecordNo: ['No. Rekam Medis', 'No RM', 'No. RM'],
  diagnosis: ['Diagnosa IGD'],
  admissionAt: ['Waktu Masuk'],
  transferAt: ['Waktu Transfer'],
  destination: ['Tujuan'],
  receivingNurse: ['Perawat Penerima'],
  generalDoctor: ['Dokter Umum'],
  dpjp: ['DPJP'],
} as const

const CONSULT_HEADERS = {
  sourceNo: ['No', 'No.'],
  medicalRecordNo: ['No RM', 'No. RM', 'No. Rekam Medis'],
  patientName: ['Nama Pasien'],
  age: ['Umur'],
  sex: ['Jenis Kelamin'],
  patientType: ['Jenis Pasien'],
  requestingDoctor: ['Dokter IGD', 'Dokter Umum'],
  specialist: ['Dokter Spesialis'],
  nurse: ['Perawat'],
  registrationAt: ['Waktu Registrasi'],
  doorToDecision: ['Door-to-Decision'],
  consultationAt: ['Waktu Konsultasi DPJP'],
  reportedElapsed: ['Target capaian', 'Target Capaian'],
  performanceLabel: ['Capaian mutu', 'Capaian Mutu'],
  reasonCode: ['Alasan tidak tercapai mutu', 'Alasan Tidak Tercapai Mutu'],
  reasonOther: ['Alasan lain', 'Alasan Lain'],
} as const

const ACTIVE_HEADER_BY_CODE: Record<string, string> = {
  '6.1': 'Kematian IGD ≤8h',
  '6.2': 'Door-to-Decision',
  '6.3': 'Response Time DPJP',
  '6.4': 'Antrian Rawat Inap',
  '6.5': 'Kelengkapan Assessment Keperawatan',
  '6.6': 'Overcrowding Index',
  '6.7': 'Response Triage',
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
  if (value instanceof Date) return normalizeIgdDateTime(value) ?? ''
  return String(value).trim()
}

function findHeader(columns: Map<string, number>, candidates: readonly string[]): number | null {
  for (const candidate of candidates) {
    const index = columns.get(normalizeExactHeader(candidate))
    if (index != null) return index
  }
  return null
}

function buildHeaderMap(worksheet: any, headerRowNumber: number, maxColumns: number): Map<string, number> {
  const result = new Map<string, number>()
  const row = worksheet.getRow(headerRowNumber)
  for (let column = 1; column <= maxColumns; column++) {
    const value = cellText(row.getCell(column))
    if (!value) continue
    const key = normalizeExactHeader(value)
    if (!result.has(key)) result.set(key, column)
  }
  return result
}

function valueLooksPresent(value: unknown): boolean {
  return value instanceof Date || (value != null && String(value).trim() !== '')
}

function parseNumber(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null
  const number = typeof value === 'number' ? value : Number(String(value).trim().replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function mask(value: unknown, kind: 'name' | 'mrn'): string {
  return kind === 'name' ? maskIgdPatientName(value) : maskIgdMedicalRecord(value)
}

async function sha256(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Browser tidak menyediakan SHA-256. Gunakan browser modern dengan konteks HTTPS untuk impor yang idempoten.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, '0')).join('')
}

function mapProfiles(profiles: IndicatorProfile[]): Map<string, IndicatorProfile> {
  const output = new Map<string, IndicatorProfile>()
  for (const indicator of IGD_INDICATORS) {
    const matches = profiles.filter(profile =>
      Number(profile.room_id) === 6 &&
      Number(profile.profile_year) === 2026 &&
      String(profile.code) === indicator.code &&
      profile.is_active === true &&
      profile.status === 'published'
    )
    if (matches.length !== 1 || !matches[0].id || !Array.isArray(matches[0].options_json)) {
      throw new Error('Master indikator IGD ' + indicator.code + ' harus tepat satu, aktif, published, dan memiliki options_json. Impor dihentikan.')
    }
    const profile = matches[0]
    const header = String(profile.schema_json?.header_label ?? '').trim()
    if (header !== indicator.header || header !== ACTIVE_HEADER_BY_CODE[indicator.code]) {
      throw new Error('Header master indikator ' + indicator.code + ' tidak cocok dengan mapping sumber "' + indicator.header + '". Perbaiki master terlebih dahulu.')
    }
    output.set(indicator.code, profile)
  }
  return output
}

function makeMainPayload(row: MainRow, fileName: string, fileHash: string, userId: string, byCode: Map<string, IndicatorProfile>) {
  const indicatorValues: Record<string, Record<string, unknown>> = {}
  const responses: Array<Record<string, unknown>> = []
  for (const indicator of IGD_INDICATORS) {
    const profile = byCode.get(indicator.code)
    if (!profile?.id) throw new Error('ID profil indikator ' + indicator.code + ' tidak tersedia.')
    const raw = row.rawIndicators[indicator.code] ?? ''
    const option = row.matchedIndicators[indicator.code] ?? null
    const code = option?.code == null ? null : Number(option.code)
    const matchStatus = !raw ? 'missing' : !option ? 'unmatched' :
      code == null || option.review_required ? 'needs_review' : 'matched'
    const value = { answer: option?.label ?? '', code, source_value: raw, match_status: matchStatus }
    indicatorValues[indicator.code] = value
    responses.push({
      indicator_id: profile.id,
      response_label: option?.label ?? null,
      response_code: code,
      raw_value: value,
      other_text: matchStatus === 'unmatched' || matchStatus === 'needs_review' ? raw || null : null,
      review_status: 'pending',
    })
  }

  const formFields = {
    'Nama Pasien': row.patientName,
    'No. Rekam Medis': row.medicalRecordNo,
    'Diagnosa IGD': row.diagnosis,
    'Waktu Masuk': row.admissionAt,
    'Waktu Transfer': row.transferAt,
    'Tujuan': row.destination,
    'Perawat Penerima': row.receivingNurse,
    'Dokter Umum': row.generalDoctor,
    'DPJP': row.dpjp,
  }
  const sourceImport = {
    source_workbook: fileName,
    source_file_sha256: fileHash,
    source_sheet: 'Logbook',
    source_excel_row: row.sourceRow,
    source_excel_no: row.sourceNo || null,
    source_indicator_values: row.rawIndicators,
    source_extra_values: row.extraSource,
    source_raw_values: { 'Waktu Masuk': row.rawAdmissionAt, 'Waktu Transfer': row.transferAt, 'No. Rekam Medis': row.medicalRecordNo },
    source_warnings: row.warnings,
    idempotency_basis: 'sha256_plus_physical_excel_row',
    import_scope: 'igd_patient_episode_logbook',
  }
  const core = {
    patient_name: row.patientName,
    medical_record_no: row.medicalRecordNo,
    admission_at: row.admissionAt,
    unit_name: 'Instalasi Gawat Darurat',
    room_id: 6,
    status: 'Ready for Review',
    workflow_status: 'Ready for Review',
    form_fields: formFields,
    calculated_fields: {},
    indicator_values: indicatorValues,
    measurement_grain: 'patient_episode',
    source_import: sourceImport,
  }

  return {
    payload: {
      room_id: 6,
      profile_year: 2026,
      measurement_grain: 'patient_episode',
      record_date: row.admissionAt.slice(0, 10),
      subject_key: row.sourceKey,
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

export default function IgdExcelImportDialog({
  open, roomId, year, authorized, profiles, onClose, onImported,
}: Props) {
  const [mainFile, setMainFile] = useState<File | null>(null)
  const [mainRows, setMainRows] = useState<MainRow[]>([])
  const [mainExcluded, setMainExcluded] = useState<ExcludedRow[]>([])
  const [mainFileHash, setMainFileHash] = useState('')
  const [mainReady, setMainReady] = useState(false)
  const [mainParsing, setMainParsing] = useState(false)
  const [mainImporting, setMainImporting] = useState(false)
  const [mainResult, setMainResult] = useState<ImportCounts | null>(null)
  const [mainProgress, setMainProgress] = useState(0)
  const [recordIds, setRecordIds] = useState<Record<string, string>>({})
  const [consultFiles, setConsultFiles] = useState<File[]>([])
  const [consultRows, setConsultRows] = useState<ConsultRow[]>([])
  const [consultParsing, setConsultParsing] = useState(false)
  const [consultImporting, setConsultImporting] = useState(false)
  const [consultResult, setConsultResult] = useState<ImportCounts | null>(null)
  const [consultProgress, setConsultProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const [activeImportTab, setActiveImportTab] = useState<'logbook' | 'consultation'>('logbook')
  const eligible = open && authorized && roomId === 6 && year === 2026
  const parsing = mainParsing || consultParsing
  const importing = mainImporting || consultImporting
  const busy = parsing || importing

  const close = () => {
    if (parsing || importing) return
    setMainFile(null)
    setMainRows([])
    setMainExcluded([])
    setMainFileHash('')
    setMainReady(false)
    setMainImporting(false)
    setMainResult(null)
    setMainProgress(0)
    setRecordIds({})
    setConsultFiles([])
    setConsultRows([])
    setConsultResult(null)
    setConsultProgress(0)
    setErrorMessage('')
    setActiveImportTab('logbook')
    setFileInputKey(value => value + 1)
    onClose()
  }
  const importDialogRef=useAccessibleDialog<HTMLElement>({open,onClose:close,lockScroll:true})

  const parseMainWorkbook = async (selectedFile: File) => {
    setActiveImportTab('logbook')
    setMainFile(selectedFile)
    setMainRows([])
    setMainExcluded([])
    setMainFileHash('')
    setMainReady(false)
    setMainResult(null)
    setRecordIds({})
    setConsultRows([])
    setConsultResult(null)
    setErrorMessage('')
    if (!eligible) { setErrorMessage('Pilih Instalasi Gawat Darurat dan profil tahun 2026 sebelum mengimpor.'); return }
    if (!/\.xlsx$/i.test(selectedFile.name)) { setErrorMessage('Pilih workbook .xlsx.'); return }
    if (selectedFile.size <= 0 || selectedFile.size > MAX_FILE_BYTES) { setErrorMessage('Ukuran workbook harus lebih besar dari 0 dan tidak melebihi 25 MB.'); return }

    setMainParsing(true)
    try {
      const fileHash = await sha256(selectedFile)
      const ExcelJSModule = await import('exceljs-hardened')
      const ExcelJS: any = (ExcelJSModule as any).default ?? ExcelJSModule
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await selectedFile.arrayBuffer())
      if (!Array.isArray(workbook.worksheets) || workbook.worksheets.length === 0 || workbook.worksheets.length > MAX_SHEETS) {
        throw new Error('Struktur workbook tidak wajar atau jumlah sheet melebihi batas ' + MAX_SHEETS + '.')
      }
      const worksheet = workbook.getWorksheet('Logbook')
      if (!worksheet) throw new Error('Sheet "Logbook" tidak ditemukan pada workbook induk IGD.')
      if (worksheet.rowCount > MAX_WORKSHEET_ROWS) throw new Error('Sheet Logbook melewati batas ' + MAX_WORKSHEET_ROWS + ' baris fisik.')

      const headers = buildHeaderMap(worksheet, 3, 23)
      const columns: Record<string, number> = {}
      for (const [key, aliases] of Object.entries(FIELD_HEADERS)) {
        const index = findHeader(headers, aliases)
        if (index == null) throw new Error('Header wajib "' + aliases[0] + '" tidak ditemukan pada baris 3 Logbook.')
        columns[key] = index
      }
      const extraQueueColumn = headers.get(normalizeExactHeader('Antrian Pasien')) ?? null
      const indicatorColumns = new Map<string, number>()
      for (const indicator of IGD_INDICATORS) {
        const index = headers.get(normalizeExactHeader(indicator.header))
        if (index == null) throw new Error('Kolom indikator sumber "' + indicator.header + '" tidak ditemukan pada Logbook.')
        indicatorColumns.set(indicator.code, index)
      }
      const byCode = mapProfiles(profiles)
      const parsed: MainRow[] = []
      const excluded: ExcludedRow[] = []
      let sourceRows = 0

      for (let excelRow = 4; excelRow <= Math.min(worksheet.rowCount, MAX_WORKSHEET_ROWS); excelRow++) {
        const sourceRow = worksheet.getRow(excelRow)
        const operationalValues = [2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18]
        if (!operationalValues.some(column => valueLooksPresent(readCellValue(sourceRow.getCell(column))))) continue
        sourceRows += 1
        if (sourceRows > MAX_MAIN_ROWS) throw new Error('Workbook melebihi batas ' + MAX_MAIN_ROWS + ' baris operasional.')

        const sourceNo = cellText(sourceRow.getCell(columns.sourceNo))
        const patientName = cellText(sourceRow.getCell(columns.patientName))
        const rawMedicalRecordValue = readCellValue(sourceRow.getCell(columns.medicalRecordNo))
        const medicalRecordNo = rawMedicalRecordValue == null ? '' : String(rawMedicalRecordValue).trim()
        const rawAdmission = readCellValue(sourceRow.getCell(columns.admissionAt))
        const admissionAt = normalizeIgdDateTime(rawAdmission)
        const rawAdmissionAt = rawAdmission instanceof Date ? normalizeIgdDateTime(rawAdmission) ?? '' : String(rawAdmission ?? '').trim()
        const rawTransfer = readCellValue(sourceRow.getCell(columns.transferAt))
        const transferAt = rawTransfer instanceof Date ? normalizeIgdDateTime(rawTransfer) ?? '' : String(rawTransfer ?? '').trim()
        const rawIndicators: Record<string, string> = {}
        const matchedIndicators: Record<string, IgdIndicatorOption | null> = {}
        const warnings = igdSourceWarnings({
          patientName,
          medicalRecordNo,
          admissionAt,
          transferAt,
        })
        if (typeof rawMedicalRecordValue === 'number') warnings.push('No. RM dibaca sebagai angka Excel; nilai disimpan persis sebagaimana dibaca dan nol di depan tidak ditebak.')
        const formulaFields = Object.entries(columns).filter(([key, column]) => key !== 'sourceNo' && isFormulaCell(sourceRow.getCell(column))).map(([key]) => key)
        if (formulaFields.length) warnings.push('Kolom identitas/waktu berisi formula (' + formulaFields.join(', ') + '); output formula tidak digunakan sebagai sumber klinis.')
        const formulaSources: string[] = []

        for (const indicator of IGD_INDICATORS) {
          const column = indicatorColumns.get(indicator.code) as number
          const cell = sourceRow.getCell(column)
          if (isFormulaCell(cell)) formulaSources.push(indicator.header)
          const raw = cellText(cell)
          rawIndicators[indicator.code] = raw
          const profile = byCode.get(indicator.code) as IndicatorProfile
          const option = matchIgdSourceOption(raw, profile.options_json ?? [])
          matchedIndicators[indicator.code] = option
          if (raw && !option) warnings.push('Respons "' + indicator.header + '" tidak cocok persis dengan opsi profil; nilai asli dipertahankan dan menunggu klasifikasi.')
        }
        if (formulaSources.length) warnings.push('Kolom indikator berisi formula sumber (' + formulaSources.join(', ') + '); nilai formula tidak diperlakukan sebagai jawaban yang sah.')
        if (!admissionAt) {
          excluded.push({ sourceRow: excelRow, sourceNo, reason: 'Waktu Masuk kosong/tidak valid; tanggal episode tidak ditebak.' })
          continue
        }
        if (!admissionAt.startsWith('2026-')) {
          excluded.push({ sourceRow: excelRow, sourceNo, reason: 'Waktu Masuk di luar tahun profil 2026; baris dipertahankan pada daftar pengecualian.' })
          continue
        }

        parsed.push({
          sourceRow: excelRow,
          sourceNo,
          sourceKey: MAIN_KEY_PREFIX + fileHash + ':row:' + excelRow,
          patientName,
          medicalRecordNo,
          diagnosis: cellText(sourceRow.getCell(columns.diagnosis)),
          admissionAt,
          rawAdmissionAt,
          transferAt,
          destination: cellText(sourceRow.getCell(columns.destination)),
          receivingNurse: cellText(sourceRow.getCell(columns.receivingNurse)),
          generalDoctor: cellText(sourceRow.getCell(columns.generalDoctor)),
          dpjp: cellText(sourceRow.getCell(columns.dpjp)),
          rawIndicators,
          matchedIndicators,
          extraSource: extraQueueColumn == null ? {} : { 'Antrian Pasien': cellText(sourceRow.getCell(extraQueueColumn)) },
          warnings,
        })
      }
      if (!sourceRows) throw new Error('Tidak ditemukan baris operasional pada kolom sumber B:R mulai baris 4.')
      setMainRows(parsed.sort((a, b) => a.sourceRow - b.sourceRow))
      setMainExcluded(excluded.sort((a, b) => a.sourceRow - b.sourceRow))
      setMainFileHash(fileHash)
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Workbook induk IGD tidak dapat dibaca.')
      setMainRows([])
      setMainExcluded([])
    } finally {
      setMainParsing(false)
    }
  }

  const importMain = async () => {
    if (!mainFile || !mainRows.length || !eligible || !authorized || mainImporting || mainResult) return
    setMainImporting(true)
    setErrorMessage('')
    setMainProgress(0)
    try {
      const byCode = mapProfiles(profiles)
      const auth = await sb.auth.getUser()
      if (auth.error) throw auth.error
      const userId = auth.data.user?.id
      if (!userId) throw new Error('Sesi login tidak ditemukan. Masuk ke AUREKA lalu ulangi impor.')

      const allItems = mainRows.map(row => makeMainPayload(row, mainFile.name, mainFileHash, userId, byCode))
      const counts: ImportCounts = { received: 0, imported: 0, skipped: 0, batches: 0 }
      const ids: Record<string, string> = {}
      let start = 0
      let batchSize = BATCH_SIZE
      while (start < allItems.length) {
        const batch = allItems.slice(start, start + batchSize)
        const { data, error } = await quality().rpc('import_igd_logbook_batch', { p_rows: batch })
        if (error) {
          if (/function .*import_igd_logbook_batch.*not found|schema cache/i.test(error.message)) {
            throw new Error('RPC impor IGD belum tersedia. Terapkan migrasi secure_igd_workbook_import terlebih dahulu.')
          }
          const smaller = nextBatchSizeAfterTimeout(error, batchSize, MIN_BATCH_SIZE)
          if (smaller != null) {
            batchSize = smaller
            setErrorMessage('Server membatasi transaksi. Batch diubah menjadi ' + batchSize + ' baris; batch yang sama akan diulang secara aman.')
            continue
          }
          throw new Error('Batch logbook ' + (counts.batches + 1) + ' gagal: ' + error.message)
        }
        const summary = (data ?? {}) as ImportResponse
        const received = Number(summary.received_count ?? batch.length)
        const imported = Number(summary.imported_count ?? 0)
        const skipped = Number(summary.skipped_existing_count ?? 0)
        if (received !== batch.length || imported + skipped !== received) throw new Error('Ringkasan batch logbook tidak konsisten.')
        for (const item of summary.record_mappings ?? []) {
          if (item.subject_key && item.record_id) ids[item.subject_key] = item.record_id
        }
        counts.received += received
        counts.imported += imported
        counts.skipped += skipped
        counts.batches += 1
        start += batch.length
        setMainProgress(Math.round((counts.received / allItems.length) * 100))
      }
      if (counts.received !== allItems.length || counts.imported + counts.skipped !== counts.received) throw new Error('Rekap akhir impor logbook tidak konsisten.')
      if (Object.keys(ids).length !== allItems.length) throw new Error('Server tidak mengembalikan seluruh pemetaan ID episode. Data tersimpan, tetapi impor audit konsultasi ditahan sampai relasi dapat diverifikasi.')
      setRecordIds(ids)
      setMainResult(counts)
      setMainReady(true)
      try { await onImported({ imported: counts.imported, skipped: counts.skipped, received: counts.received }) } catch {
        setErrorMessage('Impor logbook telah tersimpan, tetapi daftar belum termuat ulang. Tutup dialog lalu muat ulang unit IGD.')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impor logbook IGD gagal.')
    } finally {
      setMainImporting(false)
    }
  }

  const parseConsultationFiles = async (files: File[]) => {
    setConsultFiles(files)
    setConsultRows([])
    setConsultResult(null)
    setErrorMessage('')
    if (!eligible || !mainReady || !mainRows.length || Object.keys(recordIds).length !== mainRows.length) {
      setErrorMessage('Impor logbook utama IGD sampai selesai terlebih dahulu agar audit konsultasi dapat ditautkan ke episode yang benar.')
      return
    }
    if (!files.length) return
    if (files.some(file => !/\.xlsx$/i.test(file.name) || file.size <= 0 || file.size > MAX_FILE_BYTES)) {
      setErrorMessage('Semua file konsultasi harus berformat .xlsx dan berukuran 1 byte–25 MB.')
      return
    }
    setConsultParsing(true)
    try {
      const ExcelJSModule = await import('exceljs-hardened')
      const ExcelJS: any = (ExcelJSModule as any).default ?? ExcelJSModule
      const all: ConsultRow[] = []
      for (const file of files) {
        const sourceMonth = parseIgdMonthFromFilename(file.name)
        if (sourceMonth == null) throw new Error('Nama file "' + file.name + '" harus mencantumkan nama bulan Januari–Desember agar periode sumber dapat dicatat.')
        const fileHash = await sha256(file)
        const workbook = new ExcelJS.Workbook()
        await workbook.xlsx.load(await file.arrayBuffer())
        if (!Array.isArray(workbook.worksheets) || workbook.worksheets.length > MAX_SHEETS) throw new Error('File ' + file.name + ' memiliki jumlah sheet tidak wajar.')
        let detailSheets = 0
        for (const worksheet of workbook.worksheets) {
          if (worksheet.rowCount > 5000) throw new Error('Sheet ' + worksheet.name + ' terlalu panjang.')
          let headerRowNumber = 0
          let columns = new Map<string, number>()
          let found = false
          for (let rowNum = 1; rowNum <= Math.min(50, worksheet.rowCount); rowNum++) {
            const candidate = buildHeaderMap(worksheet, rowNum, 20)
            let headerHits = 0
            for (const aliases of Object.values(CONSULT_HEADERS)) if (findHeader(candidate, aliases) != null) headerHits += 1
            if (headerHits >= 12) {
              headerRowNumber = rowNum
              columns = candidate
              found = true
              break
            }
          }
          if (!found) continue
          const indices: Record<string, number> = {}
          for (const [key, aliases] of Object.entries(CONSULT_HEADERS)) {
            const index = findHeader(columns, aliases)
            if (index == null && !['age','sex','patientType','doorToDecision','reasonCode','reasonOther'].includes(key)) {
              throw new Error('Header "' + aliases[0] + '" tidak ditemukan di sheet ' + worksheet.name + ' (' + file.name + ').')
            }
            if (index != null) indices[key] = index
          }
          detailSheets += 1
          for (let rowNum = headerRowNumber + 1; rowNum <= worksheet.rowCount; rowNum++) {
            const source = worksheet.getRow(rowNum)
            const operational = Object.values(indices).some(column => valueLooksPresent(readCellValue(source.getCell(column))))
            if (!operational) continue
            const rawMrnValue = readCellValue(source.getCell(indices.medicalRecordNo))
            const rawNameValue = readCellValue(source.getCell(indices.patientName))
            const medicalRecordNo = rawMrnValue == null ? '' : String(rawMrnValue).trim()
            const patientName = rawNameValue == null ? '' : String(rawNameValue).trim()
            const rawRegistrationValue = readCellValue(source.getCell(indices.registrationAt))
            const rawConsultationValue = readCellValue(source.getCell(indices.consultationAt))
            const registrationAt = normalizeIgdDateTime(rawRegistrationValue)
            const consultationAt = normalizeIgdDateTime(rawConsultationValue)
            const rawRegistrationAt = rawRegistrationValue instanceof Date ? normalizeIgdDateTime(rawRegistrationValue) ?? '' : String(rawRegistrationValue ?? '').trim()
            const rawConsultationAt = rawConsultationValue instanceof Date ? normalizeIgdDateTime(rawConsultationValue) ?? '' : String(rawConsultationValue ?? '').trim()
            const reportedValue = readCellValue(source.getCell(indices.reportedElapsed))
            const reportedElapsedMinutes = parseNumber(reportedValue)
            const calculatedElapsedMinutes = calculateIgdElapsedMinutes(registrationAt, consultationAt)
            const sheetToken = encodeURIComponent(worksheet.name).replace(/[!'()*]/g, char => '%' + char.charCodeAt(0).toString(16).toUpperCase())
            const sourceKey = 'igd-consult-2026:' + fileHash + ':' + sheetToken + ':' + rowNum
            const match = matchIgdConsultationToEncounter(medicalRecordNo, registrationAt, patientName, mainRows.map(row => ({
              subjectKey: row.sourceKey,
              medicalRecordNo: row.medicalRecordNo,
              patientName: row.patientName,
              recordDate: row.admissionAt,
            })))
            const warnings: string[] = []
            if (!registrationAt) warnings.push('Waktu Registrasi tidak valid; hubungan ke episode IGD tidak dibentuk.')
            if (!consultationAt) warnings.push('Waktu Konsultasi DPJP tidak valid; durasi tidak dihitung.')
            if (reportedElapsedMinutes == null) warnings.push('Nilai Target capaian tidak numerik; nilai asli tetap disimpan.')
            if (calculatedElapsedMinutes == null && registrationAt && consultationAt) warnings.push('Waktu konsultasi lebih awal daripada registrasi; durasi hasil hitung tidak tersedia.')
            if (reportedElapsedMinutes != null && calculatedElapsedMinutes != null && Math.abs(reportedElapsedMinutes - calculatedElapsedMinutes) > 1) {
              warnings.push('Nilai durasi sumber berbeda dari selisih timestamp registrasi–konsultasi; kedua nilai dipertahankan.')
            }
            if (typeof rawMrnValue === 'number') warnings.push('No. RM dibaca sebagai angka Excel; nilai disimpan persis sebagaimana dibaca dan tidak ditambahkan nol di depan.')
            if (match.status !== 'matched_unique') warnings.push(match.note)
            const val = (key: string) => indices[key] ? cellText(source.getCell(indices[key])) : ''
            all.push({
              sourceKey,
              sourceWorkbook: file.name,
              sourceHash: fileHash,
              sourceSheet: worksheet.name,
              sourceRow: rowNum,
              sourceMonth,
              sourceNo: val('sourceNo'),
              patientName,
              medicalRecordNo,
              age: val('age'),
              sex: val('sex'),
              patientType: val('patientType'),
              requestingDoctor: val('requestingDoctor'),
              specialist: val('specialist'),
              nurse: val('nurse'),
              registrationAt,
              rawRegistrationAt,
              consultationAt,
              rawConsultationAt,
              reportedElapsedMinutes,
              rawReportedElapsed: reportedValue == null ? '' : String(reportedValue),
              calculatedElapsedMinutes,
              doorToDecisionSource: val('doorToDecision'),
              performanceLabel: val('performanceLabel'),
              reasonCode: val('reasonCode'),
              reasonOther: val('reasonOther'),
              linkedSubjectKey: match.subjectKey,
              matchStatus: match.status,
              matchNote: match.note,
              warnings,
            })
          }
        }
        if (!detailSheets) throw new Error('Tidak ditemukan tab detail konsultasi pada workbook ' + file.name + '.')
      }
      if (!all.length) throw new Error('Tidak ada sampel konsultasi operasional pada workbook yang dipilih.')
      setConsultRows(all.sort((a, b) => a.sourceMonth - b.sourceMonth || a.sourceWorkbook.localeCompare(b.sourceWorkbook) || a.sourceSheet.localeCompare(b.sourceSheet) || a.sourceRow - b.sourceRow))
    } catch (error) {
      setConsultRows([])
      setErrorMessage(error instanceof Error ? error.message : 'File konsultasi DPJP tidak dapat dibaca.')
    } finally {
      setConsultParsing(false)
    }
  }

  const importConsultations = async () => {
    if (!consultRows.length || !eligible || !mainReady || consultImporting || consultResult) return
    setConsultImporting(true)
    setErrorMessage('')
    setConsultProgress(0)
    try {
      const items = consultRows.map(row => {
        const linkedId = row.linkedSubjectKey ? recordIds[row.linkedSubjectKey] ?? null : null
        const matchStatus = row.matchStatus === 'matched_unique'
          ? (linkedId ? 'matched_unique_linked' : 'matched_unique_unlinked')
          : row.matchStatus
        return {
          source_key: row.sourceKey,
          profile_year: 2026,
          source_workbook: row.sourceWorkbook,
          source_file_sha256: row.sourceHash,
          source_sheet: row.sourceSheet,
          source_excel_row: row.sourceRow,
          source_period_month: row.sourceMonth,
          source_excel_no: row.sourceNo || null,
          patient_name: row.patientName,
          medical_record_no: row.medicalRecordNo,
          age: row.age || null,
          sex: row.sex || null,
          patient_type: row.patientType || null,
          requesting_doctor: row.requestingDoctor,
          specialist: row.specialist,
          nurse: row.nurse,
          registration_at: row.registrationAt,
          raw_registration_at: row.rawRegistrationAt,
          consultation_at: row.consultationAt,
          raw_consultation_at: row.rawConsultationAt,
          reported_elapsed_minutes: row.reportedElapsedMinutes,
          raw_reported_elapsed: row.rawReportedElapsed,
          calculated_elapsed_minutes: row.calculatedElapsedMinutes,
          door_to_decision_source: row.doorToDecisionSource,
          source_performance_label: row.performanceLabel,
          source_reason_code: row.reasonCode,
          source_reason_other: row.reasonOther,
          linked_quality_record_id: linkedId,
          linked_quality_record_source_key: row.linkedSubjectKey,
          match_status: matchStatus,
          match_note: row.matchNote,
          source_warnings: row.warnings,
        }
      })
      const counts: ImportCounts = { received: 0, imported: 0, skipped: 0, batches: 0 }
      let start = 0
      let batchSize = BATCH_SIZE
      while (start < items.length) {
        const batch = items.slice(start, start + batchSize)
        const { data, error } = await quality().rpc('import_igd_consultation_audit_batch', { p_rows: batch })
        if (error) {
          if (/function .*import_igd_consultation_audit_batch.*not found|schema cache/i.test(error.message)) {
            throw new Error('RPC audit konsultasi IGD belum tersedia. Terapkan migrasi secure_igd_workbook_import terlebih dahulu.')
          }
          const smaller = nextBatchSizeAfterTimeout(error, batchSize, MIN_BATCH_SIZE)
          if (smaller != null) {
            batchSize = smaller
            setErrorMessage('Server membatasi transaksi audit konsultasi. Batch diubah menjadi ' + batchSize + ' baris.')
            continue
          }
          throw new Error('Batch audit konsultasi ' + (counts.batches + 1) + ' gagal: ' + error.message)
        }
        const summary = (data ?? {}) as ImportResponse
        const received = Number(summary.received_count ?? batch.length)
        const imported = Number(summary.imported_count ?? 0)
        const skipped = Number(summary.skipped_existing_count ?? 0)
        if (received !== batch.length || imported + skipped !== received) throw new Error('Ringkasan batch audit konsultasi tidak konsisten.')
        counts.received += received
        counts.imported += imported
        counts.skipped += skipped
        counts.batches += 1
        start += batch.length
        setConsultProgress(Math.round((counts.received / items.length) * 100))
      }
      if (counts.received !== items.length || counts.imported + counts.skipped !== counts.received) throw new Error('Rekap akhir audit konsultasi tidak konsisten.')
      setConsultResult(counts)
      try { await onImported({ imported: counts.imported, skipped: counts.skipped, received: counts.received }) } catch {
        setErrorMessage('Audit konsultasi tersimpan, tetapi daftar belum termuat ulang. Muat ulang workspace IGD.')
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impor audit konsultasi IGD gagal.')
    } finally {
      setConsultImporting(false)
    }
  }

  const matches = consultRows.reduce((sum, row) => {
    sum[row.matchStatus] = (sum[row.matchStatus] ?? 0) + 1
    return sum
  }, {} as Record<string, number>)
  const warningConsults = consultRows.filter(row => row.warnings.length > 0).length

  if (!open) return null
  return (
    <div className="aqBack" role="presentation" onClick={event => { if (event.target === event.currentTarget) close() }}>
      <section ref={importDialogRef} tabIndex={-1} className="aqDrawer aqIgdImport" role="dialog" aria-modal="true" aria-labelledby="aqIgdImportTitle">
        <style>{'.aqIgdImport .aqBody{display:grid;align-content:start;gap:12px}.aqIgdImport .ciIntro{font-size:12px;line-height:1.55;color:var(--muted)}.aqIgdImport .ciUpload{display:grid;gap:8px;padding:13px;border:1px dashed var(--line);border-radius:13px;background:rgba(255,255,255,.65)}.aqIgdImport .ciUpload input{width:100%;font-size:12px}.aqIgdImport .ciStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px}.aqIgdImport .ciStat{padding:9px;background:#fff;border:1px solid var(--line);border-radius:11px;min-width:0}.aqIgdImport .ciStat span{display:block;color:var(--muted);font-size:11px}.aqIgdImport .ciStat strong{display:block;margin-top:4px;font-size:18px;overflow-wrap:anywhere}.aqIgdImport .ciMessage{padding:11px 13px;border-radius:11px;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.aqIgdImport .ciError{background:#fff0ef;color:#8b2822}.aqIgdImport .ciSuccess{background:#eaf8ef;color:#206443}.aqIgdImport .ciWarning{background:#fff8e7;color:#7b5d25}.aqIgdImport .ciTable{overflow:auto;max-height:290px;border:1px solid var(--line);border-radius:11px}.aqIgdImport table{width:100%;border-collapse:collapse;font-size:11px}.aqIgdImport th,.aqIgdImport td{padding:7px 8px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}.aqIgdImport th{position:sticky;top:0;background:#f7faf8;white-space:nowrap}.aqIgdImport td.ciWrap{white-space:normal;min-width:150px;max-width:300px;overflow-wrap:anywhere}.aqIgdImport .ciPrivacy{font-size:11px;color:var(--muted);line-height:1.5}.aqIgdImport .ciCode{font-size:11px;font-weight:800;border:1px solid var(--line);padding:3px 5px;border-radius:6px;display:inline-block;white-space:normal}.aqIgdImport .ciTabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;padding:5px;border:1px solid var(--line);border-radius:14px;background:#f5f8f6}.aqIgdImport .ciTab{display:flex;align-items:center;gap:10px;min-width:0;padding:11px 12px;border:1px solid transparent;border-radius:10px;background:transparent;color:var(--ink);text-align:left;cursor:pointer;transition:background .16s ease,border-color .16s ease,box-shadow .16s ease}.aqIgdImport .ciTab.isActive{background:#fff;border-color:var(--line);box-shadow:0 3px 12px rgba(20,35,28,.06)}.aqIgdImport .ciTab:disabled{opacity:.58;cursor:progress}.aqIgdImport .ciTab[data-locked=true] .ciTabNumber{background:#eef0ed;color:#737c75}.aqIgdImport .ciTabNumber{display:grid;place-items:center;flex:0 0 30px;height:30px;border-radius:9px;background:#e4eee8;color:#315d48;font-size:11px;font-weight:800}.aqIgdImport .ciTabText{display:grid;gap:3px;min-width:0}.aqIgdImport .ciTabText strong{font-size:12px;line-height:1.25}.aqIgdImport .ciTabText small{font-size:11px;line-height:1.35;color:var(--muted)}.aqIgdImport .ciTabState{margin-left:auto;max-width:112px;color:var(--muted);font-size:11px;line-height:1.3;text-align:right}.aqIgdImport .ciPanel{min-width:0}.aqIgdImport .ciTab:focus-visible{outline:2px solid var(--accent);outline-offset:2px}.aqIgdImport .aqFoot{flex:0 0 auto;position:relative;z-index:6;gap:10px;flex-wrap:wrap}.aqIgdImport .ciFootActions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap;margin-left:auto}.aqIgdImport .ciFootActions .ciImportAction{min-height:36px;padding:8px 13px;border-radius:9px;font-size:11px;white-space:nowrap}@media(max-width:700px){.aqIgdImport .aqFoot{align-items:stretch}.aqIgdImport .aqFoot>span{font-size:11px!important}.aqIgdImport .ciFootActions{width:100%;margin-left:0;justify-content:space-between}.aqIgdImport .ciFootActions .ciImportAction{flex:1}}@media(max-width:800px){.aqIgdImport .ciStats{grid-template-columns:repeat(2,minmax(0,1fr))}.aqIgdImport .ciTabs{grid-template-columns:1fr}.aqIgdImport .ciTabState{max-width:130px}}'}</style>
        <div className="aqDHead">
          <div>
            <div className="eyebrow">Audit Indikator Mutu · Impor Terarah</div>
            <h4 id="aqIgdImportTitle">Unggah workbook Instalasi Gawat Darurat</h4>
            <p>Profil 2026 · 7 indikator aktif · dua alur sumber yang saling ditautkan</p>
          </div>
          <button className="aqClose" type="button" disabled={busy} onClick={close} aria-label="Tutup">×</button>
        </div>
        <div className="aqBody">
          {!authorized && <div className="ciMessage ciError">Impor workbook hanya tersedia bagi administrator/Komite PMKP dengan akses ke IGD.</div>}
          {!eligible && <div className="ciMessage ciError">Pilih Instalasi Gawat Darurat dan tahun profil 2026 sebelum membuka impor.</div>}
          <div className="ciIntro">Pilih jenis data yang akan diimpor. Setiap alur memiliki pratinjau, pemeriksaan sumber, dan hasil proses tersendiri. Data yang masuk tetap berstatus <strong>Ready for Review</strong> sampai divalidasi oleh petugas berwenang.</div>

          <div className="ciTabs" role="tablist" aria-label="Jenis impor data IGD">
            <button id="ci-igd-logbook-tab" type="button" role="tab" aria-selected={activeImportTab === 'logbook'} aria-controls="ci-igd-logbook-panel" className={`ciTab ${activeImportTab === 'logbook' ? 'isActive' : ''}`} onClick={() => setActiveImportTab('logbook')} disabled={busy}>
              <span className="ciTabNumber">01</span>
              <span className="ciTabText"><strong>Logbook episode</strong><small>Data utama pelayanan IGD</small></span>
              <span className="ciTabState">{mainResult ? 'Selesai' : mainRows.length ? 'Preview siap' : 'Belum dipilih'}</span>
            </button>
            <button id="ci-igd-consultation-tab" type="button" role="tab" aria-selected={activeImportTab === 'consultation'} aria-controls="ci-igd-consultation-panel" aria-disabled={!mainReady} data-locked={!mainReady} className={`ciTab ${activeImportTab === 'consultation' ? 'isActive' : ''}`} onClick={() => setActiveImportTab('consultation')} disabled={busy}>
              <span className="ciTabNumber">02</span>
              <span className="ciTabText"><strong>Audit konsultasi DPJP</strong><small>Catatan waktu dan relasi episode</small></span>
              <span className="ciTabState">{consultResult ? 'Selesai' : mainReady ? (consultRows.length ? 'Preview siap' : 'Siap diimpor') : 'Menunggu logbook'}</span>
            </button>
          </div>

          {activeImportTab === 'logbook' && <section id="ci-igd-logbook-panel" role="tabpanel" aria-labelledby="ci-igd-logbook-tab" tabIndex={0} className="ciPanel glass" style={{ padding: 13, display: 'grid', gap: 10 }}>
            <div><strong>Logbook episode IGD</strong><div className="ciPrivacy">Membaca sheet Logbook, header baris 3, data mulai baris 4. Satu baris sumber menjadi satu episode; RM berulang tidak digabung.</div></div>
            <div className="ciUpload">
              <label className="aqField"><span>Workbook induk (.xlsx), maksimal 25 MB</span>
                <input key={fileInputKey} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!eligible || !authorized || busy} onChange={event => { const file = event.target.files?.[0]; if (file) void parseMainWorkbook(file); event.currentTarget.value = '' }}/>
              </label>
              {mainFile && <div className="ciPrivacy">Dipilih: {mainFile.name} · {(mainFile.size / 1024 / 1024).toFixed(2)} MB · preview menyamarkan identitas pasien.</div>}
              {mainParsing && <div className="ciMessage">Membaca 7 header indikator, tanggal episode, pilihan respons, dan provenance baris sumber…</div>}
              {(mainRows.length > 0 || mainExcluded.length > 0) && <div className="ciStats">
                <div className="ciStat"><span>Episode operasional</span><strong>{mainRows.length + mainExcluded.length}</strong></div>
                <div className="ciStat"><span>Siap diimpor</span><strong>{mainRows.length}</strong></div>
                <div className="ciStat"><span>Dikecualikan</span><strong>{mainExcluded.length}</strong></div>
                <div className="ciStat"><span>RM unik</span><strong>{new Set(mainRows.map(row => row.medicalRecordNo).filter(Boolean)).size}</strong></div>
              </div>}
              {mainExcluded.length > 0 && <div className="ciMessage ciWarning">{mainExcluded.length} baris tidak masuk profil 2026 karena Waktu Masuk kosong/tidak valid atau berada di luar 2026. Nomor baris fisik dan alasan tetap dicatat dalam daftar pengecualian lokal; tidak ada tanggal yang ditebak.</div>}
              {mainRows.some(row => row.warnings.length > 0) && <div className="ciMessage ciWarning">{mainRows.filter(row => row.warnings.length > 0).length} episode memiliki catatan QA identitas, waktu, formula sumber, atau opsi indikator yang tidak cocok.</div>}
              {mainRows.length > 0 && <div className="ciTable"><table><thead><tr><th>Baris</th><th>Waktu masuk</th><th>Nama</th><th>RM</th><th>Indikator tidak cocok</th><th>Catatan</th></tr></thead><tbody>
                {mainRows.slice(0, 40).map(row => {
                  const unmatched = IGD_INDICATORS.filter(indicator => row.rawIndicators[indicator.code] && !row.matchedIndicators[indicator.code])
                  return <tr key={row.sourceRow}><td>{row.sourceRow}</td><td>{row.admissionAt.replace('T', ' ')}</td><td>{mask(row.patientName, 'name')}</td><td>{mask(row.medicalRecordNo, 'mrn')}</td><td>{unmatched.map(item => item.code).join(', ') || '-'}</td><td className="ciWrap">{row.warnings.join(' ') || '-'}</td></tr>
                })}
              </tbody></table></div>}
              {mainRows.length > 40 && <div className="ciPrivacy">Preview menampilkan 40 dari {mainRows.length} episode.</div>}
              {mainImporting && <div className="ciMessage">Impor logbook: {mainProgress}% · batch aman, idempotensi berdasarkan SHA-256 file dan nomor baris fisik.</div>}
              {mainResult && <div className="ciMessage ciSuccess">Logbook selesai diproses: {mainResult.imported} episode baru, {mainResult.skipped} sudah ada, {mainResult.received} total. Semua ID episode diterima dari server dan siap digunakan untuk relasi audit konsultasi.</div>}
            </div>
          </section>}

          {activeImportTab === 'consultation' && <section id="ci-igd-consultation-panel" role="tabpanel" aria-labelledby="ci-igd-consultation-tab" tabIndex={0} className="ciPanel glass" style={{ padding: 13, display: 'grid', gap: 10 }}>
            <div><strong>Audit waktu konsultasi DPJP</strong><div className="ciPrivacy">Impor workbook sumber konsultasi dari periode yang sedang diaudit. Beberapa file dapat dipilih sekaligus; setiap sheet dan baris sumber tetap disimpan sebagai jejak audit dan ditautkan hanya jika RM + tanggal cocok unik.</div></div>
            <div className="ciUpload">
              <label className="aqField"><span>Workbook sumber konsultasi (.xlsx), pilih satu atau beberapa file</span>
                <input type="file" multiple accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!eligible || !authorized || !mainReady || busy} onChange={event => { const files = Array.from(event.target.files ?? []); if (files.length) void parseConsultationFiles(files); event.currentTarget.value = '' }}/>
              </label>
              {!mainReady && <div className="ciMessage ciWarning">Alur ini terbuka setelah impor workbook induk berhasil dan seluruh pemetaan ID episode dikonfirmasi oleh server.</div>}
              <div className="ciPrivacy">Nama file harus mencantumkan bulan sumber (Januari–Desember) agar periode audit dicatat secara konsisten.</div>
              {consultFiles.length > 0 && <div className="ciPrivacy">{consultFiles.length} file dipilih: {consultFiles.map(file => file.name).join(' · ')}</div>}
              {consultParsing && <div className="ciMessage">Membaca tab per dokter umum, mengekstrak sampel konsultasi, menghitung selisih timestamp, dan mencocokkan RM + tanggal…</div>}
              {consultRows.length > 0 && <div className="ciStats">
                <div className="ciStat"><span>Sampel konsultasi</span><strong>{consultRows.length}</strong></div>
                <div className="ciStat"><span>Cocok unik</span><strong>{matches.matched_unique ?? 0}</strong></div>
                <div className="ciStat"><span>Ambigu</span><strong>{matches.ambiguous_rm_date ?? 0}</strong></div>
                <div className="ciStat"><span>Belum cocok</span><strong>{consultRows.length - (matches.matched_unique ?? 0) - (matches.ambiguous_rm_date ?? 0)}</strong></div>
              </div>}
              {consultRows.length > 0 && <div className="ciMessage ciWarning"><strong>Interpretasi durasi:</strong> kolom sumber hanya menyediakan Waktu Registrasi dan Waktu Konsultasi DPJP. Engine menghitung selisih kedua timestamp sebagai durasi registrasi-ke-konsultasi, bukan DPJP response time sejak permintaan konsultasi. Label Ya/Tidak dan alasan sumber disimpan tanpa dikonversi menjadi Code 1/2/3.</div>}
              {consultRows.length > 0 && <div className="ciTable"><table><thead><tr><th>Periode / sheet</th><th>Dokter IGD</th><th>Waktu registrasi</th><th>Durasi sumber</th><th>Durasi hitung</th><th>Capaian sumber</th><th>Relasi episode</th></tr></thead><tbody>
                {consultRows.slice(0, 60).map(row => <tr key={row.sourceKey}><td>{row.sourceMonth} · {row.sourceSheet}</td><td className="ciWrap">{row.requestingDoctor || '-'}</td><td>{row.rawRegistrationAt || '-'}</td><td>{row.rawReportedElapsed || '-'}</td><td>{row.calculatedElapsedMinutes == null ? '-' : row.calculatedElapsedMinutes + ' menit'}</td><td>{row.performanceLabel || '-'}</td><td className="ciWrap">{row.matchStatus} · {row.matchNote}</td></tr>)}
              </tbody></table></div>}
              {consultRows.length > 60 && <div className="ciPrivacy">Preview menampilkan 60 dari {consultRows.length} sampel.</div>}
              {warningConsults > 0 && <div className="ciPrivacy">{warningConsults} sampel memiliki catatan QA timestamp, perbedaan durasi, RM numerik, atau status pencocokan.</div>}
              {consultImporting && <div className="ciMessage">Impor audit konsultasi: {consultProgress}% · batch aman dan idempoten.</div>}
              {consultResult && <div className="ciMessage ciSuccess">Audit konsultasi selesai: {consultResult.imported} baru, {consultResult.skipped} sudah ada, {consultResult.received} total. Jawaban sumber belum menjadi klasifikasi indikator resmi.</div>}
            </div>
          </section>}
          {errorMessage && <div className="ciMessage ciError" role="alert">{errorMessage}</div>}
          <div className="ciPrivacy">Catatan integritas: RM berulang tidak digabung; respons kosong tetap kosong; opsi tak dikenal tetap menjadi provenance; sampel yang ambigu atau tidak cocok tetap disimpan di audit konsultasi tanpa relasi episode paksa. Tidak ada file sumber yang dikirim ke layanan eksternal.</div>
        </div>
        <div className="aqFoot">
          <span aria-live="polite" style={{ fontSize: 11, color: errorMessage ? '#8b2822' : 'var(--muted)', lineHeight: 1.45 }}>
            {errorMessage
              ? errorMessage
              : mainImporting
                ? `Impor logbook sedang berjalan: ${mainProgress}%.`
                : consultImporting
                  ? `Impor audit konsultasi sedang berjalan: ${consultProgress}%.`
                  : activeImportTab === 'logbook' && mainResult
                    ? `Logbook selesai: ${mainResult.imported} baru, ${mainResult.skipped} sudah ada, ${mainResult.received} total.`
                    : activeImportTab === 'consultation' && consultResult
                      ? `Audit konsultasi selesai: ${consultResult.imported} baru, ${consultResult.skipped} sudah ada, ${consultResult.received} total.`
                      : 'Semua record baru berstatus Ready for Review; validasi mutu dilakukan oleh validator unit/Komite PMKP.'}
          </span>
          <div className="ciFootActions">
            {activeImportTab === 'logbook' && mainRows.length > 0 && !mainResult && (
              <button
                type="button"
                className="aqBtn primary ciImportAction"
                disabled={!eligible || !authorized || mainParsing || mainImporting}
                onClick={() => void importMain()}
              >
                {mainImporting ? `Mengimpor logbook ${mainProgress}%…` : `Impor ${mainRows.length.toLocaleString('id-ID')} episode IGD`}
              </button>
            )}
            {activeImportTab === 'consultation' && consultRows.length > 0 && !consultResult && (
              <button
                type="button"
                className="aqBtn primary ciImportAction"
                disabled={!eligible || !authorized || !mainReady || consultParsing || consultImporting}
                onClick={() => void importConsultations()}
              >
                {consultImporting ? `Mengimpor audit konsultasi ${consultProgress}%…` : `Impor ${consultRows.length.toLocaleString('id-ID')} sampel konsultasi`}
              </button>
            )}
            <button type="button" className="aqBtn" disabled={busy} onClick={close}>Tutup</button>
          </div>
        </div>
      </section>
    </div>
  )
}
