'use client'
import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'


import { useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import { DEFAULT_IMPORT_BATCH_SIZE, MIN_IMPORT_BATCH_SIZE, nextBatchSizeAfterTimeout } from '@/lib/aureka/import-batching'
import {
  calculateNicuStayDays,
  isNicuFormulaError,
  makeNicuSubjectKey,
  normalizeNicuDate,
  parseNicuSourceAnswer,
  NICU_SOURCE_INDICATORS,
  type NicuIndicatorProfile,
  type NicuSourceAnswer,
} from '@/lib/aureka/nicu-logbook'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_DATA_ROWS = 5000
const BATCH_SIZE = Math.min(DEFAULT_IMPORT_BATCH_SIZE, 20)
const MIN_BATCH_SIZE = MIN_IMPORT_BATCH_SIZE
const UNMAPPED_SOURCE_HEADER = 'Kekosongan BHP/Linen'
const UNIT_NAME = 'Neonatal Intensive Care Unit & Pediatrics High Dependency Unit'

const REQUIRED_HEADERS: Record<string, string[]> = {
  sourceNo: ['No.', 'No'],
  patientName: ['Nama Pasien'],
  medicalRecordNo: ['No. Rekam Medis', 'No RM', 'No. RM.'],
  admissionDate: ['Tanggal Masuk'],
  dischargeDate: ['Tanggal Keluar'],
  diagnosis: ['Diagnosa Tegak', 'Diagnosis Tegak'],
  patientCategory: ['Kategori Pasien'],
  dischargeStatus: ['Status Pulang'],
  sourceLos: ['Lenght of Stay', 'Length of Stay'],
  receivingNurse: ['Perawat Penerima'],
  dpjp: ['DPJP'],
  unmappedSource: ['Kekosongan BHP/Linen'],
}

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
  receivingNurse: string
  dpjp: string
  unmappedSource: string
  indicators: Record<string, NicuSourceAnswer>
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
}
type ImportResponse = { received_count?: number; imported_count?: number; skipped_existing_count?: number }
type Props = {
  open: boolean
  roomId: number | null
  year: number
  authorized: boolean
  profiles: NicuIndicatorProfile[]
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
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'number' && Number.isFinite(value)) {
    const display = String(cell?.text ?? '').trim()
    return display && !/[Ee][+-]?\d+/.test(display) ? display : String(value)
  }
  return String(value ?? '').trim()
}

function sourceNumber(cell: any): string {
  const value = readCellValue(cell)
  if (value == null || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Excel source sequence cells are formatted as decimal (e.g. 1.0) but are integer identities.
    return Number.isInteger(value) ? String(value) : String(value)
  }
  return String(value).trim()
}

function headerColumns(row: any): Map<string, number[]> {
  const result = new Map<string, number[]>()
  const count = Math.min(Number(row.cellCount ?? row.actualCellCount ?? 100), 100)
  for (let column = 1; column <= count; column++) {
    const label = cellText(row.getCell(column))
    if (!label) continue
    const key = normalizeExactHeader(label)
    const matches = result.get(key) ?? []
    matches.push(column)
    result.set(key, matches)
  }
  return result
}

function findHeader(columns: Map<string, number[]>, aliases: string[], required: boolean): number | null {
  for (const alias of aliases) {
    const matches = columns.get(normalizeExactHeader(alias))
    if (matches?.length) {
      if (matches.length > 1) throw new Error('Header "' + alias + '" muncul lebih dari satu kali.')
      return matches[0]
    }
  }
  if (required) throw new Error('Header wajib "' + aliases[0] + '" tidak ditemukan pada sheet Logbook.')
  return null
}

function findHeaderRow(sheet: any): { rowNumber: number; indexes: Record<string, number> } {
  for (let rowNumber = 1; rowNumber <= Math.min(10, sheet.rowCount); rowNumber++) {
    try {
      const columns = headerColumns(sheet.getRow(rowNumber))
      const indexes: Record<string, number> = {}
      for (const [key, aliases] of Object.entries(REQUIRED_HEADERS)) {
        const optional = ['dischargeDate', 'diagnosis', 'patientCategory', 'dischargeStatus', 'sourceLos', 'unmappedSource'].includes(key)
        const column = findHeader(columns, aliases, !optional)
        if (column != null) indexes[key] = column
      }
      for (const item of NICU_SOURCE_INDICATORS) {
        const column = findHeader(columns, [item.sourceHeader], true)
        if (column == null) throw new Error('Header indikator ' + item.header + ' tidak ditemukan.')
        indexes['indicator:' + item.code] = column
      }
      const required = ['sourceNo', 'patientName', 'medicalRecordNo', 'admissionDate', 'receivingNurse', 'dpjp']
      if (required.every(key => indexes[key] != null)) return { rowNumber, indexes }
    } catch {
      // Continue scanning merged workbook title rows.
    }
  }
  throw new Error('Header Logbook NICU tidak lengkap. Periksa identitas pasien, tanggal masuk, perawat, DPJP, serta lima kolom indikator 18.1, 18.3–18.6.')
}

function rowHasData(source: any, indexes: Record<string, number>): boolean {
  const keys = [
    'sourceNo', 'patientName', 'medicalRecordNo', 'admissionDate', 'dischargeDate',
    'diagnosis', 'patientCategory', 'dischargeStatus', 'receivingNurse', 'dpjp', 'unmappedSource',
    ...NICU_SOURCE_INDICATORS.map(item => 'indicator:' + item.code),
  ]
  return keys.some(key => {
    const index = indexes[key]
    return index != null && cellText(source.getCell(index)).trim() !== ''
  })
}

function formulaValue(cell: any): unknown {
  const value = cell?.value
  return value && typeof value === 'object' && 'formula' in value ? value.result : readCellValue(cell)
}

function maskName(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '—'
  return parts.length === 1 ? parts[0].slice(0, 1) + '•••' : parts[0].slice(0, 1) + '••• ' + parts[parts.length - 1].slice(0, 1) + '•••'
}

function maskMedicalRecord(value: string): string {
  const compact = value.trim()
  return compact.length <= 4 ? '••••' : compact.slice(0, 2) + '••••' + compact.slice(-2)
}

function duplicateEpisodeKey(row: PreparedRow): string {
  return [
    row.medicalRecordNo.trim().toLocaleLowerCase('id-ID'),
    row.admissionDate,
    row.dischargeDate ?? '',
    row.diagnosis.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID'),
  ].join('|')
}

function preparePayload(row: PreparedRow, fileName: string, userId: string, profiles: NicuIndicatorProfile[]) {
  const profileByCode = new Map(
    profiles
      .filter(profile =>
        Number(profile.room_id) === 18 &&
        Number(profile.profile_year) === 2026 &&
        profile.is_active === true &&
        profile.status === 'published',
      )
      .map(profile => [String(profile.code), profile]),
  )

  const indicatorValues: Record<string, Record<string, unknown>> = {}
  const sourceIndicatorValues: Record<string, string> = {}
  const responses: Array<Record<string, unknown>> = []

  for (const item of NICU_SOURCE_INDICATORS) {
    const answer = row.indicators[item.code]
    if (!answer) continue
    const profile = profileByCode.get(item.code)
    if (!profile?.id) throw new Error('Master indikator ' + item.code + ' tidak tersedia untuk impor NICU.')

    const rawValue = {
      answer: answer.label,
      code: answer.code,
      source_value: answer.sourceLabel,
      source_code: answer.sourceCode,
      review_required: true,
      mapping_status: answer.mappingStatus,
      classification_note: 'Klasifikasi pembilang/penyebut belum ditetapkan; telaah Komite PMKP diperlukan.',
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
    unmapped_source_indicator: {
      source_header: UNMAPPED_SOURCE_HEADER,
      source_value: row.unmappedSource,
      mapping_status: 'combined_source_not_mapped_requires_review',
      reason: 'Indikator sumber menggabungkan BHP, Linen, dan barang penunjang lain; master aktif NICU memisahkan Linen (18.2) dan Obat (18.7).',
      target_profiles: ['18.2 Kekosongan Linen', '18.7 Kekosongan Obat'],
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
    'Perawat Penerima': row.receivingNurse,
    'DPJP': row.dpjp,
    'Kekosongan BHP/Linen (sumber belum dipetakan)': row.unmappedSource,
  }

  const core = {
    patient_name: row.patientName,
    medical_record_no: row.medicalRecordNo,
    admission_at: row.admissionDate,
    discharge_at: row.dischargeDate,
    unit_name: UNIT_NAME,
    room_id: 18,
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
      room_id: 18,
      profile_year: 2026,
      measurement_grain: 'patient_episode',
      record_date: row.effectiveDate,
      subject_key: makeNicuSubjectKey(2026, row.sourceRow),
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

export default function NicuExcelImportDialog({
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

  const eligible = open && authorized && roomId === 18 && year === 2026
  const preview = useMemo(() => rows.slice(0, 100), [rows])
  const matchedResponses = useMemo(() => rows.reduce((sum, row) => sum + Object.values(row.indicators).length, 0), [rows])
  const pendingResponses = matchedResponses
  const rowsWithWarnings = useMemo(() => rows.filter(row => row.warnings.length > 0).length, [rows])

  const reset = () => {
    setFile(null); setRows([]); setErrors([]); setParsing(false); setImporting(false)
    setResult(null); setPartial(null); setProgress(0); setErrorMessage(''); setFindings(null)
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
    setRows([]); setErrors([]); setResult(null); setPartial(null); setProgress(0); setErrorMessage(''); setFindings(null)

    if (!eligible) {
      setErrorMessage('Pilih Neonatal Intensive Care Unit & Pediatrics High Dependency Unit dan tahun 2026 sebelum mengunggah.')
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
      if (sheet.rowCount > MAX_DATA_ROWS + 10 || sheet.columnCount > 100) {
        throw new Error('Dimensi sheet Logbook melewati batas 5.010 baris atau 100 kolom.')
      }

      let sourceFormulaErrors = 0
      let reportFormulaErrors = 0
      for (const worksheet of workbook.worksheets) {
        worksheet.eachRow({ includeEmpty: false }, (row: any) => {
          row.eachCell({ includeEmpty: false }, (cell: any) => {
            if (!isNicuFormulaError(formulaValue(cell))) return
            if (worksheet.name === 'Logbook') sourceFormulaErrors++
            else reportFormulaErrors++
          })
        })
      }

      const header = findHeaderRow(sheet)
      const activeProfiles = profiles.filter(profile =>
        Number(profile.room_id) === 18 &&
        Number(profile.profile_year) === 2026 &&
        profile.is_active === true &&
        profile.status === 'published',
      )
      const profileByCode = new Map(activeProfiles.map(profile => [String(profile.code), profile]))
      for (const item of NICU_SOURCE_INDICATORS) {
        const profile = profileByCode.get(item.code)
        if (!profile?.id) throw new Error('Master indikator ' + item.code + ' belum aktif/terbit pada unit NICU.')
        if (!Array.isArray(profile.options_json) || profile.options_json.length === 0) {
          throw new Error('Pilihan master indikator ' + item.code + ' belum disinkronkan dari Profil workbook. Terapkan migrasi NICU terlebih dahulu.')
        }
      }

      const prepared: PreparedRow[] = []
      const rowErrors: string[] = []
      const sequenceCounts = new Map<string, number>()
      const duplicateEpisodeCounts = new Map<string, number>()
      const medicalRecordCounts = new Map<string, number>()

      for (let excelRow = header.rowNumber + 1; excelRow <= sheet.rowCount; excelRow++) {
        const source = sheet.getRow(excelRow)
        if (!rowHasData(source, header.indexes)) continue

        if (prepared.length + rowErrors.length >= MAX_DATA_ROWS) {
          rowErrors.push('Jumlah episode melampaui batas ' + MAX_DATA_ROWS + ' baris.')
          break
        }

        const raw = (key: string) => header.indexes[key] == null ? '' : cellText(source.getCell(header.indexes[key]))
        const dateRaw = (key: string) => header.indexes[key] == null ? null : readCellValue(source.getCell(header.indexes[key]))
        try {
          const sourceNo = sourceNumber(source.getCell(header.indexes.sourceNo))
          const patientName = raw('patientName')
          const medicalRecordNo = raw('medicalRecordNo')
          const admissionDate = normalizeNicuDate(dateRaw('admissionDate'))
          const dischargeRaw = dateRaw('dischargeDate')
          const dischargeText = dischargeRaw == null ? '' : String(dischargeRaw).trim()
          const dischargeDate = !dischargeText ? null : normalizeNicuDate(dischargeRaw)
          const diagnosis = raw('diagnosis')
          const patientCategory = raw('patientCategory')
          const dischargeStatus = raw('dischargeStatus')
          const sourceLos = header.indexes.sourceLos == null
            ? ''
            : String(formulaValue(source.getCell(header.indexes.sourceLos)) ?? '').trim()
          const receivingNurse = raw('receivingNurse')
          const dpjp = raw('dpjp')
          const unmappedSource = raw('unmappedSource')

          if (!sourceNo || !/^\d+$/.test(sourceNo)) throw new Error('Nomor urut sumber kosong atau bukan angka bulat.')
          if (!patientName.trim()) throw new Error('Nama Pasien kosong.')
          if (!medicalRecordNo.trim()) throw new Error('No. Rekam Medis kosong.')
          if (!admissionDate) throw new Error('Tanggal Masuk kosong atau tidak valid.')
          if (!['2025', '2026'].includes(admissionDate.slice(0, 4))) throw new Error('Tanggal Masuk di luar kohort sumber 2025–2026.')
          if (dischargeText && !dischargeDate) throw new Error('Tanggal Keluar terisi tetapi tidak valid.')
          if (dischargeDate && dischargeDate.slice(0, 4) !== '2026') throw new Error('Tanggal Keluar tidak berada pada periode 2026.')
          if (dischargeDate && dischargeDate < admissionDate) throw new Error('Tanggal Keluar lebih awal daripada Tanggal Masuk.')
          if (!dischargeDate && admissionDate.slice(0, 4) !== '2026') throw new Error('Episode tanpa tanggal keluar harus memiliki Tanggal Masuk pada tahun 2026.')
          if (!receivingNurse.trim()) throw new Error('Perawat Penerima kosong.')
          if (!dpjp.trim()) throw new Error('DPJP kosong.')

          const effectiveDate = dischargeDate ?? admissionDate
          if (effectiveDate.slice(0, 4) !== '2026') throw new Error('Tanggal pencatatan episode tidak masuk profil 2026.')
          const computedLos = calculateNicuStayDays(admissionDate, dischargeDate)
          const warnings: string[] = []
          if (!dischargeDate) warnings.push('Tanggal Keluar belum tersedia; episode dipertahankan sebagai perawatan berjalan dengan status Ready for Review.')
          if (!diagnosis) warnings.push('Diagnosa Tegak kosong pada sumber.')
          if (!patientCategory) warnings.push('Kategori Pasien kosong pada sumber.')
          if (!dischargeStatus) warnings.push('Status Pulang kosong; konfirmasi status perawatan diperlukan.')
          if (!dischargeDate && sourceLos) warnings.push('Cache LOS sumber terisi meskipun Tanggal Keluar kosong; LOS turunan tetap null.')
          if (computedLos != null && sourceLos.trim() === '') {
            warnings.push('Cache formula Length of Stay kosong; LOS dihitung ulang dari tanggal masuk/keluar.')
          } else if (computedLos != null && isNicuFormulaError(sourceLos)) {
            warnings.push('Cache formula Length of Stay mengandung ' + sourceLos + '; LOS dihitung ulang dari tanggal sumber.')
          } else if (computedLos != null && sourceLos.trim() !== '' && Number.isFinite(Number(sourceLos)) && Number(sourceLos) !== computedLos) {
            warnings.push('Nilai LOS sumber berbeda dari selisih tanggal; nilai turunan memakai tanggal masuk/keluar.')
          }

          const indicators: Record<string, NicuSourceAnswer> = {}
          for (const item of NICU_SOURCE_INDICATORS) {
            const sourceValue = raw('indicator:' + item.code)
            if (!sourceValue.trim()) {
              warnings.push('Respons ' + item.header + ' tidak tersedia pada sumber; tidak dibuat respons indikator kosong.')
              continue
            }
            const profile = profileByCode.get(item.code)!
            const answer = parseNicuSourceAnswer(
              sourceValue,
              Array.isArray(profile.options_json) ? profile.options_json : [],
            )
            if (!answer) continue
            if (answer.mappingStatus !== 'mapped_pending_classification') {
              throw new Error(item.code + ' ' + item.header + ': pilihan sumber tidak cocok secara unik dengan master (' + answer.mappingStatus + '). Koreksi pilihan sumber sebelum impor.')
            }
            indicators[item.code] = answer
          }

          if (unmappedSource.trim()) {
            warnings.push('Kekosongan BHP/Linen/penunjang disimpan utuh sebagai data sumber; tidak dipetakan ke master Linen 18.2 atau Obat 18.7.')
          } else {
            warnings.push('Kolom sumber Kekosongan BHP/Linen/penunjang kosong.')
          }

          const row: PreparedRow = {
            sourceRow: excelRow, sourceNo, patientName, medicalRecordNo, admissionDate,
            dischargeDate, effectiveDate, diagnosis, patientCategory, dischargeStatus,
            sourceLos, computedLos, receivingNurse, dpjp, unmappedSource, indicators, warnings,
          }
          sequenceCounts.set(sourceNo, (sequenceCounts.get(sourceNo) ?? 0) + 1)
          const mrnKey = medicalRecordNo.trim().toLocaleLowerCase('id-ID')
          medicalRecordCounts.set(mrnKey, (medicalRecordCounts.get(mrnKey) ?? 0) + 1)
          prepared.push(row)
          const identity = duplicateEpisodeKey(row)
          duplicateEpisodeCounts.set(identity, (duplicateEpisodeCounts.get(identity) ?? 0) + 1)
        } catch (error) {
          rowErrors.push('Baris Excel ' + excelRow + ': ' + (error instanceof Error ? error.message : 'Data tidak valid.'))
        }
      }

      let repeatedSequenceGroups = 0
      let repeatedSequenceRows = 0
      let repeatedMrnGroups = 0
      let repeatedMrnRows = 0
      const sequenceWarned = new Set<string>()
      const mrnWarned = new Set<string>()
      for (const row of prepared) {
        const sequenceCount = sequenceCounts.get(row.sourceNo) ?? 0
        if (sequenceCount > 1) {
          if (!sequenceWarned.has(row.sourceNo)) {
            repeatedSequenceGroups++
            repeatedSequenceRows += sequenceCount
            sequenceWarned.add(row.sourceNo)
          }
          row.warnings.push('Nomor urut sumber berulang; kunci impor tetap menggunakan baris Excel fisik ' + row.sourceRow + '.')
        }
        const mrnKey = row.medicalRecordNo.trim().toLocaleLowerCase('id-ID')
        const mrnCount = medicalRecordCounts.get(mrnKey) ?? 0
        if (mrnCount > 1) {
          if (!mrnWarned.has(mrnKey)) {
            repeatedMrnGroups++
            repeatedMrnRows += mrnCount
            mrnWarned.add(mrnKey)
          }
          row.warnings.push('No. Rekam Medis yang sama muncul pada lebih dari satu episode; episode tidak digabung dan perlu verifikasi tanggal/perawatan.')
        }
        if ((duplicateEpisodeCounts.get(duplicateEpisodeKey(row)) ?? 0) > 1) {
          row.warnings.push('Identitas episode dan tanggal perawatan yang sama muncul lebih dari sekali; perlu verifikasi sebelum import.')
        }
      }

      setFindings({
        sheetCount: workbook.worksheets.length,
        dataRows: prepared.length,
        sourceFormulaErrors,
        reportFormulaErrors,
        repeatedSequenceGroups,
        repeatedSequenceRows,
        repeatedMrnGroups,
        repeatedMrnRows,
      })
      if (!prepared.length && !rowErrors.length) throw new Error('Tidak ditemukan episode pasien pada sheet Logbook.')
      setRows(prepared)
      setErrors(rowErrors)
      if (rowErrors.length) {
        setErrorMessage('Ada baris yang tidak valid. Seluruh impor ditahan sampai baris wajib diperbaiki; tidak ada partial import.')
      } else {
        setErrorMessage('Pratinjau selesai. Respons indikator menunggu klasifikasi pembilang/penyebut; seluruh episode berstatus Ready for Review.')
      }
    } catch (error) {
      setRows([]); setErrors([])
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
        const { data, error } = await quality().rpc('import_nicu_logbook_batch', { p_rows: batch })
        if (error) {
          const smaller = nextBatchSizeAfterTimeout(error, batchSize, MIN_BATCH_SIZE)
          if (smaller != null && smaller < batchSize) {
            batchSize = smaller
            batchNumber--
            setErrorMessage('Server membatasi durasi transaksi. Ukuran batch diturunkan ke ' + batchSize + ' baris; batch diulang menggunakan kunci sumber yang sama.')
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
    <section ref={importDialogRef} tabIndex={-1} className="aqDrawer aqWide aqNicuImport" role="dialog" aria-modal="true" aria-labelledby="aqNicuImportTitle">
      <style>{'.aqNicuImport .aqBody{display:grid;align-content:start;gap:12px}.aqNicuImport .piBox{padding:11px 13px;border:1px solid #e2e8e4;border-radius:11px;background:#fff;font-size:11px;line-height:1.55}.aqNicuImport .piError{background:#fff1f0;color:#8b2822}.aqNicuImport .piWarn{background:#fff8e8;color:#795c26}.aqNicuImport .piSuccess{background:#ebf8ef;color:#1e6544}.aqNicuImport .piTable{max-height:340px;overflow:auto;border:1px solid #e2e8e4;border-radius:10px}.aqNicuImport table{width:100%;border-collapse:collapse;font-size:10px}.aqNicuImport th,.aqNicuImport td{padding:8px 9px;border-bottom:1px solid #e2e8e4;text-align:left;vertical-align:top}.aqNicuImport th{position:sticky;top:0;background:#f5f8f6;z-index:1}.aqNicuImport .piStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.aqNicuImport .piStat{padding:10px;border:1px solid #e2e8e4;border-radius:10px;background:#fff;min-width:0}.aqNicuImport .piStat span{display:block;color:#65736b;font-size:9px}.aqNicuImport .piStat strong{display:block;font-size:17px;margin-top:4px}.aqNicuImport .piFooter{position:sticky;bottom:0;background:rgba(255,255,255,.96);padding:12px 0 0;border-top:1px solid #e2e8e4;display:flex;justify-content:space-between;gap:10px;align-items:center}.aqNicuImport .piProgress{height:7px;background:#e7ece9;border-radius:999px;overflow:hidden}.aqNicuImport .piProgress>span{display:block;height:100%;background:var(--accent);transition:width .2s}.aqNicuImport .piTag{display:inline-block;padding:3px 6px;border-radius:6px;background:#eef4f0;font-size:9px;margin:1px}.aqNicuImport .piTag.pending{background:#fff1d6;color:#805d16}@media(max-width:850px){.aqNicuImport .piStats{grid-template-columns:repeat(2,minmax(0,1fr))}.aqNicuImport .piFooter{display:grid}}'}</style>
      <div className="aqDHead">
        <div>
          <div className="eyebrow">AUDIT INDIKATOR MUTU · NICU & PEDIATRICS HIGH DEPENDENCY UNIT</div>
          <h4 id="aqNicuImportTitle">Import workbook NICU 2026</h4>
          <p>Pratinjau episode dari Logbook, pemetaan lima indikator aktif, serta telaah klasifikasi sebelum pelaporan mutu.</p>
        </div>
        <button className="aqClose" type="button" disabled={parsing || importing} onClick={close} aria-label="Tutup">×</button>
      </div>
      <div className="aqBody">
        <div className="piBox">
          <strong>Unggah workbook Excel (.xlsx)</strong>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <input key={fileKey} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={parsing || importing} onChange={(event: any) => { const selected = event.target.files?.[0]; if (selected) void parseWorkbook(selected); event.target.value = '' }} />
            <span className="aqMetaText">{file ? file.name + ' · ' + (file.size / 1024 / 1024).toFixed(2) + ' MB' : 'Maksimal 15 MB · Sheet sumber: Logbook'}</span>
          </div>
          {parsing && <div style={{ marginTop: 8 }}>Membaca episode dan mencocokkan pilihan indikator ke master...</div>}
        </div>

        {findings && <div className="piBox">
          <strong>Pemeriksaan workbook:</strong> {findings.sheetCount} worksheet; {findings.dataRows} episode terdeteksi; formula error pada Logbook: {findings.sourceFormulaErrors}; formula error pada worksheet rekap yang tidak diimpor: {findings.reportFormulaErrors}.
          <div className="aqSub">Nomor urut sumber berulang: {findings.repeatedSequenceGroups} kelompok ({findings.repeatedSequenceRows} baris); No. RM berulang: {findings.repeatedMrnGroups} kelompok ({findings.repeatedMrnRows} episode). Kunci impor selalu menggunakan baris Excel fisik.</div>
        </div>}

        {rows.length > 0 && <div className="piStats">
          <div className="piStat"><span>Episode siap dipratinjau</span><strong>{rows.length}</strong></div>
          <div className="piStat"><span>Respons indikator tersinkron</span><strong>{matchedResponses}</strong></div>
          <div className="piStat"><span>Respons menunggu klasifikasi</span><strong>{pendingResponses}</strong></div>
          <div className="piStat"><span>Episode dengan warning</span><strong>{rowsWithWarnings}</strong></div>
        </div>}

        {rows.length > 0 && <div className="piBox piWarn">
          <strong>Klasifikasi numerator/denominator belum ditetapkan:</strong> label dan kode sumber dicocokkan secara tepat dengan master. Kode sumber 1/2/3 tidak otomatis diartikan sebagai status memenuhi atau tidak memenuhi indikator; seluruh respons yang tersedia berstatus pending sampai pemilik indikator menetapkan klasifikasi N/D.
          <div style={{ marginTop: 6 }}><strong>Kekosongan BHP/Linen/penunjang:</strong> nilai sumber disimpan utuh, tetapi tidak dipetakan ke 18.2 Linen atau 18.7 Obat karena definisi sumber gabungan berbeda dari kedua master aktif.</div>
          <div style={{ marginTop: 6 }}>Tanggal pencatatan memakai Tanggal Keluar untuk episode selesai. Dengan demikian, episode yang masuk pada Desember 2025 dan keluar pada 2026 tetap tercatat pada periode profil 2026.</div>
        </div>}

        {rows.length > 0 && <div className="piBox">
          <strong>Preview tersamarkan · {preview.length} dari {rows.length} episode pertama</strong>
          <div className="piTable" style={{ marginTop: 8 }}>
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
                  <td>{Object.keys(row.indicators).length}/5</td>
                  <td>{row.warnings.length ? <details><summary className="piTag pending">{row.warnings.length} perlu ditinjau</summary><ul style={{ margin: 6, paddingLeft: 18, minWidth: 230 }}>{row.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details> : <span className="piTag">OK</span>}</td>
                </tr>)}
              </tbody>
            </table>
          </div>
        </div>}

        {errors.length > 0 && <div className="piBox piError">
          <strong>{errors.length} baris belum valid — impor ditahan.</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {errors.slice(0, 40).map((error, index) => <li key={index}>{error}</li>)}
          </ul>
          {errors.length > 40 && <div className="aqSub">Menampilkan 40 temuan pertama dari {errors.length}.</div>}
        </div>}

        {errorMessage && <div className={'piBox ' + (result ? 'piSuccess' : errors.length || /gagal|belum|tidak|error/i.test(errorMessage) ? 'piError' : 'piWarn')}>{errorMessage}</div>}

        {partial && importing && <div className="piBox">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>Progres impor</strong><span>{progress}% · {partial.received}/{rows.length}</span></div>
          <div className="piProgress" style={{ marginTop: 8 }}><span style={{ width: progress + '%' }} /></div>
          <div className="aqSub" style={{ marginTop: 6 }}>{partial.imported} baru · {partial.skipped} sudah ada · {partial.completedBatches} batch selesai</div>
        </div>}

        {result && <div className="piBox piSuccess">
          <strong>Ringkasan impor dari server</strong>
          <div style={{ marginTop: 6 }}>{result.imported} episode baru tersimpan · {result.skipped} dilewati karena sudah ada · {result.received} diterima server.</div>
          <div className="aqSub">Semua episode tetap Ready for Review; respons indikator menunggu klasifikasi numerator/denominator.</div>
        </div>}

        <div className="piFooter">
          <span className="aqMetaText">{errors.length ? 'Perbaiki seluruh kesalahan baris sebelum impor.' : rows.length ? 'Impor memerlukan Admin/PMKP, akses NICU, dan sesi login aktif.' : 'Belum ada workbook yang dipratinjau.'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="aqBtn" disabled={parsing || importing} onClick={close}>Batal</button>
            <button type="button" className="aqBtn primary" disabled={!eligible || !rows.length || errors.length > 0 || parsing || importing || !!result} onClick={() => void importRows()}>{importing ? 'Mengimpor...' : 'Impor ' + rows.length + ' episode NICU'}</button>
          </div>
        </div>
      </div>
    </section>
  </div>
}
