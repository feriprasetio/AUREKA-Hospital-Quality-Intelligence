'use client'
import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'


import { useMemo, useState } from 'react'
import {
  DEFAULT_IMPORT_BATCH_SIZE,
  MIN_IMPORT_BATCH_SIZE,
  nextBatchSizeAfterTimeout,
} from '@/lib/aureka/import-batching'
import {
  SURGICAL_SOURCE_INDICATORS,
  calculateSurgicalStayDays,
  hasSurgicalLogbookData,
  isSurgicalFormulaError,
  makeSurgicalSubjectKey,
  mapSurgicalLogbookHeaders,
  normalizeSurgicalDate,
  parseSurgicalSourceAnswer,
  type SurgicalIndicatorProfile,
  type SurgicalSourceAnswer,
} from '@/lib/aureka/surgical-inpatient-logbook'
import { aurekaSupabase } from '@/lib/aureka/supabase'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_DATA_ROWS = 5000
const MAX_COLUMNS = 100
const BATCH_SIZE = Math.min(DEFAULT_IMPORT_BATCH_SIZE, 20)
const MIN_BATCH_SIZE = MIN_IMPORT_BATCH_SIZE
const UNIT_NAME = 'Rawat Inap Bedah'

type PreparedRow = {
  sourceRow: number
  sourceNo: string
  patientName: string
  medicalRecordNo: string
  admissionDate: string
  dischargeDate: string
  diagnosis: string
  patientCategory: string | null
  dischargeStatus: string | null
  sourceLos: string
  computedLos: number
  receivingNurse: string | null
  dpjp: string | null
  diagnosisSearchKey: string
  sourceIndicatorCells: Record<string, string>
  indicators: Record<string, SurgicalSourceAnswer>
  warnings: string[]
}

type ImportCounts = { received: number; imported: number; skipped: number; completedBatches: number }
type WorkbookFindings = {
  sheetCount: number
  dataRows: number
  validRows: number
  dashboardCount: number | null
  sourceFormulaErrors: number
  reportFormulaErrors: number
  repeatedSequenceGroups: number
  repeatedSequenceRows: number
  repeatedMrnGroups: number
  repeatedMrnRows: number
  duplicateEpisodeGroups: number
  duplicateEpisodeRows: number
  missingCategories: number
  missingDischargeStatus: number
  missingDpjp: number
  mappedResponses: number
  emptyTransferResponses: number
  emptyCancellationResponses: number
  aliasMappedResponses: number
}
type ImportResponse = { received_count?: number; imported_count?: number; skipped_existing_count?: number }
type Props = {
  open: boolean
  roomId: number | null
  year: number
  authorized: boolean
  profiles: SurgicalIndicatorProfile[]
  onClose: () => void
  onImported: (summary: { imported: number; skipped: number; received: number }) => void | Promise<void>
}

function readCellValue(cell: any): unknown {
  const value = cell?.value
  if (value == null) return ''
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if ('result' in value) return value.result ?? ''
    if (Array.isArray(value.richText)) return value.richText.map((part: any) => String(part?.text ?? '')).join('')
    if (typeof value.text === 'string') return value.text
    if (typeof value.hyperlink === 'string') return value.text ?? value.hyperlink
    if (typeof value.error === 'string') return value.error
    return ''
  }
  return value
}

function cellText(cell: any): string {
  const value = readCellValue(cell)
  if (value instanceof Date) return normalizeSurgicalDate(value) ?? ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    const display = String(cell?.text ?? '').trim()
    return display && !/[Ee][+-]?\d+/.test(display) ? display : String(value)
  }
  return String(value ?? '').normalize('NFKC').replace(/[\u00a0\u202f\u2007]/g, ' ').trim()
}

function sourceNumber(cell: any): string {
  const value = readCellValue(cell)
  if (value == null || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value))
  return String(value).trim()
}

function formulaValue(cell: any): unknown {
  const value = cell?.value
  return value && typeof value === 'object' && 'formula' in value ? value.result ?? '' : readCellValue(cell)
}

function formulaErrorCount(sheet: any): number {
  let count = 0
  for (let rowNumber = 1; rowNumber <= Number(sheet?.rowCount ?? 0); rowNumber++) {
    const row = sheet.getRow(rowNumber)
    row.eachCell({ includeEmpty: false }, (cell: any) => {
      const value = formulaValue(cell)
      if (cell?.value && typeof cell.value === 'object' && 'formula' in cell.value && isSurgicalFormulaError(value)) count++
      else if (isSurgicalFormulaError(value) && cell?.type === 10) count++
    })
  }
  return count
}

function maskName(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '-'
  return parts.length === 1
    ? parts[0].slice(0, 1) + '•••'
    : parts[0].slice(0, 1) + '••• ' + parts[parts.length - 1].slice(0, 1) + '•••'
}

function maskMedicalRecord(value: string): string {
  const compact = value.trim()
  return compact.length <= 4 ? '••••' : compact.slice(0, 2) + '••••' + compact.slice(-2)
}

function normalizedIdentity(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLocaleLowerCase('id-ID')
}

function duplicateEpisodeKey(row: PreparedRow): string {
  return [
    normalizedIdentity(row.medicalRecordNo),
    row.admissionDate,
    row.dischargeDate,
    normalizedIdentity(row.diagnosis),
  ].join('|')
}

function findHeaderRow(sheet: any): { rowNumber: number; indexes: Record<string, number> } {
  let bestMissing: string[] = []
  let bestDuplicate: string[] = []

  for (let rowNumber = 1; rowNumber <= Math.min(10, Number(sheet.rowCount ?? 0)); rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const count = Math.min(Number(row.cellCount ?? row.actualCellCount ?? 100), MAX_COLUMNS)
    const values = Array.from({ length: count }, (_, index) => cellText(row.getCell(index + 1)))
    const mapped = mapSurgicalLogbookHeaders(values)
    if (!mapped.missingHeaders.length && !mapped.duplicateHeaders.length) {
      return { rowNumber, indexes: mapped.indexes }
    }
    if (!bestMissing.length || mapped.missingHeaders.length < bestMissing.length) {
      bestMissing = mapped.missingHeaders
      bestDuplicate = mapped.duplicateHeaders
    }
  }

  const details = [
    bestMissing.length ? 'Header wajib belum ditemukan: ' + bestMissing.join(', ') + '.' : '',
    bestDuplicate.length ? 'Header ganda: ' + bestDuplicate.join(', ') + '.' : '',
  ].filter(Boolean).join(' ')
  throw new Error('Header Logbook Rawat Inap Bedah tidak lengkap.' + (details ? ' ' + details : ' Periksa baris header Logbook.'))
}

function rowHasData(source: any, indexes: Record<string, number>): boolean {
  const values: Record<string, unknown> = {}
  for (const key of ['patientName', 'medicalRecordNo', 'admissionDate']) {
    const index = indexes[key]
    if (index != null) values[key] = cellText(source.getCell(index))
  }
  return hasSurgicalLogbookData(values)
}

function profileMapForRoom(profiles: SurgicalIndicatorProfile[]): Map<string, SurgicalIndicatorProfile> {
  return new Map(
    profiles
      .filter(profile =>
        Number(profile.room_id) === 23 &&
        Number(profile.profile_year) === 2026 &&
        profile.is_active === true &&
        profile.status === 'published',
      )
      .map(profile => [String(profile.code), profile]),
  )
}

function preparePayload(
  row: PreparedRow,
  fileName: string,
  userId: string,
  profiles: SurgicalIndicatorProfile[],
  dashboardCount: number | null,
) {
  const profileByCode = profileMapForRoom(profiles)
  const indicatorValues: Record<string, Record<string, unknown>> = {}
  const sourceIndicatorValues: Record<string, string> = {}
  const responses: Array<Record<string, unknown>> = []

  for (const item of SURGICAL_SOURCE_INDICATORS) {
    const answer = row.indicators[item.code]
    if (!answer) continue
    const profile = profileByCode.get(item.code)
    if (!profile?.id) throw new Error('Master indikator ' + item.code + ' tidak tersedia untuk impor Rawat Inap Bedah.')

    const rawValue = {
      answer: answer.label,
      code: answer.code,
      numerator: answer.numerator,
      denominator: answer.denominator,
      source_value: answer.sourceLabel,
      source_code: answer.sourceCode ?? answer.code,
      free_text: answer.freeText ?? '',
      review_required: answer.reviewRequired,
      mapping_status: answer.mappingStatus,
      classification_note: answer.freeText
        ? 'Nama obat yang tidak tersedia disimpan sebagai bukti kejadian kekosongan; diklasifikasikan code 3.'
        : answer.mappingStatus === 'mapped_existing_master'
          ? 'Pilihan Linen/Obat dipetakan ke master aktif dan klasifikasi universal; denominator tetap dihitung.'
          : 'Pilihan sumber disimpan sesuai klasifikasi yang tersedia.',
    }
    indicatorValues[item.code] = rawValue
    sourceIndicatorValues[item.code] = answer.sourceLabel
    responses.push({
      indicator_id: profile.id,
      response_label: answer.label,
      response_code: answer.code,
      raw_value: rawValue,
      other_text: answer.freeText || answer.sourceLabel || null,
      review_status: answer.reviewRequired ? 'pending' : 'not_required',
    })
  }

  const sourceImport = {
    source_workbook: fileName,
    source_sheet: 'Logbook',
    source_excel_row: row.sourceRow,
    source_excel_no: row.sourceNo,
    dashboard_declared_count: dashboardCount,
    source_indicator_values: sourceIndicatorValues,
    source_indicator_cells: row.sourceIndicatorCells,
    source_diagnosis_search_key: row.diagnosisSearchKey,
    source_cached_los: row.sourceLos,
    source_warnings: row.warnings,
    idempotency_basis: 'room_year_source_excel_row',
  }

  const formFields: Record<string, unknown> = {
    'No.': row.sourceNo,
    'Nama Pasien': row.patientName,
    'No. Rekam Medis': row.medicalRecordNo,
    'Column1': row.medicalRecordNo,
    'Tanggal Masuk': row.admissionDate,
    'Tanggal Keluar': row.dischargeDate,
    'Diagnosa Tegak': row.diagnosis,
    'Kategori Pasien': row.patientCategory,
    'Status Pulang': row.dischargeStatus,
    'Lenght of Stay': row.computedLos,
    'Perawat Penerima': row.receivingNurse,
    'DPJP': row.dpjp,
    'Dx': row.diagnosisSearchKey,
  }

  for (const item of SURGICAL_SOURCE_INDICATORS) {
    formFields[item.sourceHeader] = row.sourceIndicatorCells[item.code] ?? ''
  }

  const core = {
    patient_name: row.patientName,
    medical_record_no: row.medicalRecordNo,
    admission_at: row.admissionDate,
    discharge_at: row.dischargeDate,
    unit_name: UNIT_NAME,
    room_id: 23,
    status: 'Ready for Review',
    workflow_status: 'Ready for Review',
    form_fields: formFields,
    calculated_fields: { 'Lenght of Stay': row.computedLos },
    indicator_values: indicatorValues,
    measurement_grain: 'patient_episode',
    source_import: sourceImport,
  }

  return {
    payload: {
      room_id: 23,
      profile_year: 2026,
      measurement_grain: 'patient_episode',
      record_date: row.admissionDate,
      subject_key: makeSurgicalSubjectKey(2026, row.sourceRow),
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

export default function SurgicalInpatientExcelImportDialog({
  open, roomId, year, authorized, profiles, onClose, onImported,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<PreparedRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportCounts | null>(null)
  const [partial, setPartial] = useState<ImportCounts | null>(null)
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [fileKey, setFileKey] = useState(0)
  const [findings, setFindings] = useState<WorkbookFindings | null>(null)

  const eligible = open && authorized && roomId === 23 && year === 2026
  const preview = useMemo(() => rows.slice(0, 100), [rows])
  const mappedResponses = useMemo(
    () => rows.reduce((sum, row) => sum + Object.keys(row.indicators).length, 0),
    [rows],
  )
  const rowsWithWarnings = useMemo(() => rows.filter(row => row.warnings.length > 0).length, [rows])
  const aliasMappedResponses = useMemo(
    () => rows.reduce((sum, row) => sum + Object.values(row.indicators).filter(answer => answer.mappingStatus === 'mapped_existing_master').length, 0),
    [rows],
  )

  const reset = () => {
    setFile(null)
    setRows([])
    setErrors([])
    setParsing(false)
    setImporting(false)
    setResult(null)
    setPartial(null)
    setProgress(0)
    setErrorMessage('')
    setFindings(null)
    setFileKey(value => value + 1)
  }

  const close = () => {
    if (parsing || importing) return
    reset()
    onClose()
  }
  const importDialogRef=useAccessibleDialog<HTMLElement>({open,onClose:close,lockScroll:true})


  const parseWorkbook = async (selectedFile: File) => {
    setFile(selectedFile)
    setRows([])
    setErrors([])
    setResult(null)
    setPartial(null)
    setProgress(0)
    setErrorMessage('')
    setFindings(null)

    if (!eligible) {
      setErrorMessage('Pilih unit Rawat Inap Bedah dan profil tahun 2026 sebelum mengunggah.')
      return
    }
    if (!/\.xlsx$/i.test(selectedFile.name)) {
      setErrorMessage('Hanya workbook .xlsx yang didukung.')
      return
    }
    if (selectedFile.size <= 0 || selectedFile.size > MAX_FILE_BYTES) {
      setErrorMessage('Ukuran workbook harus lebih besar dari 0 dan maksimal 15 MB.')
      return
    }
    if (typeof window === 'undefined') return

    setParsing(true)
    try {
      const module = await import('exceljs-hardened')
      const ExcelJS: any = (module as any).default ?? module
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await selectedFile.arrayBuffer())

      if (!workbook.worksheets?.length || workbook.worksheets.length > 50) {
        throw new Error('Workbook kosong atau jumlah worksheet tidak wajar.')
      }
      const sheet = workbook.getWorksheet('Logbook')
      if (!sheet) throw new Error('Sheet Logbook tidak ditemukan. Sheet Profil, Dashboard, dan rekap 1–20 tidak diimpor.')
      if (sheet.rowCount > MAX_DATA_ROWS + 2 || sheet.columnCount > MAX_COLUMNS) {
        throw new Error('Dimensi sheet Logbook melewati batas aman (' + MAX_DATA_ROWS + ' baris data dan ' + MAX_COLUMNS + ' kolom).')
      }
      if (!workbook.getWorksheet('Profil')) {
        throw new Error('Sheet Profil tidak ditemukan; file tidak sesuai workbook PMKP Rawat Inap Bedah.')
      }

      const header = findHeaderRow(sheet)
      const profileByCode = profileMapForRoom(profiles)
      const missingProfiles = SURGICAL_SOURCE_INDICATORS.filter(item => {
        const profile = profileByCode.get(item.code)
        return !profile?.id || !Array.isArray(profile.options_json) || profile.options_json.length === 0
      })
      if (missingProfiles.length) {
        throw new Error(
          'Pilihan master belum disinkronkan untuk indikator: ' +
          missingProfiles.map(item => item.code + ' ' + item.header).join(', ') +
          '. Muat ulang AUREKA setelah sinkronisasi profil.',
        )
      }

      const prepared: PreparedRow[] = []
      const rowErrors: string[] = []
      const sourceFormulaErrors = formulaErrorCount(sheet)
      const sourceNoCounts = new Map<string, number>()
      const medicalRecordCounts = new Map<string, number>()
      const duplicateEpisodeCounts = new Map<string, number>()
      let dataRows = 0
      let missingCategories = 0
      let missingDischargeStatus = 0
      let missingDpjp = 0
      let mappedResponsesCount = 0
      let emptyTransferResponses = 0
      let emptyCancellationResponses = 0
      let aliasMappedResponsesCount = 0

      for (let rowNumber = header.rowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
        const source = sheet.getRow(rowNumber)
        if (!rowHasData(source, header.indexes)) continue
        dataRows++

        const value = (key: string) => {
          const index = header.indexes[key]
          return index == null ? '' : cellText(source.getCell(index))
        }
        const rawValue = (key: string) => {
          const index = header.indexes[key]
          return index == null ? '' : readCellValue(source.getCell(index))
        }

        const sourceNo = sourceNumber(source.getCell(header.indexes.sourceNo))
        const patientName = value('patientName')
        const medicalRecordNo = value('medicalRecordNo')
        const admissionDate = normalizeSurgicalDate(rawValue('admissionDate'))
        const rawDischarge = rawValue('dischargeDate')
        const dischargeDate = rawDischarge === '' || rawDischarge == null ? null : normalizeSurgicalDate(rawDischarge)
        const diagnosis = value('diagnosis')
        const patientCategory = value('patientCategory') || null
        const dischargeStatus = value('dischargeStatus') || null
        const sourceLos = value('sourceLos')
        const receivingNurse = value('receivingNurse') || null
        const dpjp = value('dpjp') || null
        const diagnosisSearchKey = value('diagnosisSearchKey')
        const rowIssues: string[] = []
        const rowWarnings: string[] = []

        // Count sequence and MRN recurrence across every source episode, including rows held by validation.
        sourceNoCounts.set(sourceNo, (sourceNoCounts.get(sourceNo) ?? 0) + 1)
        const mrnKey = normalizedIdentity(medicalRecordNo)
        medicalRecordCounts.set(mrnKey, (medicalRecordCounts.get(mrnKey) ?? 0) + 1)

        if (!sourceNo || !/^\d+$/.test(sourceNo)) rowIssues.push('Nomor urut sumber tidak valid.')
        if (!patientName) rowIssues.push('Nama Pasien kosong.')
        if (!medicalRecordNo) rowIssues.push('No. Rekam Medis (header sumber Column1) kosong.')
        if (!admissionDate) rowIssues.push('Tanggal Masuk kosong atau tidak dapat dibaca.')
        if (admissionDate && Number(admissionDate.slice(0, 4)) !== 2026) rowIssues.push('Tanggal Masuk harus berada pada tahun profil 2026.')
        if (rawDischarge === '' || rawDischarge == null) rowIssues.push('Tanggal Keluar kosong; episode Rawat Inap Bedah harus memiliki periode rawat yang terverifikasi.')
        else if (!dischargeDate) rowIssues.push('Tanggal Keluar terisi tetapi formatnya tidak dapat dibaca.')
        if (admissionDate && dischargeDate && dischargeDate < admissionDate) rowIssues.push('Tanggal Keluar lebih awal daripada Tanggal Masuk.')
        if (dischargeDate && Number(dischargeDate.slice(0, 4)) !== 2026) rowIssues.push('Tanggal Keluar berada di luar tahun profil 2026.')
        if (!diagnosis) rowIssues.push('Diagnosa Tegak kosong.')

        if (!patientCategory) {
          missingCategories++
          rowWarnings.push('Kategori Pasien kosong; tidak disimpulkan sebagai Operasi atau Bukan Operasi.')
        }
        if (!dischargeStatus) {
          missingDischargeStatus++
          rowWarnings.push('Status Pulang kosong; nilai sumber dipertahankan tanpa asumsi.')
        }
        if (!receivingNurse) rowWarnings.push('Perawat Penerima kosong; perlu ditinjau.')
        if (!dpjp) {
          missingDpjp++
          rowWarnings.push('DPJP kosong; tidak diisi berdasarkan perkiraan.')
        }

        const computedLos = admissionDate && dischargeDate
          ? calculateSurgicalStayDays(admissionDate, dischargeDate)
          : null
        if (admissionDate && dischargeDate && computedLos == null) {
          rowIssues.push('Lama rawat tidak dapat dihitung dari pasangan tanggal sumber.')
        }
        const sourceLosNumber = Number(sourceLos)
        if (computedLos != null && sourceLos.trim() !== '' && Number.isFinite(sourceLosNumber) && sourceLosNumber !== computedLos) {
          rowWarnings.push('LOS sumber berbeda dari selisih tanggal; nilai sumber disimpan terpisah dan LOS turunan mengikuti tanggal.')
        }

        const sourceIndicatorCells: Record<string, string> = {}
        const indicators: Record<string, SurgicalSourceAnswer> = {}
        for (const item of SURGICAL_SOURCE_INDICATORS) {
          const sourceValue = value('indicator:' + item.code)
          sourceIndicatorCells[item.code] = sourceValue
          if (!sourceValue && item.code !== '23.3') {
            if (item.code === '23.4') emptyTransferResponses++
            if (item.code === '23.1') emptyCancellationResponses++
            continue
          }

          const profile = profileByCode.get(item.code)
          const answer = parseSurgicalSourceAnswer(sourceValue, profile?.options_json, item.code)
          if (answer) {
            indicators[item.code] = answer
            mappedResponsesCount++
            if (answer.mappingStatus === 'mapped_existing_master') aliasMappedResponsesCount++
            if (answer.mappingStatus !== 'mapped_pending_classification' && answer.mappingStatus !== 'mapped_existing_master') {
              rowIssues.push(item.code + ' ' + item.header + ': nilai sumber tidak cocok secara unik dengan master (' + answer.mappingStatus + ').')
            }
          }
        }

        if (rowIssues.length) {
          rowErrors.push('Baris Excel ' + rowNumber + ': ' + rowIssues.join(' '))
          continue
        }

        prepared.push({
          sourceRow: rowNumber,
          sourceNo,
          patientName,
          medicalRecordNo,
          admissionDate: admissionDate!,
          dischargeDate: dischargeDate!,
          diagnosis,
          patientCategory,
          dischargeStatus,
          sourceLos,
          computedLos: computedLos!,
          receivingNurse,
          dpjp,
          diagnosisSearchKey,
          sourceIndicatorCells,
          indicators,
          warnings: rowWarnings,
        })
      }

      let repeatedSequenceGroups = 0
      let repeatedSequenceRows = 0
      let repeatedMrnGroups = 0
      let repeatedMrnRows = 0
      let duplicateEpisodeGroups = 0
      let duplicateEpisodeRows = 0
      const warnedSequence = new Set<string>()
      const warnedMrn = new Set<string>()

      for (const row of prepared) {
        const sequenceCount = sourceNoCounts.get(row.sourceNo) ?? 0
        if (sequenceCount > 1 && !warnedSequence.has(row.sourceNo)) {
          repeatedSequenceGroups++
          repeatedSequenceRows += sequenceCount
          warnedSequence.add(row.sourceNo)
        }
        if (sequenceCount > 1) row.warnings.push('Nomor urut sumber berulang; kunci impor tetap menggunakan baris Excel fisik.')

        const mrnKey = normalizedIdentity(row.medicalRecordNo)
        const mrnCount = medicalRecordCounts.get(mrnKey) ?? 0
        if (mrnCount > 1) {
          if (!warnedMrn.has(mrnKey)) {
            repeatedMrnGroups++
            repeatedMrnRows += mrnCount
            warnedMrn.add(mrnKey)
          }
          row.warnings.push('No. Rekam Medis muncul pada beberapa episode; baris tidak digabung dan perlu verifikasi.')
        }

        duplicateEpisodeCounts.set(duplicateEpisodeKey(row), (duplicateEpisodeCounts.get(duplicateEpisodeKey(row)) ?? 0) + 1)
      }

      for (const row of prepared) {
        const duplicateCount = duplicateEpisodeCounts.get(duplicateEpisodeKey(row)) ?? 0
        if (duplicateCount > 1) {
          const first = prepared.find(candidate => duplicateEpisodeKey(candidate) === duplicateEpisodeKey(row))
          if (first?.sourceRow === row.sourceRow) {
            duplicateEpisodeGroups++
            duplicateEpisodeRows += duplicateCount
          }
          row.warnings.push('No. RM, Tanggal Masuk, Tanggal Keluar, dan diagnosis identik dengan episode lain; baris dipertahankan untuk verifikasi.')
        }
      }

      const dashboardSheet = workbook.getWorksheet('Dashboard')
      const dashboardValue = dashboardSheet ? formulaValue(dashboardSheet.getCell('B8')) : null
      const dashboardCount = Number.isFinite(Number(dashboardValue)) && dashboardValue !== ''
        ? Number(dashboardValue)
        : null
      const reportFormulaErrors = workbook.worksheets
        .filter((worksheet: any) => worksheet.name !== 'Logbook')
        .reduce((sum: number, worksheet: any) => sum + formulaErrorCount(worksheet), 0)

      setFindings({
        sheetCount: workbook.worksheets.length,
        dataRows,
        validRows: prepared.length,
        dashboardCount,
        sourceFormulaErrors,
        reportFormulaErrors,
        repeatedSequenceGroups,
        repeatedSequenceRows,
        repeatedMrnGroups,
        repeatedMrnRows,
        duplicateEpisodeGroups,
        duplicateEpisodeRows,
        missingCategories,
        missingDischargeStatus,
        missingDpjp,
        mappedResponses: mappedResponsesCount,
        emptyTransferResponses,
        emptyCancellationResponses,
        aliasMappedResponses: aliasMappedResponsesCount,
      })

      if (!dataRows && !rowErrors.length) throw new Error('Tidak ditemukan episode pasien pada sheet Logbook.')
      setRows(prepared)
      setErrors(rowErrors)
      if (rowErrors.length) {
        setErrorMessage('Ada baris dengan identitas/tanggal yang tidak konsisten. Seluruh impor ditahan sampai semua anomali sumber diperbaiki.')
      } else {
        setErrorMessage('Pratinjau selesai. Respons indikator menunggu review; klasifikasi Linen/Obat mengikuti master aktif yang sudah tersedia.')
      }
    } catch (error) {
      setRows([])
      setErrors([])
      setErrorMessage(error instanceof Error ? error.message : 'Workbook tidak dapat dibaca.')
    } finally {
      setParsing(false)
    }
  }

  const importRows = async () => {
    if (!eligible || !authorized || !rows.length || errors.length || importing || result) return
    setImporting(true)
    setErrorMessage('')
    try {
      const { data: { user }, error: userError } = await sb.auth.getUser()
      if (userError || !user) throw new Error('Sesi login tidak tersedia.')
      const items = rows.map(row => preparePayload(row, file?.name ?? 'workbook.xlsx', user.id, profiles, findings?.dashboardCount ?? null))
      const counts: ImportCounts = { received: 0, imported: 0, skipped: 0, completedBatches: 0 }
      let start = 0
      let batchSize = BATCH_SIZE
      let batchNumber = 0

      while (start < items.length) {
        const batch = items.slice(start, start + batchSize)
        batchNumber++
        const { data, error } = await quality().rpc('import_surgical_inpatient_logbook_batch', { p_rows: batch })
        if (error) {
          const smaller = nextBatchSizeAfterTimeout(error, batchSize, MIN_BATCH_SIZE)
          if (smaller != null && smaller < batchSize) {
            batchSize = smaller
            batchNumber--
            setErrorMessage('Server membatasi durasi transaksi. Ukuran batch diturunkan ke ' + batchSize + ' baris; batch diulang dengan kunci sumber yang sama.')
            continue
          }
          throw new Error('Batch ' + batchNumber + ' (' + batch.length + ' baris) gagal: ' + error.message)
        }

        const summary = (data ?? {}) as ImportResponse
        const received = Number(summary.received_count ?? batch.length)
        const imported = Number(summary.imported_count ?? 0)
        const skipped = Number(summary.skipped_existing_count ?? 0)
        if (received !== batch.length || imported + skipped !== received) {
          throw new Error('Ringkasan server pada batch ' + batchNumber + ' tidak konsisten.')
        }
        counts.received += received
        counts.imported += imported
        counts.skipped += skipped
        counts.completedBatches++
        start += batch.length
        setPartial({ ...counts })
        setProgress(Math.round((counts.received / items.length) * 100))
        setErrorMessage('')
      }

      if (counts.received !== items.length || counts.imported + counts.skipped !== counts.received) {
        throw new Error('Ringkasan akhir impor tidak konsisten.')
      }
      setResult(counts)
      await onImported({ imported: counts.imported, skipped: counts.skipped, received: counts.received })
    } catch (error) {
      setErrorMessage('Impor belum tuntas. ' + (error instanceof Error ? error.message : 'Periksa koneksi atau hak akses.'))
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return <div className="aqBack" role="presentation" onClick={event => { if (event.target === event.currentTarget) close() }}>
    <section ref={importDialogRef} tabIndex={-1} className="aqDrawer aqWide aqSurgicalImport" role="dialog" aria-modal="true" aria-labelledby="aqSurgicalImportTitle">
      <style>{'.aqSurgicalImport .aqBody{display:grid;align-content:start;gap:12px}.aqSurgicalImport .suBox{padding:11px 13px;border:1px solid #e2e8e4;border-radius:11px;background:#fff;font-size:11px;line-height:1.55}.aqSurgicalImport .suError{background:#fff1f0;color:#8b2822}.aqSurgicalImport .suWarn{background:#fff8e8;color:#795c26}.aqSurgicalImport .suSuccess{background:#ebf8ef;color:#1e6544}.aqSurgicalImport .suTable{max-height:340px;overflow:auto;border:1px solid #e2e8e4;border-radius:10px}.aqSurgicalImport table{width:100%;border-collapse:collapse;font-size:11px}.aqSurgicalImport th,.aqSurgicalImport td{padding:8px 9px;border-bottom:1px solid #e2e8e4;text-align:left;vertical-align:top}.aqSurgicalImport th{position:sticky;top:0;background:#f5f8f6;z-index:1}.aqSurgicalImport .suStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.aqSurgicalImport .suStat{padding:10px;border:1px solid #e2e8e4;border-radius:10px;background:#fff;min-width:0}.aqSurgicalImport .suStat span{display:block;color:#65736b;font-size:11px}.aqSurgicalImport .suStat strong{display:block;font-size:17px;margin-top:4px}.aqSurgicalImport .suFooter{position:sticky;bottom:0;background:rgba(255,255,255,.96);padding:12px 0 0;border-top:1px solid #e2e8e4;display:flex;justify-content:space-between;gap:10px;align-items:center}.aqSurgicalImport .suProgress{height:7px;background:#e7ece9;border-radius:999px;overflow:hidden}.aqSurgicalImport .suProgress>span{display:block;height:100%;background:var(--accent);transition:width .2s}.aqSurgicalImport .suTag{display:inline-block;padding:3px 6px;border-radius:6px;background:#eef4f0;font-size:11px;margin:1px}.aqSurgicalImport .suTag.pending{background:#fff1d6;color:#805d16}@media(max-width:850px){.aqSurgicalImport .suStats{grid-template-columns:repeat(2,minmax(0,1fr))}.aqSurgicalImport .suFooter{display:grid}}'}</style>
      <div className="aqDHead">
        <div>
          <div className="eyebrow">AUDIT INDIKATOR MUTU · RAWAT INAP BEDAH</div>
          <h4 id="aqSurgicalImportTitle">Import workbook Rawat Inap Bedah 2026</h4>
          <p>Pratinjau 932 episode, tujuh indikator, pemeriksaan tanggal, DPJP, dan konsistensi periode rawat.</p>
        </div>
        <button className="aqClose" type="button" disabled={parsing || importing} onClick={close} aria-label="Tutup">×</button>
      </div>

      <div className="aqBody">
        <div className="suBox">
          <strong>Unggah workbook Excel (.xlsx)</strong>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <input key={fileKey} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={parsing || importing} onChange={(event: any) => { const selected = event.target.files?.[0]; if (selected) void parseWorkbook(selected); event.target.value = '' }} />
            <span className="aqMetaText">{file ? file.name + ' · ' + (file.size / 1024 / 1024).toFixed(2) + ' MB' : 'Maksimal 15 MB · Sheet sumber: Logbook'}</span>
          </div>
          {parsing && <div style={{ marginTop: 8 }}>Membaca episode, tanggal, dan pilihan tujuh indikator...</div>}
        </div>

        {findings && <div className="suBox">
          <strong>Pemeriksaan workbook:</strong> {findings.sheetCount} worksheet; {findings.dataRows} episode sumber; {findings.validRows} episode lolos validasi inti; Dashboard menyatakan {findings.dashboardCount ?? 'tidak tersedia'} data.
          <div className="aqSub">Formula error pada Logbook: {findings.sourceFormulaErrors}; formula error pada worksheet rekap: {findings.reportFormulaErrors}. Nomor urut berulang: {findings.repeatedSequenceGroups} kelompok ({findings.repeatedSequenceRows} baris); No. RM berulang: {findings.repeatedMrnGroups} kelompok ({findings.repeatedMrnRows} episode); kombinasi episode identik: {findings.duplicateEpisodeGroups} kelompok ({findings.duplicateEpisodeRows} baris).</div>
        </div>}

        {rows.length > 0 && <div className="suStats">
          <div className="suStat"><span>Episode lolos validasi</span><strong>{rows.length}</strong></div>
          <div className="suStat"><span>Respons indikator tersinkron</span><strong>{mappedResponses}</strong></div>
          <div className="suStat"><span>Respons dipetakan ke master lama</span><strong>{aliasMappedResponses}</strong></div>
          <div className="suStat"><span>Episode dengan warning</span><strong>{rowsWithWarnings}</strong></div>
        </div>}

        {rows.length > 0 && findings && <div className="suBox suWarn">
          <strong>Review klasifikasi:</strong> lima indikator 23.1, 23.4, 23.5, 23.6, 23.7 disinkronkan dengan pilihan sumber, tetapi numerator tetap NULL dan review_required true. Indikator Linen 23.2 dan Obat 23.3 menggunakan alias eksplisit ke pilihan master aktif yang telah memiliki klasifikasi; master tersebut tidak diubah. Seluruh respons tetap pending untuk review.
          <div style={{ marginTop: 6 }}>Kategori Pasien kosong: {findings.missingCategories}; Status Pulang kosong: {findings.missingDischargeStatus}; DPJP kosong: {findings.missingDpjp}. Semua nilai kosong dipertahankan, bukan diisi otomatis.</div>
          <div style={{ marginTop: 6 }}>Respons Transfer IGD kosong: {findings.emptyTransferResponses}; respons Batal Operasi kosong: {findings.emptyCancellationResponses}. Sel kosong tidak dibuat sebagai respons nol atau ketidakpatuhan.</div>
          <div style={{ marginTop: 6 }}>Kekosongan Linen dan Kekosongan Obat memiliki pilihan kategori eksplisit pada workbook dan dipetakan melalui alias yang telah ditentukan ke master 23.2/23.3.</div>
          <div style={{ marginTop: 6 }}>Baris dengan No. RM berulang dan kombinasi episode identik dipertahankan satu per satu; tidak ada penggabungan otomatis.</div>
        </div>}

        {rows.length > 0 && <div className="suBox">
          <strong>Preview tersamarkan · {preview.length} dari {rows.length} episode lolos validasi</strong>
          <div className="suTable" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>Baris Excel</th><th>No. RM</th><th>Nama</th><th>Tanggal Masuk</th><th>Tanggal Keluar</th><th>LOS</th><th>Kategori</th><th>Respons</th><th>Warning</th></tr></thead>
              <tbody>
                {preview.map(row => <tr key={row.sourceRow}>
                  <td>{row.sourceRow}</td>
                  <td>{maskMedicalRecord(row.medicalRecordNo)}</td>
                  <td>{maskName(row.patientName)}</td>
                  <td>{row.admissionDate}</td>
                  <td>{row.dischargeDate}</td>
                  <td>{row.computedLos}</td>
                  <td>{row.patientCategory ?? '-'}</td>
                  <td>{Object.keys(row.indicators).length}/7</td>
                  <td>{row.warnings.length ? <details><summary className="suTag pending">{row.warnings.length} perlu ditinjau</summary><ul style={{ margin: 6, paddingLeft: 18, minWidth: 230 }}>{row.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details> : <span className="suTag">OK</span>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>}

        {errors.length > 0 && <div className="suBox suError">
          <strong>{errors.length} baris bermasalah, seluruh impor ditahan.</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {errors.slice(0, 50).map((error, index) => <li key={index}>{error}</li>)}
          </ul>
          {errors.length > 50 && <div className="aqSub">Menampilkan 50 temuan pertama dari {errors.length}.</div>}
        </div>}

        {errorMessage && <div className={'suBox ' + (result ? 'suSuccess' : errors.length || /gagal|belum|tidak|error/i.test(errorMessage) ? 'suError' : 'suWarn')}>{errorMessage}</div>}

        {partial && importing && <div className="suBox">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>Progres impor</strong><span>{progress}% · {partial.received}/{rows.length}</span></div>
          <div className="suProgress" style={{ marginTop: 8 }}><span style={{ width: progress + '%' }} /></div>
          <div className="aqSub" style={{ marginTop: 6 }}>{partial.imported} baru · {partial.skipped} sudah ada · {partial.completedBatches} batch selesai</div>
        </div>}

        {result && <div className="suBox suSuccess">
          <strong>Ringkasan impor dari server</strong>
          <div style={{ marginTop: 6 }}>{result.imported} episode baru tersimpan · {result.skipped} dilewati karena sudah ada · {result.received} diterima server.</div>
          <div className="aqSub">Seluruh respons indikator berada dalam status pending untuk review sebelum digunakan pada analisis mutu.</div>
        </div>}

        <div className="suFooter">
          <span className="aqMetaText">{errors.length ? 'Perbaiki seluruh anomali tanggal sebelum impor; tidak ada partial import.' : rows.length ? 'Impor memerlukan Admin/PMKP, akses Rawat Inap Bedah, dan sesi login aktif.' : 'Belum ada workbook yang dipratinjau.'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="aqBtn" disabled={parsing || importing} onClick={close}>Batal</button>
            <button type="button" className="aqBtn primary" disabled={!eligible || !authorized || !rows.length || errors.length > 0 || parsing || importing || !!result} onClick={() => void importRows()}>{importing ? 'Mengimpor...' : 'Impor ' + rows.length + ' episode Rawat Inap Bedah'}</button>
          </div>
        </div>
      </div>
    </section>
  </div>
}
