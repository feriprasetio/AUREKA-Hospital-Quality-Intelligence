'use client'
import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'


import { useMemo, useState } from 'react'
import {
  DEFAULT_IMPORT_BATCH_SIZE,
  MIN_IMPORT_BATCH_SIZE,
  nextBatchSizeAfterTimeout,
} from '@/lib/aureka/import-batching'
import {
  NIFAS_SOURCE_INDICATORS,
  calculateNifasStayDays,
  hasNifasLogbookData,
  isNifasFormulaError,
  makeNifasSubjectKey,
  mapNifasLogbookHeaders,
  normalizeNifasDate,
  parseNifasSourceAnswer,
  type NifasIndicatorProfile,
  type NifasSourceAnswer,
} from '@/lib/aureka/nifas-logbook'
import { aurekaSupabase } from '@/lib/aureka/supabase'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_DATA_ROWS = 5000
const MAX_COLUMNS = 100
const BATCH_SIZE = Math.min(DEFAULT_IMPORT_BATCH_SIZE, 20)
const MIN_BATCH_SIZE = MIN_IMPORT_BATCH_SIZE
const UNIT_NAME = 'Nifas Obstetrics & Gynecology'
const UNMAPPED_SOURCE_HEADER = 'Kekosongan BHP/Linen'

type PreparedRow = {
  sourceRow: number
  sourceNo: string
  patientName: string
  medicalRecordNo: string
  admissionDate: string
  dischargeDate: string | null
  effectiveDate: string
  diagnosis: string
  patientCategory: string
  dischargeStatus: string
  sourceLos: string
  computedLos: number | null
  receivingBidan: string
  dpjp: string
  unmappedBhpLinen: string
  sourceIndicatorCells: Record<string, string>
  indicators: Record<string, NifasSourceAnswer>
  warnings: string[]
}

type ImportCounts = { received: number; imported: number; skipped: number; completedBatches: number }
type WorkbookFindings = {
  sheetCount: number
  dataRows: number
  sourceFormulaErrors: number
  reportFormulaErrors: number
  repeatedSequenceGroups: number
  repeatedSequenceRows: number
  repeatedMrnGroups: number
  repeatedMrnRows: number
  duplicateEpisodeGroups: number
  duplicateEpisodeRows: number
  crossYearAdmissions: number
  missingBidan: number
  combinedSourceRows: number
  mappedResponses: number
  emptyIndicatorHeaders: string[]
}
type ImportResponse = { received_count?: number; imported_count?: number; skipped_existing_count?: number }
type Props = {
  open: boolean
  roomId: number | null
  year: number
  authorized: boolean
  profiles: NifasIndicatorProfile[]
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
  if (value instanceof Date) return normalizeNifasDate(value) ?? ''
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
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  return String(value).trim()
}

function sourceFormulaValue(cell: any): unknown {
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
      const value = sourceFormulaValue(cell)
      if (cell?.value && typeof cell.value === 'object' && 'formula' in cell.value && isNifasFormulaError(value)) count++
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
    const mapped = mapNifasLogbookHeaders(values)

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
  throw new Error('Header Logbook Nifas tidak lengkap.' + (details ? ' ' + details : ' Periksa baris header Logbook.'))
}

function rowHasData(source: any, indexes: Record<string, number>): boolean {
  const values: Record<string, unknown> = {}
  const keys = [
    'patientName', 'medicalRecordNo', 'admissionDate', 'dischargeDate', 'diagnosis',
    'patientCategory', 'dischargeStatus', 'receivingBidan', 'dpjp', 'unmappedBhpLinen',
    ...NIFAS_SOURCE_INDICATORS.map(item => 'indicator:' + item.code),
  ]
  for (const key of keys) {
    const index = indexes[key]
    if (index != null) values[key] = cellText(source.getCell(index))
  }
  return hasNifasLogbookData(values)
}

function profileMapForRoom(profiles: NifasIndicatorProfile[]): Map<string, NifasIndicatorProfile> {
  return new Map(
    profiles
      .filter(profile =>
        Number(profile.room_id) === 19 &&
        Number(profile.profile_year) === 2026 &&
        profile.is_active === true &&
        profile.status === 'published',
      )
      .map(profile => [String(profile.code), profile]),
  )
}

function preparePayload(row: PreparedRow, fileName: string, userId: string, profiles: NifasIndicatorProfile[]) {
  const profileByCode = profileMapForRoom(profiles)
  const indicatorValues: Record<string, Record<string, unknown>> = {}
  const sourceIndicatorValues: Record<string, string> = {}
  const responses: Array<Record<string, unknown>> = []

  for (const item of NIFAS_SOURCE_INDICATORS) {
    const answer = row.indicators[item.code]
    if (!answer) continue
    const profile = profileByCode.get(item.code)
    if (!profile?.id) throw new Error('Master indikator ' + item.code + ' tidak tersedia untuk impor Nifas.')

    const rawValue = {
      answer: answer.label,
      code: answer.code,
      source_value: answer.sourceLabel,
      source_code: answer.sourceCode,
      review_required: true,
      mapping_status: answer.mappingStatus,
      classification_note: 'Klasifikasi pembilang/penyebut belum ditetapkan; telaah pemilik indikator dan Komite PMKP diperlukan.',
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

  const sourceImport = {
    source_workbook: fileName,
    source_sheet: 'Logbook',
    source_excel_row: row.sourceRow,
    source_excel_no: row.sourceNo,
    source_indicator_values: sourceIndicatorValues,
    source_indicator_cells: row.sourceIndicatorCells,
    unmapped_source_indicator: {
      source_header: UNMAPPED_SOURCE_HEADER,
      source_value: row.unmappedBhpLinen,
      mapping_status: 'combined_source_not_mapped_requires_review',
      reason: 'Sumber workbook menggabungkan BHP/Linen; master aktif memisahkan Kekosongan Linen (19.6) dan Kekosongan Obat (19.11). Nilai disimpan sebagai provenance dan tidak dipetakan otomatis.',
      target_profiles: ['19.6 Kekosongan Linen', '19.11 Kekosongan Obat'],
    },
    source_cached_los: row.sourceLos,
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
    'Lenght of Stay': row.computedLos,
    'Bidan Penerima': row.receivingBidan,
    'DPJP': row.dpjp,
    'Kekosongan BHP/Linen (sumber belum dipetakan)': row.unmappedBhpLinen,
  }

  for (const item of NIFAS_SOURCE_INDICATORS) {
    formFields[item.sourceHeader] = row.sourceIndicatorCells[item.code] ?? ''
  }

  const core = {
    patient_name: row.patientName,
    medical_record_no: row.medicalRecordNo,
    admission_at: row.admissionDate,
    discharge_at: row.dischargeDate,
    unit_name: UNIT_NAME,
    room_id: 19,
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
      room_id: 19,
      profile_year: 2026,
      measurement_grain: 'patient_episode',
      record_date: row.effectiveDate,
      subject_key: makeNifasSubjectKey(2026, row.sourceRow),
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

export default function NifasExcelImportDialog({
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

  const eligible = open && authorized && roomId === 19 && year === 2026
  const preview = useMemo(() => rows.slice(0, 100), [rows])
  const matchedResponses = useMemo(
    () => rows.reduce((sum, row) => sum + Object.keys(row.indicators).length, 0),
    [rows],
  )
  const pendingResponses = matchedResponses
  const rowsWithWarnings = useMemo(() => rows.filter(row => row.warnings.length > 0).length, [rows])
  const unmappedSourceRows = useMemo(() => rows.filter(row => row.unmappedBhpLinen.trim() !== '').length, [rows])

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
      setErrorMessage('Pilih unit Nifas & SMF Obsgyn dan profil tahun 2026 sebelum mengunggah.')
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
      if (sheet.rowCount > MAX_DATA_ROWS + 10 || sheet.columnCount > MAX_COLUMNS) {
        throw new Error('Dimensi sheet Logbook melewati batas aman (' + MAX_DATA_ROWS + ' baris data dan ' + MAX_COLUMNS + ' kolom).')
      }
      if (!workbook.getWorksheet('Profil')) {
        throw new Error('Sheet Profil tidak ditemukan; file tidak sesuai workbook PMKP Nifas.')
      }

      const header = findHeaderRow(sheet)
      const profileByCode = profileMapForRoom(profiles)
      const missingProfiles = NIFAS_SOURCE_INDICATORS.filter(item => {
        const profile = profileByCode.get(item.code)
        return !profile?.id || !Array.isArray(profile.options_json) || profile.options_json.length === 0
      })
      if (missingProfiles.length) {
        throw new Error(
          'Master indikator Nifas belum lengkap atau pilihan sumber belum disinkronkan: ' +
          missingProfiles.map(item => item.code + ' ' + item.header).join(', ') +
          '. Muat ulang AUREKA setelah sinkronisasi master.',
        )
      }

      const prepared: PreparedRow[] = []
      const rowErrors: string[] = []
      const sourceFormulaErrors = formulaErrorCount(sheet)
      const sourceNoCounts = new Map<string, number>()
      const medicalRecordCounts = new Map<string, number>()
      const duplicateEpisodeCounts = new Map<string, number>()
      let crossYearAdmissions = 0
      let missingBidan = 0
      let combinedSourceRows = 0
      let mappedResponses = 0
      const emptyIndicatorCounts = new Map<string, number>(NIFAS_SOURCE_INDICATORS.map(item => [item.header, 0]))

      for (let rowNumber = header.rowNumber + 1; rowNumber <= sheet.rowCount; rowNumber++) {
        const source = sheet.getRow(rowNumber)
        if (!rowHasData(source, header.indexes)) continue

        const value = (key: string) => {
          const index = header.indexes[key]
          return index == null ? '' : cellText(source.getCell(index))
        }
        const rawDate = (key: string) => {
          const index = header.indexes[key]
          return index == null ? '' : readCellValue(source.getCell(index))
        }

        const sourceNo = sourceNumber(source.getCell(header.indexes.sourceNo))
        const patientName = value('patientName')
        const medicalRecordNo = value('medicalRecordNo')
        const admissionDate = normalizeNifasDate(rawDate('admissionDate'))
        const rawDischarge = rawDate('dischargeDate')
        const dischargeDate = rawDischarge === '' || rawDischarge == null
          ? null
          : normalizeNifasDate(rawDischarge)
        const diagnosis = value('diagnosis')
        const patientCategory = value('patientCategory')
        const dischargeStatus = value('dischargeStatus')
        const sourceLos = value('sourceLos')
        const receivingBidan = value('receivingBidan')
        const dpjp = value('dpjp')
        const unmappedBhpLinen = value('unmappedBhpLinen')
        const rowIssues: string[] = []

        if (!sourceNo || !/^\d+$/.test(sourceNo)) rowIssues.push('Nomor urut sumber tidak valid.')
        if (!patientName) rowIssues.push('Nama Pasien kosong.')
        if (!medicalRecordNo) rowIssues.push('No. Rekam Medis kosong.')
        if (!admissionDate) rowIssues.push('Tanggal Masuk kosong atau tidak dapat dibaca.')
        if (rawDischarge !== '' && rawDischarge != null && !dischargeDate) rowIssues.push('Tanggal Keluar tidak dapat dibaca.')
        if (!diagnosis) rowIssues.push('Diagnosa Tegak kosong.')
        if (!dischargeStatus) rowIssues.push('Status Pulang kosong.')
        if (!dpjp) rowIssues.push('DPJP kosong.')

        if (admissionDate) {
          const admissionYear = Number(admissionDate.slice(0, 4))
          if (![2025, 2026].includes(admissionYear)) rowIssues.push('Tanggal Masuk harus berasal dari tahun 2025–2026.')
        }
        if (dischargeDate) {
          if (Number(dischargeDate.slice(0, 4)) !== 2026) rowIssues.push('Tanggal Keluar episode harus berada pada tahun profil 2026.')
          if (admissionDate && dischargeDate < admissionDate) rowIssues.push('Tanggal Keluar lebih awal dari Tanggal Masuk.')
        }

        const effectiveDate = dischargeDate ?? admissionDate ?? ''
        if (effectiveDate && Number(effectiveDate.slice(0, 4)) !== 2026) {
          rowIssues.push('Tanggal efektif episode tidak berada pada profil tahun 2026.')
        }

        const computedLos = admissionDate
          ? calculateNifasStayDays(admissionDate, dischargeDate)
          : null

        const sourceLosValue = source.getCell(header.indexes.sourceLos)
        const sourceLosResult = sourceFormulaValue(sourceLosValue)
        const sourceLosIsFormulaError = isNifasFormulaError(sourceLosResult)
        const rowWarnings: string[] = []

        if (!receivingBidan) {
          missingBidan++
          rowWarnings.push('Bidan Penerima kosong; episode dipertahankan dan perlu dilengkapi saat review.')
        }
        if (!patientCategory) rowWarnings.push('Kategori Pasien kosong pada sumber workbook.')
        if (sourceLosIsFormulaError) {
          rowWarnings.push('Rumus LOS sumber menghasilkan ' + String(sourceLosResult) + '; LOS dihitung ulang dari tanggal masuk dan keluar.')
        } else if (computedLos != null && sourceLos !== '' && Number.isFinite(Number(sourceLos.replace(',', '.')))) {
          if (Number(sourceLos.replace(',', '.')) !== computedLos) {
            rowWarnings.push('LOS sumber berbeda dari selisih tanggal; nilai turunan memakai selisih tanggal dan LOS sumber disimpan pada provenance.')
          }
        } else if (computedLos != null && sourceLos === '') {
          rowWarnings.push('LOS sumber kosong; nilai turunan dihitung dari tanggal masuk dan keluar.')
        }

        if (admissionDate && dischargeDate && admissionDate.slice(0, 4) === '2025' && dischargeDate.slice(0, 4) === '2026') {
          crossYearAdmissions++
          rowWarnings.push('Episode masuk pada 2025 dan keluar pada 2026; tanggal pencatatan mutu memakai Tanggal Keluar 2026.')
        }

        const sourceIndicatorCells: Record<string, string> = {}
        const indicators: Record<string, NifasSourceAnswer> = {}
        for (const item of NIFAS_SOURCE_INDICATORS) {
          const sourceValue = value('indicator:' + item.code)
          sourceIndicatorCells[item.code] = sourceValue
          if (!sourceValue) {
            emptyIndicatorCounts.set(item.header, (emptyIndicatorCounts.get(item.header) ?? 0) + 1)
            continue
          }
          const profile = profileByCode.get(item.code)
          const answer = parseNifasSourceAnswer(sourceValue, profile?.options_json)
          if (answer) {
            indicators[item.code] = answer
            mappedResponses++
            if (answer.mappingStatus !== 'mapped_pending_classification') {
              rowWarnings.push(item.code + ' ' + item.header + ': pilihan sumber perlu telaah (' + answer.mappingStatus + ').')
            }
          }
        }

        if (unmappedBhpLinen) {
          combinedSourceRows++
          rowWarnings.push('Kekosongan BHP/Linen disimpan utuh sebagai sumber gabungan dan tidak dipetakan ke 19.6/19.11.')
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
          effectiveDate,
          diagnosis,
          patientCategory,
          dischargeStatus,
          sourceLos,
          computedLos,
          receivingBidan,
          dpjp,
          unmappedBhpLinen,
          sourceIndicatorCells,
          indicators,
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
      const sequenceWarned = new Set<string>()
      const mrnWarned = new Set<string>()

      for (const row of prepared) {
        const sequenceCount = sourceNoCounts.get(row.sourceNo) ?? 0
        if (sequenceCount > 1) {
          if (!sequenceWarned.has(row.sourceNo)) {
            repeatedSequenceGroups++
            repeatedSequenceRows += sequenceCount
            sequenceWarned.add(row.sourceNo)
          }
          row.warnings.push('Nomor urut sumber berulang; kunci impor tetap menggunakan baris Excel fisik ' + row.sourceRow + '.')
        }

        const mrnKey = normalizedIdentity(row.medicalRecordNo)
        const mrnCount = medicalRecordCounts.get(mrnKey) ?? 0
        if (mrnCount > 1) {
          if (!mrnWarned.has(mrnKey)) {
            repeatedMrnGroups++
            repeatedMrnRows += mrnCount
            mrnWarned.add(mrnKey)
          }
          row.warnings.push('No. Rekam Medis muncul pada lebih dari satu episode; baris tidak digabung dan perlu verifikasi.')
        }

        const episodeKey = duplicateEpisodeKey(row)
        const episodeCount = duplicateEpisodeCounts.get(episodeKey) ?? 0
        duplicateEpisodeCounts.set(episodeKey, episodeCount + 1)
      }

      for (const row of prepared) {
        const duplicateCount = duplicateEpisodeCounts.get(duplicateEpisodeKey(row)) ?? 0
        if (duplicateCount > 1) {
          const sameKeyFirstRow = prepared.find(candidate => duplicateEpisodeKey(candidate) === duplicateEpisodeKey(row))
          if (sameKeyFirstRow?.sourceRow === row.sourceRow) {
            duplicateEpisodeGroups++
            duplicateEpisodeRows += duplicateCount
          }
          row.warnings.push('No. RM, tanggal masuk/keluar, dan diagnosis identik dengan episode lain; data tidak dihapus atau digabung, perlu verifikasi duplikasi.')
        }
      }

      const emptyIndicatorHeaders = NIFAS_SOURCE_INDICATORS
        .filter(item => (emptyIndicatorCounts.get(item.header) ?? 0) === prepared.length)
        .map(item => item.header)

      const reportFormulaErrors = workbook.worksheets
        .filter((worksheet: any) => worksheet.name !== 'Logbook')
        .reduce((sum: number, worksheet: any) => sum + formulaErrorCount(worksheet), 0)

      setFindings({
        sheetCount: workbook.worksheets.length,
        dataRows: prepared.length,
        sourceFormulaErrors,
        reportFormulaErrors,
        repeatedSequenceGroups,
        repeatedSequenceRows,
        repeatedMrnGroups,
        repeatedMrnRows,
        duplicateEpisodeGroups,
        duplicateEpisodeRows,
        crossYearAdmissions,
        missingBidan,
        combinedSourceRows,
        mappedResponses,
        emptyIndicatorHeaders,
      })

      if (!prepared.length && !rowErrors.length) throw new Error('Tidak ditemukan episode pasien pada sheet Logbook.')
      setRows(prepared)
      setErrors(rowErrors)
      if (rowErrors.length) {
        setErrorMessage('Ada baris yang tidak valid. Seluruh impor ditahan sampai baris wajib ditinjau; tidak ada partial import dari pratinjau ini.')
      } else {
        setErrorMessage('Pratinjau selesai. Respons indikator tetap pending menunggu klasifikasi pembilang/penyebut; seluruh episode berstatus Ready for Review.')
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

      const items = rows.map(row => preparePayload(row, file?.name ?? 'workbook.xlsx', user.id, profiles))
      const counts: ImportCounts = { received: 0, imported: 0, skipped: 0, completedBatches: 0 }
      let start = 0
      let batchSize = BATCH_SIZE
      let batchNumber = 0

      while (start < items.length) {
        const batch = items.slice(start, start + batchSize)
        batchNumber++
        const { data, error } = await quality().rpc('import_nifas_logbook_batch', { p_rows: batch })
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
    <section ref={importDialogRef} tabIndex={-1} className="aqDrawer aqWide aqNifasImport" role="dialog" aria-modal="true" aria-labelledby="aqNifasImportTitle">
      <style>{'.aqNifasImport .aqBody{display:grid;align-content:start;gap:12px}.aqNifasImport .niBox{padding:11px 13px;border:1px solid #e2e8e4;border-radius:11px;background:#fff;font-size:11px;line-height:1.55}.aqNifasImport .niError{background:#fff1f0;color:#8b2822}.aqNifasImport .niWarn{background:#fff8e8;color:#795c26}.aqNifasImport .niSuccess{background:#ebf8ef;color:#1e6544}.aqNifasImport .niTable{max-height:340px;overflow:auto;border:1px solid #e2e8e4;border-radius:10px}.aqNifasImport table{width:100%;border-collapse:collapse;font-size:10px}.aqNifasImport th,.aqNifasImport td{padding:8px 9px;border-bottom:1px solid #e2e8e4;text-align:left;vertical-align:top}.aqNifasImport th{position:sticky;top:0;background:#f5f8f6;z-index:1}.aqNifasImport .niStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.aqNifasImport .niStat{padding:10px;border:1px solid #e2e8e4;border-radius:10px;background:#fff;min-width:0}.aqNifasImport .niStat span{display:block;color:#65736b;font-size:9px}.aqNifasImport .niStat strong{display:block;font-size:17px;margin-top:4px}.aqNifasImport .niFooter{position:sticky;bottom:0;background:rgba(255,255,255,.96);padding:12px 0 0;border-top:1px solid #e2e8e4;display:flex;justify-content:space-between;gap:10px;align-items:center}.aqNifasImport .niProgress{height:7px;background:#e7ece9;border-radius:999px;overflow:hidden}.aqNifasImport .niProgress>span{display:block;height:100%;background:var(--accent);transition:width .2s}.aqNifasImport .niTag{display:inline-block;padding:3px 6px;border-radius:6px;background:#eef4f0;font-size:9px;margin:1px}.aqNifasImport .niTag.pending{background:#fff1d6;color:#805d16}@media(max-width:850px){.aqNifasImport .niStats{grid-template-columns:repeat(2,minmax(0,1fr))}.aqNifasImport .niFooter{display:grid}}'}</style>
      <div className="aqDHead">
        <div>
          <div className="eyebrow">AUDIT INDIKATOR MUTU · NIFAS & SMF OBSGYN</div>
          <h4 id="aqNifasImportTitle">Import workbook Nifas 2026</h4>
          <p>Pratinjau episode, sembilan indikator aktif yang dipetakan, serta telaah sumber gabungan BHP/Linen sebelum penyimpanan.</p>
        </div>
        <button className="aqClose" type="button" disabled={parsing || importing} onClick={close} aria-label="Tutup">×</button>
      </div>

      <div className="aqBody">
        <div className="niBox">
          <strong>Unggah workbook Excel (.xlsx)</strong>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <input key={fileKey} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={parsing || importing} onChange={(event: any) => { const selected = event.target.files?.[0]; if (selected) void parseWorkbook(selected); event.target.value = '' }} />
            <span className="aqMetaText">{file ? file.name + ' · ' + (file.size / 1024 / 1024).toFixed(2) + ' MB' : 'Maksimal 15 MB · Sheet sumber: Logbook'}</span>
          </div>
          {parsing && <div style={{ marginTop: 8 }}>Membaca episode, menormalkan tanggal, dan mencocokkan pilihan indikator ke master...</div>}
        </div>

        {findings && <div className="niBox">
          <strong>Pemeriksaan workbook:</strong> {findings.sheetCount} worksheet; {findings.dataRows} episode terdeteksi; formula error pada Logbook: {findings.sourceFormulaErrors}; formula error pada worksheet rekap yang tidak diimpor: {findings.reportFormulaErrors}.
          <div className="aqSub">Nomor urut sumber berulang: {findings.repeatedSequenceGroups} kelompok ({findings.repeatedSequenceRows} baris); No. RM berulang: {findings.repeatedMrnGroups} kelompok ({findings.repeatedMrnRows} episode); kombinasi episode identik: {findings.duplicateEpisodeGroups} kelompok ({findings.duplicateEpisodeRows} baris). Kunci impor memakai baris Excel fisik.</div>
        </div>}

        {rows.length > 0 && <div className="niStats">
          <div className="niStat"><span>Episode siap ditinjau</span><strong>{rows.length}</strong></div>
          <div className="niStat"><span>Respons indikator tersinkron</span><strong>{matchedResponses}</strong></div>
          <div className="niStat"><span>Respons pending klasifikasi</span><strong>{pendingResponses}</strong></div>
          <div className="niStat"><span>Episode dengan warning</span><strong>{rowsWithWarnings}</strong></div>
        </div>}

        {rows.length > 0 && findings && <div className="niBox niWarn">
          <strong>Klasifikasi numerator/denominator belum ditetapkan:</strong> label dan kode sumber dicocokkan dengan master aktif. Kode sumber 1/2/3 tidak otomatis dianggap sebagai pembilang mutu; seluruh respons tetap pending sampai pemilik indikator menetapkan klasifikasi N/D.
          <div style={{ marginTop: 6 }}><strong>Kekosongan BHP/Linen:</strong> {unmappedSourceRows} episode memiliki nilai sumber gabungan. Nilai disimpan utuh dan tidak dipaksakan ke indikator aktif 19.6 Linen atau 19.11 Obat.</div>
          <div style={{ marginTop: 6 }}>Tanggal efektif pencatatan memakai Tanggal Keluar bila tersedia. {findings.crossYearAdmissions} episode masuk pada 2025 dan keluar pada 2026 tetap dicatat pada profil 2026.</div>
          <div style={{ marginTop: 6 }}>Rumus LOS sumber menghasilkan {findings.sourceFormulaErrors} error pada worksheet Logbook; nilai turunan dihitung dari tanggal masuk/keluar dan teks/hasil rumus sumber dipertahankan pada provenance.</div>
          <div style={{ marginTop: 6 }}>Nomor RM berulang dan kombinasi episode identik tidak digabung otomatis. Setiap baris Excel tetap menjadi satu record dengan peringatan untuk verifikasi. Bidan Penerima kosong pada {findings.missingBidan} episode dan perlu dilengkapi saat review.</div>
          {findings.emptyIndicatorHeaders.length > 0 && <div style={{ marginTop: 6 }}>Kolom indikator tanpa respons pada seluruh episode: {findings.emptyIndicatorHeaders.join(', ')}. Kolom tetap dipertahankan, tetapi tidak dibuatkan respons kosong di database.</div>}
        </div>}

        {rows.length > 0 && <div className="niBox">
          <strong>Preview tersamarkan · {preview.length} dari {rows.length} episode pertama</strong>
          <div className="niTable" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>Baris Excel</th><th>No. RM</th><th>Nama</th><th>Tanggal masuk–keluar</th><th>Tanggal catat 2026</th><th>LOS</th><th>Respons</th><th>Warning</th></tr></thead>
              <tbody>
                {preview.map(row => <tr key={row.sourceRow}>
                  <td>{row.sourceRow}</td>
                  <td>{maskMedicalRecord(row.medicalRecordNo)}</td>
                  <td>{maskName(row.patientName)}</td>
                  <td>{row.admissionDate} – {row.dischargeDate ?? 'Belum pulang'}</td>
                  <td>{row.effectiveDate}</td>
                  <td>{row.computedLos == null ? '—' : row.computedLos + ' hari'}</td>
                  <td>{Object.keys(row.indicators).length}/9</td>
                  <td>{row.warnings.length ? <details><summary className="niTag pending">{row.warnings.length} perlu ditinjau</summary><ul style={{ margin: 6, paddingLeft: 18, minWidth: 230 }}>{row.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details> : <span className="niTag">OK</span>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>}

        {errors.length > 0 && <div className="niBox niError">
          <strong>{errors.length} baris belum valid — impor ditahan.</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {errors.slice(0, 40).map((error, index) => <li key={index}>{error}</li>)}
          </ul>
          {errors.length > 40 && <div className="aqSub">Menampilkan 40 temuan pertama dari {errors.length}.</div>}
        </div>}

        {errorMessage && <div className={'niBox ' + (result ? 'niSuccess' : errors.length || /gagal|belum|tidak|error/i.test(errorMessage) ? 'niError' : 'niWarn')}>{errorMessage}</div>}

        {partial && importing && <div className="niBox">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>Progres impor</strong><span>{progress}% · {partial.received}/{rows.length}</span></div>
          <div className="niProgress" style={{ marginTop: 8 }}><span style={{ width: progress + '%' }} /></div>
          <div className="aqSub" style={{ marginTop: 6 }}>{partial.imported} baru · {partial.skipped} sudah ada · {partial.completedBatches} batch selesai</div>
        </div>}

        {result && <div className="niBox niSuccess">
          <strong>Ringkasan impor dari server</strong>
          <div style={{ marginTop: 6 }}>{result.imported} episode baru tersimpan · {result.skipped} dilewati karena sudah ada · {result.received} diterima server.</div>
          <div className="aqSub">Semua episode tetap Ready for Review; respons indikator menunggu klasifikasi numerator/denominator.</div>
        </div>}

        <div className="niFooter">
          <span className="aqMetaText">{errors.length ? 'Perbaiki seluruh kesalahan baris sebelum impor.' : rows.length ? 'Impor memerlukan Admin/PMKP, akses Nifas, dan sesi login aktif.' : 'Belum ada workbook yang dipratinjau.'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="aqBtn" disabled={parsing || importing} onClick={close}>Batal</button>
            <button type="button" className="aqBtn primary" disabled={!eligible || !authorized || !rows.length || errors.length > 0 || parsing || importing || !!result} onClick={() => void importRows()}>{importing ? 'Mengimpor...' : 'Impor ' + rows.length + ' episode Nifas'}</button>
          </div>
        </div>
      </div>
    </section>
  </div>
}
