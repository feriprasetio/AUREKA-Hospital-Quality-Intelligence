'use client'

import { useMemo, useState } from 'react'
import {
  DEFAULT_IMPORT_BATCH_SIZE,
  MIN_IMPORT_BATCH_SIZE,
  nextBatchSizeAfterTimeout,
} from '@/lib/aureka/import-batching'
import {
  PEDIATRIC_SOURCE_INDICATORS,
  PEDIATRIC_SOURCE_ONLY_FIELDS,
  calculatePediatricStayDays,
  hasPediatricLogbookData,
  isPediatricFormulaError,
  makePediatricSubjectKey,
  mapPediatricLogbookHeaders,
  normalizePediatricDate,
  parsePediatricSourceAnswer,
  type PediatricIndicatorProfile,
  type PediatricSourceAnswer,
} from '@/lib/aureka/pediatric-inpatient-logbook'
import { aurekaSupabase } from '@/lib/aureka/supabase'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_DATA_ROWS = 5000
const MAX_COLUMNS = 100
const BATCH_SIZE = Math.min(DEFAULT_IMPORT_BATCH_SIZE, 20)
const MIN_BATCH_SIZE = MIN_IMPORT_BATCH_SIZE
const UNIT_NAME = 'Rawat Inap Anak'

type PreparedRow = {
  sourceRow: number
  sourceNo: string
  patientName: string
  medicalRecordNo: string
  admissionDate: string
  dischargeDate: string | null
  diagnosis: string | null
  patientCategory: string
  dischargeStatus: string | null
  weight: number | null
  height: number | null
  birthDate: string | null
  ageText: string
  sourceLos: string
  computedLos: number | null
  receivingNurse: string
  dpjp: string
  sourceIndicatorCells: Record<string, string>
  indicators: Record<string, PediatricSourceAnswer>
  sourceOnlyValues: Record<string, string>
  warnings: string[]
}

type ImportCounts = { received: number; imported: number; skipped: number; completedBatches: number }
type WorkbookFindings = {
  sheetCount: number
  dataRows: number
  validRows: number
  dashboardCount: number | null
  openEpisodes: number
  sourceFormulaErrors: number
  reportFormulaErrors: number
  repeatedSequenceGroups: number
  repeatedSequenceRows: number
  repeatedMrnGroups: number
  repeatedMrnRows: number
  duplicateEpisodeGroups: number
  duplicateEpisodeRows: number
  mappedResponses: number
  missingStuntingAnswers: number
  linenSourceRows: number
  medicineFreeTextRows: number
  unknownAnswerCells: number
}
type ImportResponse = { received_count?: number; imported_count?: number; skipped_existing_count?: number }
type Props = {
  open: boolean
  roomId: number | null
  year: number
  authorized: boolean
  profiles: PediatricIndicatorProfile[]
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
  if (value instanceof Date) return normalizePediatricDate(value) ?? ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    const display = String(cell?.text ?? '').trim()
    return display && !/[Ee][+-]?\d+/.test(display) ? display : String(value)
  }
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/[\u00a0\u202f\u2007]/g, ' ')
    .trim()
}

function sourceNumber(cell: any): string {
  const value = readCellValue(cell)
  if (value == null || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) return String(Math.trunc(value))
  return String(value).trim()
}

function numericValue(value: string): number | null {
  if (!value.trim()) return null
  const number = Number(value.replace(',', '.'))
  return Number.isFinite(number) ? number : null
}

function formulaValue(cell: any): unknown {
  const value = cell?.value
  return value && typeof value === 'object' && 'formula' in value
    ? value.result ?? ''
    : readCellValue(cell)
}

function formulaErrorCount(sheet: any): number {
  let count = 0
  for (let rowNumber = 1; rowNumber <= Number(sheet?.rowCount ?? 0); rowNumber++) {
    const row = sheet.getRow(rowNumber)
    row.eachCell({ includeEmpty: false }, (cell: any) => {
      const value = formulaValue(cell)
      if (cell?.value && typeof cell.value === 'object' && 'formula' in cell.value && isPediatricFormulaError(value)) count++
    })
  }
  return count
}

function maskName(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
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
    row.dischargeDate ?? '',
    normalizedIdentity(row.diagnosis ?? ''),
  ].join('|')
}

function findHeaderRow(sheet: any): { rowNumber: number; indexes: Record<string, number> } {
  let bestMissing: string[] = []
  let bestDuplicate: string[] = []

  for (let rowNumber = 1; rowNumber <= Math.min(10, Number(sheet.rowCount ?? 0)); rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const count = Math.min(Number(row.cellCount ?? row.actualCellCount ?? 100), MAX_COLUMNS)
    const values = Array.from({ length: count }, (_, index) => cellText(row.getCell(index + 1)))
    const mapped = mapPediatricLogbookHeaders(values)
    if (mapped.missingHeaders.length === 0 && mapped.duplicateHeaders.length === 0) {
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
  throw new Error('Header Logbook Rawat Inap Anak tidak lengkap.' + (details ? ' ' + details : ' Periksa baris header Logbook.'))
}

function rowHasData(source: any, indexes: Record<string, number>): boolean {
  const values: Record<string, unknown> = {}
  for (const key of ['patientName', 'medicalRecordNo', 'admissionDate']) {
    const index = indexes[key]
    if (index != null) values[key] = cellText(source.getCell(index))
  }
  return hasPediatricLogbookData(values)
}

function profileMapForRoom(profiles: PediatricIndicatorProfile[]): Map<string, PediatricIndicatorProfile> {
  return new Map(
    profiles
      .filter(profile =>
        Number(profile.room_id) === 22 &&
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
  profiles: PediatricIndicatorProfile[],
  dashboardCount: number | null,
) {
  const profileByCode = profileMapForRoom(profiles)
  const indicatorValues: Record<string, Record<string, unknown>> = {}
  const sourceIndicatorValues: Record<string, string> = {}
  const responses: Array<Record<string, unknown>> = []

  for (const item of PEDIATRIC_SOURCE_INDICATORS) {
    const answer = row.indicators[item.code]
    if (!answer) continue
    const profile = profileByCode.get(item.code)
    if (!profile?.id) throw new Error('Master indikator ' + item.code + ' tidak tersedia untuk impor Rawat Inap Anak.')

    const rawValue = {
      answer: answer.label,
      code: answer.code,
      source_value: answer.sourceLabel,
      source_code: answer.sourceCode,
      review_required: true,
      mapping_status: answer.mappingStatus,
      classification_note: 'Pilihan sumber dicocokkan dengan Profil workbook; penetapan numerator/denominator tetap menunggu verifikasi pemilik indikator.',
    }
    indicatorValues[item.code] = rawValue
    sourceIndicatorValues[item.code] = answer.sourceLabel
    responses.push({
      indicator_id: profile.id,
      response_label: answer.label,
      response_code: answer.code,
      raw_value: rawValue,
      other_text: answer.sourceLabel,
      review_status: 'pending',
    })
  }

  const sourceOnlyFields = PEDIATRIC_SOURCE_ONLY_FIELDS.map(item => ({
    code: item.code,
    source_header: item.header,
    source_value: row.sourceOnlyValues[item.code] ?? '',
    mapping_status: item.mappingStatus,
    reason: item.reason,
  }))

  const sourceImport = {
    source_workbook: fileName,
    source_sheet: 'Logbook',
    source_excel_row: row.sourceRow,
    source_excel_no: row.sourceNo,
    dashboard_declared_count: dashboardCount,
    source_indicator_values: sourceIndicatorValues,
    source_indicator_cells: row.sourceIndicatorCells,
    source_only_fields: sourceOnlyFields,
    source_cached_los: row.sourceLos,
    source_age_text: row.ageText,
    source_warnings: row.warnings,
    idempotency_basis: 'room_year_source_excel_row',
  }

  const formFields: Record<string, unknown> = {
    'No.': row.sourceNo,
    'Nama Pasien': row.patientName,
    'No. Rekam Medis': row.medicalRecordNo,
    'Tanggal Masuk': row.admissionDate,
    'Tanggal Keluar': row.dischargeDate,
    'Diagnosa Tegak': row.diagnosis,
    'Kategori Pasien': row.patientCategory,
    'Status Pulang': row.dischargeStatus,
    'Berat Badan': row.weight,
    'Tinggi Badan': row.height,
    'Tanggal Lahir': row.birthDate,
    'Umur (Rumus)': row.ageText,
    'Lenght of Stay': row.computedLos,
    'Perawat Penerima': row.receivingNurse,
    'DPJP': row.dpjp,
    'Kekosongan Linen': row.sourceOnlyValues['22.4'] ?? '',
    'Kekosongan Obat': row.sourceOnlyValues['22.5'] ?? '',
  }

  for (const item of PEDIATRIC_SOURCE_INDICATORS) {
    formFields[item.sourceHeader] = row.sourceIndicatorCells[item.code] ?? ''
  }

  const core = {
    patient_name: row.patientName,
    medical_record_no: row.medicalRecordNo,
    admission_at: row.admissionDate,
    discharge_at: row.dischargeDate,
    unit_name: UNIT_NAME,
    room_id: 22,
    status: 'Ready for Review',
    workflow_status: 'Ready for Review',
    form_fields: formFields,
    calculated_fields: {
      'Lenght of Stay': row.computedLos,
      'Open Inpatient Episode': row.dischargeDate == null,
    },
    indicator_values: indicatorValues,
    measurement_grain: 'patient_episode',
    source_import: sourceImport,
  }

  return {
    payload: {
      room_id: 22,
      profile_year: 2026,
      measurement_grain: 'patient_episode',
      record_date: row.admissionDate,
      subject_key: makePediatricSubjectKey(2026, row.sourceRow),
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

export default function PediatricInpatientExcelImportDialog({
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

  const eligible = open && authorized && roomId === 22 && year === 2026
  const preview = useMemo(() => rows.slice(0, 100), [rows])
  const mappedResponses = useMemo(
    () => rows.reduce((sum, row) => sum + Object.keys(row.indicators).length, 0),
    [rows],
  )
  const rowsWithWarnings = useMemo(() => rows.filter(row => row.warnings.length > 0).length, [rows])
  const unmatchedAnswers = useMemo(
    () => rows.reduce((sum, row) => sum + Object.values(row.indicators).filter(answer => answer.mappingStatus !== 'mapped_pending_classification').length, 0),
    [rows],
  )
  const sourceOnlyLinenRows = useMemo(() => rows.filter(row => row.sourceOnlyValues['22.4'] !== '').length, [rows])
  const sourceOnlyMedicineRows = useMemo(() => rows.filter(row => row.sourceOnlyValues['22.5'] !== '').length, [rows])

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
      setErrorMessage('Pilih unit Rawat Inap Anak dan profil tahun 2026 sebelum mengunggah.')
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
      if (!sheet) throw new Error('Sheet Logbook tidak ditemukan. Sheet Profil, Dashboard, dan rekap unit tidak diimpor.')
      if (sheet.rowCount > MAX_DATA_ROWS + 2 || sheet.columnCount > MAX_COLUMNS) {
        throw new Error('Dimensi sheet Logbook melewati batas aman (' + MAX_DATA_ROWS + ' baris data dan ' + MAX_COLUMNS + ' kolom).')
      }
      if (!workbook.getWorksheet('Profil')) {
        throw new Error('Sheet Profil tidak ditemukan; file tidak sesuai workbook PMKP Rawat Inap Anak.')
      }

      const header = findHeaderRow(sheet)
      const profileByCode = profileMapForRoom(profiles)
      const missingProfiles = PEDIATRIC_SOURCE_INDICATORS.filter(item => {
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
      let openEpisodes = 0
      let missingStuntingAnswers = 0
      let mappedResponsesCount = 0
      let unknownAnswerCells = 0

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
        const admissionDate = normalizePediatricDate(rawValue('admissionDate'))
        const rawDischarge = rawValue('dischargeDate')
        const dischargeDate = rawDischarge === '' || rawDischarge == null ? null : normalizePediatricDate(rawDischarge)
        const rawBirthDate = rawValue('birthDate')
        const birthDate = rawBirthDate === '' || rawBirthDate == null ? null : normalizePediatricDate(rawBirthDate)
        const diagnosis = value('diagnosis') || null
        const patientCategory = value('patientCategory')
        const dischargeStatus = value('dischargeStatus') || null
        const weight = numericValue(value('weight'))
        const height = numericValue(value('height'))
        const ageText = value('ageText')
        const sourceLos = value('sourceLos')
        const receivingNurse = value('receivingNurse')
        const dpjp = value('dpjp')
        const sourceOnlyValues: Record<string, string> = {
          '22.4': value('22.4_source_only'),
          '22.5': value('22.5_source_only'),
        }
        const rowIssues: string[] = []
        const rowWarnings: string[] = []

        if (!sourceNo || !/^\d+$/.test(sourceNo)) rowIssues.push('Nomor urut sumber tidak valid.')
        if (!patientName) rowIssues.push('Nama Pasien kosong.')
        if (!medicalRecordNo) rowIssues.push('No. Rekam Medis kosong.')
        if (!admissionDate) rowIssues.push('Tanggal Masuk kosong atau tidak dapat dibaca.')
        if (admissionDate && Number(admissionDate.slice(0, 4)) !== 2026) rowIssues.push('Tanggal Masuk harus berada pada tahun profil 2026.')
        if (rawDischarge !== '' && rawDischarge != null && !dischargeDate) rowIssues.push('Tanggal Keluar terisi tetapi tidak dapat dibaca.')
        if (dischargeDate && admissionDate && dischargeDate < admissionDate) rowIssues.push('Tanggal Keluar lebih awal dari Tanggal Masuk.')
        if (!patientCategory) rowIssues.push('Kategori Pasien kosong.')
        if (!diagnosis || !dischargeStatus || !dischargeDate) {
          openEpisodes++
          rowWarnings.push('Episode belum memiliki seluruh informasi pulang (Tanggal Keluar/Diagnosa/Status Pulang); dipertahankan sebagai episode yang masih dirawat.')
        }
        if (!receivingNurse) rowWarnings.push('Perawat Penerima kosong; perlu dilengkapi saat review.')
        if (!dpjp) rowWarnings.push('DPJP kosong; perlu dilengkapi saat review.')
        if (rawBirthDate !== '' && rawBirthDate != null && !birthDate) {
          rowWarnings.push('Tanggal Lahir sumber tidak dapat dinormalisasi; teks sumber tetap tersimpan.')
        }
        if (birthDate && admissionDate && birthDate > admissionDate) rowIssues.push('Tanggal Lahir lebih baru daripada Tanggal Masuk.')
        const sourceLosNumber = numericValue(sourceLos)
        const computedLos = calculatePediatricStayDays(admissionDate ?? '', dischargeDate)
        if (computedLos != null && sourceLosNumber != null && sourceLosNumber !== computedLos) {
          rowWarnings.push('LOS sumber berbeda dari selisih tanggal; nilai turunan memakai selisih tanggal, sedangkan LOS sumber dipertahankan.')
        }

        const sourceIndicatorCells: Record<string, string> = {}
        const indicators: Record<string, PediatricSourceAnswer> = {}
        for (const item of PEDIATRIC_SOURCE_INDICATORS) {
          const sourceValue = value('indicator:' + item.code)
          sourceIndicatorCells[item.code] = sourceValue
          if (!sourceValue) {
            if (item.code === '22.1') missingStuntingAnswers++
            continue
          }
          const profile = profileByCode.get(item.code)
          const answer = parsePediatricSourceAnswer(sourceValue, profile?.options_json)
          if (answer) {
            indicators[item.code] = answer
            mappedResponsesCount++
            if (answer.mappingStatus !== 'mapped_pending_classification') {
              unknownAnswerCells++
              rowWarnings.push(item.code + ' ' + item.header + ': nilai sumber perlu telaah (' + answer.mappingStatus + ').')
            }
          }
        }

        for (const item of PEDIATRIC_SOURCE_ONLY_FIELDS) {
          sourceIndicatorCells[item.key] = sourceOnlyValues[item.code]
          if (sourceOnlyValues[item.code]) {
            rowWarnings.push(item.header + ' disimpan sebagai sumber asli; tidak dipetakan otomatis ke master ' + item.code + '.')
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
          dischargeDate,
          diagnosis,
          patientCategory,
          dischargeStatus,
          weight,
          height,
          birthDate,
          ageText,
          sourceLos,
          computedLos,
          receivingNurse,
          dpjp,
          sourceIndicatorCells,
          indicators,
          sourceOnlyValues,
          warnings: rowWarnings,
        })
        sourceNoCounts.set(sourceNo, (sourceNoCounts.get(sourceNo) ?? 0) + 1)
        const mrnKey = normalizedIdentity(medicalRecordNo)
        medicalRecordCounts.set(mrnKey, (medicalRecordCounts.get(mrnKey) ?? 0) + 1)
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
        if (sequenceCount > 1) {
          if (!warnedSequence.has(row.sourceNo)) {
            repeatedSequenceGroups++
            repeatedSequenceRows += sequenceCount
            warnedSequence.add(row.sourceNo)
          }
          row.warnings.push('Nomor urut sumber berulang; identitas impor tetap menggunakan nomor baris Excel fisik.')
        }
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
      const dashboardCount = Number.isFinite(Number(dashboardValue)) && dashboardValue !== '' ? Number(dashboardValue) : null
      const reportFormulaErrors = workbook.worksheets
        .filter((worksheet: any) => worksheet.name !== 'Logbook')
        .reduce((sum: number, worksheet: any) => sum + formulaErrorCount(worksheet), 0)

      setFindings({
        sheetCount: workbook.worksheets.length,
        dataRows,
        validRows: prepared.length,
        dashboardCount,
        openEpisodes,
        sourceFormulaErrors,
        reportFormulaErrors,
        repeatedSequenceGroups,
        repeatedSequenceRows,
        repeatedMrnGroups,
        repeatedMrnRows,
        duplicateEpisodeGroups,
        duplicateEpisodeRows,
        mappedResponses: mappedResponsesCount,
        missingStuntingAnswers,
        linenSourceRows: prepared.filter(row => row.sourceOnlyValues['22.4'] !== '').length,
        medicineFreeTextRows: prepared.filter(row => row.sourceOnlyValues['22.5'] !== '').length,
        unknownAnswerCells,
      })

      if (!prepared.length && !rowErrors.length) throw new Error('Tidak ditemukan episode pasien pada sheet Logbook.')
      setRows(prepared)
      setErrors(rowErrors)
      if (rowErrors.length) {
        setErrorMessage('Ada baris tidak valid. Seluruh impor ditahan; tidak ada partial import sampai seluruh episode memiliki identitas dan tanggal masuk yang sah.')
      } else {
        setErrorMessage('Pratinjau selesai. Respons indikator tetap pending menunggu klasifikasi numerator/denominator; episode yang belum pulang tetap dipertahankan.')
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
        const { data, error } = await quality().rpc('import_pediatric_inpatient_logbook_batch', { p_rows: batch })
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
    <section className="aqDrawer aqWide aqPediatricImport" role="dialog" aria-modal="true" aria-labelledby="aqPediatricImportTitle">
      <style>{'.aqPediatricImport .aqBody{display:grid;align-content:start;gap:12px}.aqPediatricImport .paBox{padding:11px 13px;border:1px solid #e2e8e4;border-radius:11px;background:#fff;font-size:11px;line-height:1.55}.aqPediatricImport .paError{background:#fff1f0;color:#8b2822}.aqPediatricImport .paWarn{background:#fff8e8;color:#795c26}.aqPediatricImport .paSuccess{background:#ebf8ef;color:#1e6544}.aqPediatricImport .paTable{max-height:340px;overflow:auto;border:1px solid #e2e8e4;border-radius:10px}.aqPediatricImport table{width:100%;border-collapse:collapse;font-size:10px}.aqPediatricImport th,.aqPediatricImport td{padding:8px 9px;border-bottom:1px solid #e2e8e4;text-align:left;vertical-align:top}.aqPediatricImport th{position:sticky;top:0;background:#f5f8f6;z-index:1}.aqPediatricImport .paStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.aqPediatricImport .paStat{padding:10px;border:1px solid #e2e8e4;border-radius:10px;background:#fff;min-width:0}.aqPediatricImport .paStat span{display:block;color:#65736b;font-size:9px}.aqPediatricImport .paStat strong{display:block;font-size:17px;margin-top:4px}.aqPediatricImport .paFooter{position:sticky;bottom:0;background:rgba(255,255,255,.96);padding:12px 0 0;border-top:1px solid #e2e8e4;display:flex;justify-content:space-between;gap:10px;align-items:center}.aqPediatricImport .paProgress{height:7px;background:#e7ece9;border-radius:999px;overflow:hidden}.aqPediatricImport .paProgress>span{display:block;height:100%;background:var(--accent);transition:width .2s}.aqPediatricImport .paTag{display:inline-block;padding:3px 6px;border-radius:6px;background:#eef4f0;font-size:9px;margin:1px}.aqPediatricImport .paTag.pending{background:#fff1d6;color:#805d16}@media(max-width:850px){.aqPediatricImport .paStats{grid-template-columns:repeat(2,minmax(0,1fr))}.aqPediatricImport .paFooter{display:grid}}'}</style>
      <div className="aqDHead">
        <div>
          <div className="eyebrow">AUDIT INDIKATOR MUTU · RAWAT INAP ANAK</div>
          <h4 id="aqPediatricImportTitle">Import workbook Rawat Inap Anak 2026</h4>
          <p>Pratinjau episode rawat inap, enam indikator terpetakan, serta pemisahan data sumber Linen dan Obat yang belum dapat dipetakan.</p>
        </div>
        <button className="aqClose" type="button" disabled={parsing || importing} onClick={close} aria-label="Tutup">×</button>
      </div>

      <div className="aqBody">
        <div className="paBox">
          <strong>Unggah workbook Excel (.xlsx)</strong>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <input key={fileKey} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={parsing || importing} onChange={(event: any) => { const selected = event.target.files?.[0]; if (selected) void parseWorkbook(selected); event.target.value = '' }} />
            <span className="aqMetaText">{file ? file.name + ' · ' + (file.size / 1024 / 1024).toFixed(2) + ' MB' : 'Maksimal 15 MB · Sheet sumber: Logbook'}</span>
          </div>
          {parsing && <div style={{ marginTop: 8 }}>Membaca episode, tanggal, status rawat, dan pilihan indikator...</div>}
        </div>

        {findings && <div className="paBox">
          <strong>Pemeriksaan workbook:</strong> {findings.sheetCount} worksheet; {findings.dataRows} episode sumber; {findings.validRows} lolos validasi inti; Dashboard menyatakan {findings.dashboardCount ?? 'tidak tersedia'} data.
          <div className="aqSub">Episode belum pulang: {findings.openEpisodes}; formula error Logbook: {findings.sourceFormulaErrors}; formula error pada sheet rekap: {findings.reportFormulaErrors}. Nomor urut berulang: {findings.repeatedSequenceGroups} kelompok ({findings.repeatedSequenceRows} baris); No. RM berulang: {findings.repeatedMrnGroups} kelompok ({findings.repeatedMrnRows} episode); kombinasi episode identik: {findings.duplicateEpisodeGroups} kelompok ({findings.duplicateEpisodeRows} baris).</div>
        </div>}

        {rows.length > 0 && <div className="paStats">
          <div className="paStat"><span>Episode siap ditinjau</span><strong>{rows.length}</strong></div>
          <div className="paStat"><span>Respons indikator tersinkron</span><strong>{mappedResponses}</strong></div>
          <div className="paStat"><span>Respons pending klasifikasi</span><strong>{mappedResponses}</strong></div>
          <div className="paStat"><span>Episode dengan warning</span><strong>{rowsWithWarnings}</strong></div>
        </div>}

        {rows.length > 0 && findings && <div className="paBox paWarn">
          <strong>Klasifikasi numerator/denominator:</strong> label dan kode sumber dicocokkan ke master, tetapi seluruh enam profil hasil sinkronisasi tetap numerator NULL, denominator true, dan review_required true. Respons disimpan pending sampai pemilik indikator menetapkan klasifikasi mutu.
          <div style={{ marginTop: 6 }}><strong>Episode ongoing:</strong> {findings.openEpisodes} episode tanpa Tanggal Keluar dipertahankan; Diagnosis dan Status Pulang tetap null, tidak diisi asumsi.</div>
          <div style={{ marginTop: 6 }}><strong>Kekosongan Linen:</strong> {sourceOnlyLinenRows} baris disimpan sebagai sumber asli; tidak dipaksakan ke master 22.4 karena pilihan sumber berbeda dari master aktif.</div>
          <div style={{ marginTop: 6 }}><strong>Kekosongan Obat:</strong> {sourceOnlyMedicineRows} baris berisi teks bebas nama obat; tidak dikonversi ke master 22.5.</div>
          <div style={{ marginTop: 6 }}>Ada {unmatchedAnswers} respons pada enam indikator formal yang label sumbernya tidak cocok secara unik dengan pilihan Profil; nilai asli tetap disimpan dan respons ditandai untuk review.</div>
          <div style={{ marginTop: 6 }}>Kolom Assessment Stunting Wasting2 kosong pada {findings.missingStuntingAnswers} episode. Sel kosong tidak diubah menjadi nol atau ketidakpatuhan.</div>
          <div style={{ marginTop: 6 }}>No. RM dan kombinasi episode berulang tidak digabung atau dihapus otomatis; setiap baris fisik Excel tetap memiliki identitas impor sendiri.</div>
        </div>}

        {rows.length > 0 && <div className="paBox">
          <strong>Preview tersamarkan · {preview.length} dari {rows.length} episode pertama</strong>
          <div className="paTable" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>Baris Excel</th><th>No. RM</th><th>Nama</th><th>Tanggal Masuk</th><th>Tanggal Keluar</th><th>LOS</th><th>Respons</th><th>Warning</th></tr></thead>
              <tbody>
                {preview.map(row => <tr key={row.sourceRow}>
                  <td>{row.sourceRow}</td>
                  <td>{maskMedicalRecord(row.medicalRecordNo)}</td>
                  <td>{maskName(row.patientName)}</td>
                  <td>{row.admissionDate}</td>
                  <td>{row.dischargeDate ?? 'Masih dirawat'}</td>
                  <td>{row.computedLos == null ? '—' : row.computedLos + ' hari'}</td>
                  <td>{Object.keys(row.indicators).length}/6</td>
                  <td>{row.warnings.length ? <details><summary className="paTag pending">{row.warnings.length} perlu ditinjau</summary><ul style={{ margin: 6, paddingLeft: 18, minWidth: 230 }}>{row.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details> : <span className="paTag">OK</span>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>}

        {errors.length > 0 && <div className="paBox paError">
          <strong>{errors.length} baris belum valid — impor ditahan.</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {errors.slice(0, 40).map((error, index) => <li key={index}>{error}</li>)}
          </ul>
          {errors.length > 40 && <div className="aqSub">Menampilkan 40 temuan pertama dari {errors.length}.</div>}
        </div>}

        {errorMessage && <div className={'paBox ' + (result ? 'paSuccess' : errors.length || /gagal|belum|tidak|error/i.test(errorMessage) ? 'paError' : 'paWarn')}>{errorMessage}</div>}

        {partial && importing && <div className="paBox">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>Progres impor</strong><span>{progress}% · {partial.received}/{rows.length}</span></div>
          <div className="paProgress" style={{ marginTop: 8 }}><span style={{ width: progress + '%' }} /></div>
          <div className="aqSub" style={{ marginTop: 6 }}>{partial.imported} baru · {partial.skipped} sudah ada · {partial.completedBatches} batch selesai</div>
        </div>}

        {result && <div className="paBox paSuccess">
          <strong>Ringkasan impor dari server</strong>
          <div style={{ marginTop: 6 }}>{result.imported} episode baru tersimpan · {result.skipped} dilewati karena sudah ada · {result.received} diterima server.</div>
          <div className="aqSub">Episode yang belum pulang tetap tercatat sebagai pasien rawat inap; respons indikator menunggu klasifikasi numerator/denominator.</div>
        </div>}

        <div className="paFooter">
          <span className="aqMetaText">{errors.length ? 'Perbaiki seluruh kesalahan identitas/tanggal sebelum impor.' : rows.length ? 'Impor memerlukan Admin/PMKP, akses Rawat Inap Anak, dan sesi login aktif.' : 'Belum ada workbook yang dipratinjau.'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="aqBtn" disabled={parsing || importing} onClick={close}>Batal</button>
            <button type="button" className="aqBtn primary" disabled={!eligible || !authorized || !rows.length || errors.length > 0 || parsing || importing || !!result} onClick={() => void importRows()}>{importing ? 'Mengimpor...' : 'Impor ' + rows.length + ' episode Rawat Inap Anak'}</button>
          </div>
        </div>
      </div>
    </section>
  </div>
}
