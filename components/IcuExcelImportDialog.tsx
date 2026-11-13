'use client'
import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'


import { useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import { DEFAULT_IMPORT_BATCH_SIZE, MIN_IMPORT_BATCH_SIZE, nextBatchSizeAfterTimeout } from '@/lib/aureka/import-batching'
import {
  calculateIcuStayDays,
  isIcuFormulaError,
  makeIcuSubjectKey,
  normalizeIcuDate,
  parseIcuSourceAnswer,
  type IcuIndicatorProfile,
  type IcuSourceAnswer,
} from '@/lib/aureka/icu-logbook'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_DATA_ROWS = 5000
const BATCH_SIZE = Math.min(DEFAULT_IMPORT_BATCH_SIZE, 20)
const MIN_BATCH_SIZE = MIN_IMPORT_BATCH_SIZE

const INDICATORS = [
  { code: '14.4', header: 'Visite Spesialis', aliases: ['Visite Hari Kerja (06.00-14.00) (Code 141)', 'Visite Hari Kerja (06.00-14.00)'] },
  { code: '14.8', header: 'Validitas Asesmen', aliases: ['Validitas Asesmen'] },
  { code: '14.3', header: 'Identifikasi Pasien', aliases: ['Identifikasi Pasien'] },
  { code: '14.5', header: 'APD', aliases: ['APD'] },
  { code: '14.6', header: 'Pencegahan Jatuh', aliases: ['Pencegahan Jatuh'] },
  { code: '14.7', header: 'Komunikasi Perawatan', aliases: ['Komunikasi Perawatan'] },
  { code: '14.2', header: 'Transfer IGD', aliases: ['Transfer IGD'] },
  { code: '14.9', header: 'LOS ICU Panjang', aliases: ['LOS ICU Panjang'] },
] as const

const REQUIRED_HEADERS: Record<string, string[]> = {
  sourceNo: ['No.', 'No'],
  patientName: ['Nama Pasien'],
  medicalRecordNo: ['No. Rekam Medis', 'No RM'],
  admissionDate: ['Tanggal Masuk'],
  dischargeDate: ['Tanggal Keluar'],
  diagnosis: ['Diagnosa Tegak', 'Diagnosis Tegak'],
  patientCategory: ['Kategori Pasien'],
  dischargeStatus: ['Status Pulang'],
  los: ['Lenght of Stay', 'Length of Stay'],
  receivingNurse: ['Perawat Penerima'],
  dpjp: ['DPJP'],
  unassignedBhpLinen: ['ekosongan BHP/Linen', 'Kekosongan BHP/Linen'],
}

type PreparedRow = {
  sourceRow: number
  sourceNo: string
  patientName: string
  medicalRecordNo: string
  admissionDate: string
  dischargeDate: string
  diagnosis: string
  patientCategory: string
  dischargeStatus: string
  sourceLos: string
  computedLos: number
  receivingNurse: string
  dpjp: string
  unassignedBhpLinen: string
  indicators: Record<string, IcuSourceAnswer>
  warnings: string[]
}

type ImportCounts = { received: number; imported: number; skipped: number; completedBatches: number }
type WorkbookFindings = { sheetCount: number; reportFormulaErrors: number; sourceFormulaErrors: number }
type ImportResponse = { received_count?: number; imported_count?: number; skipped_existing_count?: number }
type Props = {
  open: boolean
  roomId: number | null
  year: number
  authorized: boolean
  profiles: IcuIndicatorProfile[]
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
  return String(value ?? '')
}

function headerColumns(row: any): Map<string, number[]> {
  const result = new Map<string, number[]>()
  const count = Math.min(Number(row.cellCount ?? row.actualCellCount ?? 100), 100)
  for (let column = 1; column <= count; column++) {
    const text = cellText(row.getCell(column)).trim()
    if (!text) continue
    const key = normalizeExactHeader(text)
    const matches = result.get(key) ?? []
    matches.push(column)
    result.set(key, matches)
  }
  return result
}

function findHeader(columns: Map<string, number[]>, aliases: string[], required = true): number | null {
  for (const alias of aliases) {
    const matches = columns.get(normalizeExactHeader(alias))
    if (matches?.length) {
      if (matches.length > 1) throw new Error('Header "' + alias + '" muncul lebih dari satu kali pada baris header.')
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
        const column = findHeader(columns, aliases, key !== 'patientCategory' && key !== 'los' && key !== 'unassignedBhpLinen')
        if (column != null) indexes[key] = column
      }
      for (const item of INDICATORS) {
        const column = findHeader(columns, [...item.aliases])
        if (column == null) throw new Error('Header indikator ' + item.header + ' tidak ditemukan.')
        indexes['indicator:' + item.code] = column
      }
      const required = [
        'sourceNo', 'patientName', 'medicalRecordNo', 'admissionDate', 'dischargeDate',
        'diagnosis', 'dischargeStatus', 'receivingNurse', 'dpjp',
      ]
      if (required.every(key => indexes[key] != null)) return { rowNumber, indexes }
    } catch {
      // Continue scanning introductory/merged title rows.
    }
  }
  throw new Error('Header Logbook ICU tidak lengkap. Periksa kolom identitas, tanggal masuk/keluar, status pulang, perawat, DPJP, dan delapan indikator 14.2–14.9.')
}

function rowHasData(source: any, indexes: Record<string, number>): boolean {
  const keys = [
    'patientName', 'medicalRecordNo', 'admissionDate', 'dischargeDate', 'diagnosis',
    'dischargeStatus', 'receivingNurse', 'dpjp',
    ...INDICATORS.map(item => 'indicator:' + item.code),
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
  if (!parts.length) return '-'
  return parts.length === 1 ? parts[0].slice(0, 1) + '•••' : parts[0].slice(0, 1) + '••• ' + parts[parts.length - 1].slice(0, 1) + '•••'
}

function maskMedicalRecord(value: string): string {
  const compact = value.trim()
  return compact.length <= 4 ? '••••' : compact.slice(0, 2) + '••••' + compact.slice(-2)
}

function duplicateKey(row: PreparedRow): string {
  return [
    row.medicalRecordNo.trim().toLocaleLowerCase('id-ID'),
    row.admissionDate,
    row.dischargeDate,
    row.diagnosis.trim().replace(/\s+/g, ' ').toLocaleLowerCase('id-ID'),
  ].join('|')
}

function preparePayload(row: PreparedRow, fileName: string, userId: string, profiles: IcuIndicatorProfile[]) {
  const profileByCode = new Map(
    profiles
      .filter(profile => Number(profile.room_id) === 14 && Number(profile.profile_year) === 2026 && profile.is_active === true && profile.status === 'published')
      .map(profile => [String(profile.code), profile]),
  )
  const indicatorValues: Record<string, Record<string, unknown>> = {}
  const responses: Array<Record<string, unknown>> = []
  const sourceIndicatorValues: Record<string, string> = {}

  for (const item of INDICATORS) {
    const answer = row.indicators[item.code]
    const profile = profileByCode.get(item.code)
    if (!answer || !profile?.id) throw new Error('Master indikator ' + item.code + ' tidak tersedia untuk impor ICU.')
    sourceIndicatorValues[item.code] = answer.sourceLabel
    const rawValue = {
      answer: answer.label,
      code: answer.code,
      source_value: answer.sourceLabel,
      source_code: answer.sourceCode,
      review_required: answer.reviewRequired,
      mapping_status: answer.mappingStatus,
    }
    indicatorValues[item.code] = rawValue
    responses.push({
      indicator_id: profile.id,
      response_label: answer.label,
      response_code: answer.code,
      raw_value: rawValue,
      other_text: answer.reviewRequired ? answer.sourceLabel : null,
      review_status: answer.reviewRequired ? 'pending' : 'not_required',
    })
  }

  const sourceImport = {
    source_workbook: fileName,
    source_sheet: 'Logbook',
    source_excel_row: row.sourceRow,
    source_excel_no: row.sourceNo,
    source_indicator_values: sourceIndicatorValues,
    source_unmapped_indicator: {
      source_header: 'ekosongan BHP/Linen',
      source_value: row.unassignedBhpLinen,
      target_profiles: ['14.1 Kekosongan Linen', '14.10 Kekosongan Obat'],
      mapping_status: 'not_mapped_combined_source_requires_review',
    },
    source_cached_los: row.sourceLos,
    source_warnings: row.warnings,
    idempotency_basis: 'room_year_source_excel_row',
  }

  const formFields: Record<string, unknown> = {
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
    'Kekosongan BHP/Linen (sumber belum dipetakan)': row.unassignedBhpLinen,
  }

  const core = {
    patient_name: row.patientName,
    medical_record_no: row.medicalRecordNo,
    admission_at: row.admissionDate,
    discharge_at: row.dischargeDate,
    unit_name: 'Intensive Care Unit & High Care Unit',
    room_id: 14,
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
      room_id: 14,
      profile_year: 2026,
      measurement_grain: 'patient_episode',
      record_date: row.admissionDate,
      subject_key: makeIcuSubjectKey(2026, row.sourceRow),
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

export default function IcuExcelImportDialog({
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

  const eligible = open && authorized && roomId === 14 && year === 2026
  const preview = useMemo(() => rows.slice(0, 100), [rows])
  const mappedResponses = useMemo(
    () => rows.reduce((count, row) => count + Object.values(row.indicators).filter(answer => !answer.reviewRequired).length, 0),
    [rows],
  )
  const pendingResponses = useMemo(
    () => rows.reduce((count, row) => count + Object.values(row.indicators).filter(answer => answer.reviewRequired).length, 0),
    [rows],
  )
  const duplicateEpisodeRows = useMemo(() => rows.filter(row => row.warnings.some(warning => warning.includes('episode pasien yang sama'))).length, [rows])
  const sourceSeqDuplicateRows = useMemo(() => rows.filter(row => row.warnings.some(warning => warning.includes('nomor urut sumber berulang'))).length, [rows])

  const reset = () => {
    setFile(null); setRows([]); setErrors([]); setParsing(false); setImporting(false)
    setResult(null); setPartial(null); setProgress(0); setErrorMessage('')
    setFindings(null); setFileKey(value => value + 1)
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
      setErrorMessage('Pilih unit Intensive Care Unit & High Care Unit dan tahun 2026 sebelum mengunggah.')
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
            const value = formulaValue(cell)
            if (!isIcuFormulaError(value)) return
            if (worksheet.name === 'Logbook') sourceFormulaErrors++
            else reportFormulaErrors++
          })
        })
      }
      setFindings({ sheetCount: workbook.worksheets.length, reportFormulaErrors, sourceFormulaErrors })

      const header = findHeaderRow(sheet)
      const activeProfiles = profiles.filter(profile =>
        Number(profile.room_id) === 14 &&
        Number(profile.profile_year) === 2026 &&
        profile.is_active === true &&
        profile.status === 'published',
      )
      const profileByCode = new Map(activeProfiles.map(profile => [String(profile.code), profile]))
      for (const item of INDICATORS) {
        const profile = profileByCode.get(item.code)
        if (!profile?.id) throw new Error('Master indikator ' + item.code + ' belum aktif/terbit untuk ICU tahun 2026.')
      }

      const prepared: PreparedRow[] = []
      const rowErrors: string[] = []
      const rowSequenceCount = new Map<string, number>()
      const duplicateEpisodeCount = new Map<string, number>()

      for (let excelRow = header.rowNumber + 1; excelRow <= sheet.rowCount; excelRow++) {
        const source = sheet.getRow(excelRow)
        if (!rowHasData(source, header.indexes)) continue
        if (prepared.length + rowErrors.length >= MAX_DATA_ROWS) {
          rowErrors.push('Jumlah catatan melampaui batas ' + MAX_DATA_ROWS + ' baris.')
          break
        }

        try {
          const raw = (key: string) => header.indexes[key] == null ? '' : cellText(source.getCell(header.indexes[key]))
          const sourceNo = raw('sourceNo').trim()
          const patientName = raw('patientName')
          const medicalRecordNo = raw('medicalRecordNo')
          const admissionDate = normalizeIcuDate(readCellValue(source.getCell(header.indexes.admissionDate)))
          const dischargeDate = normalizeIcuDate(readCellValue(source.getCell(header.indexes.dischargeDate)))
          const diagnosis = raw('diagnosis')
          const patientCategory = raw('patientCategory')
          const dischargeStatus = raw('dischargeStatus')
          const sourceLos = String(formulaValue(source.getCell(header.indexes.los)) ?? '')
          const receivingNurse = raw('receivingNurse')
          const dpjp = raw('dpjp')
          const unassignedBhpLinen = raw('unassignedBhpLinen')

          if (!sourceNo) throw new Error('Nomor urut sumber kosong.')
          if (!patientName.trim()) throw new Error('Nama Pasien kosong.')
          if (!medicalRecordNo.trim()) throw new Error('No. Rekam Medis kosong.')
          if (!admissionDate) throw new Error('Tanggal Masuk kosong atau tidak valid.')
          if (!dischargeDate) throw new Error('Tanggal Keluar kosong atau tidak valid.')
          if (Number(admissionDate.slice(0, 4)) !== 2026) throw new Error('Tanggal Masuk tidak sesuai profil ICU 2026.')
          if (dischargeDate < admissionDate) throw new Error('Tanggal Keluar lebih awal daripada Tanggal Masuk.')
          if (!diagnosis.trim()) throw new Error('Diagnosa Tegak kosong.')
          if (!dischargeStatus.trim()) throw new Error('Status Pulang kosong.')
          if (!receivingNurse.trim()) throw new Error('Perawat Penerima kosong.')
          if (!dpjp.trim()) throw new Error('DPJP kosong.')

          const computedLos = calculateIcuStayDays(admissionDate, dischargeDate)
          if (computedLos == null) throw new Error('LOS tidak dapat dihitung dari tanggal masuk dan keluar yang valid.')
          const warnings: string[] = []
          if (isIcuFormulaError(sourceLos)) {
            warnings.push('Cache formula Lenght of Stay mengandung ' + sourceLos + '; LOS dihitung ulang dari tanggal sumber.')
          } else if (sourceLos.trim() !== '' && Number.isFinite(Number(sourceLos)) && Number(sourceLos) !== computedLos) {
            warnings.push('Nilai Lenght of Stay pada cache formula berbeda dari tanggal masuk/keluar; nilai turunan dihitung ulang.')
          }
          if (!patientCategory.trim()) warnings.push('Kategori Pasien dari formula sumber kosong; tidak ditebak dari diagnosis.')

          const answers: Record<string, IcuSourceAnswer> = {}
          for (const item of INDICATORS) {
            const sourceValue = raw('indicator:' + item.code)
            if (!sourceValue.trim()) throw new Error('Respons indikator ' + item.header + ' kosong.')
            const profile = profileByCode.get(item.code)!
            const answer = parseIcuSourceAnswer(sourceValue, Array.isArray(profile.options_json) ? profile.options_json : [])
            if (!answer) throw new Error('Respons indikator ' + item.header + ' tidak dapat dibaca.')
            answers[item.code] = answer
            if (answer.reviewRequired) {
              const reason = answer.mappingStatus === 'source_master_conflict'
                ? 'kode/label sumber bertentangan dengan master'
                : answer.mappingStatus === 'ambiguous_master'
                  ? 'pilihan master ambigu'
                  : 'pilihan master belum tersedia atau belum terpetakan'
              warnings.push(item.code + ' ' + item.header + ': ' + reason + '; respons disimpan menunggu telaah.')
            }
          }

          if (!unassignedBhpLinen.trim()) {
            warnings.push('Kolom gabungan BHP/Linen kosong; tidak ada asumsi pemetaan ke indikator 14.1 atau 14.10.')
          } else {
            warnings.push('Kolom gabungan BHP/Linen disimpan utuh sebagai sumber belum terpetakan; tidak dipecah ke indikator 14.1/14.10.')
          }

          const row: PreparedRow = {
            sourceRow: excelRow, sourceNo, patientName, medicalRecordNo,
            admissionDate, dischargeDate, diagnosis, patientCategory, dischargeStatus,
            sourceLos, computedLos, receivingNurse, dpjp, unassignedBhpLinen,
            indicators: answers, warnings,
          }
          const seqCount = rowSequenceCount.get(sourceNo) ?? 0
          rowSequenceCount.set(sourceNo, seqCount + 1)
          prepared.push(row)
          const identity = duplicateKey(row)
          duplicateEpisodeCount.set(identity, (duplicateEpisodeCount.get(identity) ?? 0) + 1)
        } catch (error) {
          rowErrors.push('Baris Excel ' + excelRow + ': ' + (error instanceof Error ? error.message : 'Data tidak valid.'))
        }
      }

      for (const row of prepared) {
        if ((rowSequenceCount.get(row.sourceNo) ?? 0) > 1) {
          row.warnings.push('Nomor urut sumber berulang; identitas impor tetap memakai nomor baris Excel ' + row.sourceRow + '.')
        }
        if ((duplicateEpisodeCount.get(duplicateKey(row)) ?? 0) > 1) {
          row.warnings.push('Terdeteksi episode pasien yang sama pada beberapa baris sumber; baris tidak digabung dan perlu verifikasi.')
        }
      }

      if (!prepared.length && !rowErrors.length) throw new Error('Tidak ditemukan episode pasien pada sheet Logbook.')
      setRows(prepared)
      setErrors(rowErrors)
      if (rowErrors.length) {
        setErrorMessage('Ada baris yang tidak valid. Seluruh impor ditahan sampai baris wajib diperbaiki; tidak ada partial import.')
      } else if (prepared.length) {
        setErrorMessage('Pratinjau siap. Semua episode berstatus Ready for Review dan tidak otomatis divalidasi.')
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
        const { data, error } = await quality().rpc('import_icu_logbook_batch', { p_rows: batch })
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
    <section ref={importDialogRef} tabIndex={-1} className="aqDrawer aqWide aqIcuImport" role="dialog" aria-modal="true" aria-labelledby="aqIcuImportTitle">
      <style>{'.aqIcuImport .aqBody{display:grid;align-content:start;gap:12px}.aqIcuImport .iiBox{padding:11px 13px;border:1px solid #e2e8e4;border-radius:11px;background:#fff;font-size:11px;line-height:1.55}.aqIcuImport .iiError{background:#fff1f0;color:#8b2822}.aqIcuImport .iiWarn{background:#fff8e8;color:#795c26}.aqIcuImport .iiSuccess{background:#ebf8ef;color:#1e6544}.aqIcuImport .iiTable{max-height:340px;overflow:auto;border:1px solid #e2e8e4;border-radius:10px}.aqIcuImport table{width:100%;border-collapse:collapse;font-size:11px}.aqIcuImport th,.aqIcuImport td{padding:8px 9px;border-bottom:1px solid #e2e8e4;text-align:left;vertical-align:top}.aqIcuImport th{position:sticky;top:0;background:#f5f8f6;z-index:1}.aqIcuImport .iiStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.aqIcuImport .iiStat{padding:10px;border:1px solid #e2e8e4;border-radius:10px;background:#fff;min-width:0}.aqIcuImport .iiStat span{display:block;color:#65736b;font-size:11px}.aqIcuImport .iiStat strong{display:block;font-size:17px;margin-top:4px}.aqIcuImport .iiFooter{position:sticky;bottom:0;background:rgba(255,255,255,.96);padding:12px 0 0;border-top:1px solid #e2e8e4;display:flex;justify-content:space-between;gap:10px;align-items:center}.aqIcuImport .iiProgress{height:7px;background:#e7ece9;border-radius:999px;overflow:hidden}.aqIcuImport .iiProgress>span{display:block;height:100%;background:var(--accent);transition:width .2s}.aqIcuImport .iiTag{display:inline-block;padding:3px 6px;border-radius:6px;background:#eef4f0;font-size:11px;margin:1px}.aqIcuImport .iiTag.pending{background:#fff1d6;color:#805d16}@media(max-width:850px){.aqIcuImport .iiStats{grid-template-columns:repeat(2,minmax(0,1fr))}.aqIcuImport .iiFooter{display:grid}}'}</style>
      <div className="aqDHead">
        <div>
          <div className="eyebrow">Audit indikator mutu · ICU / HCU</div>
          <h4 id="aqIcuImportTitle">Import workbook ICU 2026</h4>
          <p>Unggah workbook sumber, tinjau pemetaan master, lalu impor sebagai episode pasien Ready for Review.</p>
        </div>
        <button className="aqClose" type="button" disabled={parsing || importing} onClick={close} aria-label="Tutup">×</button>
      </div>
      <div className="aqBody">
        <div className="iiBox">
          <strong>Unggah workbook Excel (.xlsx)</strong>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginTop: 8 }}>
            <input key={fileKey} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={parsing || importing} onChange={(event: any) => { const selected = event.target.files?.[0]; if (selected) void parseWorkbook(selected); event.target.value = '' }} />
            <span className="aqMetaText">{file ? file.name + ' · ' + (file.size / 1024 / 1024).toFixed(2) + ' MB' : 'Maksimal 15 MB · Sheet sumber: Logbook'}</span>
          </div>
          {parsing && <div style={{ marginTop: 8 }}>Membaca seluruh Logbook dan memeriksa sumber...</div>}
        </div>

        {findings && <div className="iiBox">
          <strong>Pemeriksaan workbook:</strong> {findings.sheetCount} worksheet; formula error pada Logbook: {findings.sourceFormulaErrors}; formula error pada worksheet rekap yang tidak diimpor: {findings.reportFormulaErrors}.
          <div className="aqSub">Hanya sheet Logbook diproses. Dashboard, Profil, dan sheet laporan 1–20 tidak menjadi sumber episode.</div>
        </div>}

        {rows.length > 0 && <div className="iiStats">
          <div className="iiStat"><span>Episode siap dipratinjau</span><strong>{rows.length}</strong></div>
          <div className="iiStat"><span>Respons cocok dengan master</span><strong>{mappedResponses}</strong></div>
          <div className="iiStat"><span>Respons menunggu telaah</span><strong>{pendingResponses}</strong></div>
          <div className="iiStat"><span>Baris dengan peringatan duplikasi</span><strong>{duplicateEpisodeRows + sourceSeqDuplicateRows}</strong></div>
        </div>}

        {rows.length > 0 && <div className="iiBox iiWarn">
          <strong>Pembatasan pemetaan klinis:</strong> kolom sumber “ekosongan BHP/Linen” disimpan utuh dalam form dan provenance, tetapi tidak dipaksakan menjadi indikator 14.1 (linen) atau 14.10 (obat). Workbook menggabungkan jenis kendala, sedangkan master ICU memisahkannya. Beberapa master 14.5–14.9 belum memiliki options_json, dan respons yang kodenya bertentangan juga disimpan pending untuk telaah.
        </div>}

        {rows.length > 0 && <div className="iiBox">
          <strong>Preview tersamarkan · 100 dari {rows.length} episode pertama</strong>
          <div className="iiTable" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>Baris Excel</th><th>No. RM</th><th>Nama</th><th>Tanggal masuk–keluar</th><th>LOS</th><th>Respons master</th><th>Warnings</th></tr></thead>
              <tbody>
                {preview.map(row => {
                  const mapped = Object.values(row.indicators).filter(answer => !answer.reviewRequired).length
                  return <tr key={row.sourceRow}>
                    <td>{row.sourceRow}</td>
                    <td>{maskMedicalRecord(row.medicalRecordNo)}</td>
                    <td>{maskName(row.patientName)}</td>
                    <td>{row.admissionDate} – {row.dischargeDate}</td>
                    <td>{row.computedLos} hari</td>
                    <td>{mapped}/8 cocok</td>
                    <td>{row.warnings.length ? <details><summary className="iiTag pending">{row.warnings.length} perlu ditinjau</summary><ul style={{ margin: 6, paddingLeft: 18, minWidth: 230 }}>{row.warnings.map((warning, index) => <li key={index}>{warning}</li>)}</ul></details> : <span className="iiTag">OK</span>}</td>
                  </tr>
                })}
              </tbody>
            </table>
          </div>
        </div>}

        {errors.length > 0 && <div className="iiBox iiError">
          <strong>{errors.length} baris belum valid, impor ditahan.</strong>
          <ul style={{ margin: '8px 0 0', paddingLeft: 18 }}>
            {errors.slice(0, 40).map((error, index) => <li key={index}>{error}</li>)}
          </ul>
          {errors.length > 40 && <div className="aqSub">Menampilkan 40 temuan pertama dari {errors.length}.</div>}
        </div>}

        {errorMessage && <div className={'iiBox ' + (result ? 'iiSuccess' : errors.length || /gagal|belum|tidak|error/i.test(errorMessage) ? 'iiError' : 'iiWarn')}>{errorMessage}</div>}

        {partial && importing && <div className="iiBox">
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}><strong>Progres impor</strong><span>{progress}% · {partial.received}/{rows.length}</span></div>
          <div className="iiProgress" style={{ marginTop: 8 }}><span style={{ width: progress + '%' }} /></div>
          <div className="aqSub" style={{ marginTop: 6 }}>{partial.imported} baru · {partial.skipped} sudah ada · {partial.completedBatches} batch selesai</div>
        </div>}

        {result && <div className="iiBox iiSuccess">
          <strong>Ringkasan impor dari server</strong>
          <div style={{ marginTop: 6 }}>{result.imported} episode baru tersimpan · {result.skipped} dilewati karena sudah ada · {result.received} diterima server.</div>
          <div className="aqSub">Semua episode tetap Ready for Review. Tidak ada validasi otomatis.</div>
        </div>}

        <div className="iiFooter">
          <span className="aqMetaText">{errors.length ? 'Perbaiki seluruh kesalahan baris sebelum impor.' : rows.length ? 'Impor memerlukan Admin/PMKP, akses ICU, dan sesi login aktif.' : 'Belum ada workbook yang dipratinjau.'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="aqBtn" disabled={parsing || importing} onClick={close}>Batal</button>
            <button type="button" className="aqBtn primary" disabled={!eligible || !rows.length || errors.length > 0 || parsing || importing || !!result} onClick={() => void importRows()}>{importing ? 'Mengimpor...' : 'Impor ' + rows.length + ' episode ICU'}</button>
          </div>
        </div>
      </div>
    </section>
  </div>
}
