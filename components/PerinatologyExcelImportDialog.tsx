'use client'

import { useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { DEFAULT_IMPORT_BATCH_SIZE, MIN_IMPORT_BATCH_SIZE, nextBatchSizeAfterTimeout } from '@/lib/aureka/import-batching'
import {
  calculatePerinatologyStayDays,
  isPerinatologyFormulaError,
  makePerinatologySubjectKey,
  normalizePerinatologyDate,
  readPerinatologyCellValue,
  mapPerinatologyLogbookHeaders,
  parsePerinatologySourceAnswer,
  PERINATOLOGY_SOURCE_INDICATORS,
  type PerinatologyIndicatorProfile,
  type PerinatologySourceAnswer,
} from '@/lib/aureka/perinatology-logbook'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_DATA_ROWS = 5000
const BATCH_SIZE = Math.min(DEFAULT_IMPORT_BATCH_SIZE, 20)
const MIN_BATCH_SIZE = MIN_IMPORT_BATCH_SIZE
type PreparedRow = {
  sourceRow: number
  sourceNo: string
  patientName: string
  medicalRecordNo: string
  admissionDate: string
  dischargeDate: string | null
  diagnosis: string
  patientCategory: string
  dischargeStatus: string
  weight: string
  height: string
  sourceLos: string
  computedLos: number | null
  receivingNurse: string
  dpjp: string
  unmappedBhpLinen: string
  unmappedBhpLinenHeader: string
  indicators: Record<string, PerinatologySourceAnswer>
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
}
type ImportResponse = { received_count?: number; imported_count?: number; skipped_existing_count?: number }
type Props = {
  open: boolean
  roomId: number | null
  year: number
  authorized: boolean
  profiles: PerinatologyIndicatorProfile[]
  onClose: () => void
  onImported: (summary: { imported: number; skipped: number; received: number }) => void | Promise<void>
}

function readCellValue(cell: any): unknown {
  return readPerinatologyCellValue(cell?.value)
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
    const display = String(cell?.text ?? '').trim()
    return display && !/[Ee][+-]?\d+/.test(display) ? display : String(Math.trunc(value))
  }
  return String(value).trim()
}

function findHeaderRow(sheet: any): { rowNumber: number; indexes: Record<string, number> } {
  let bestMissingHeaders: string[] = []
  let bestDuplicateHeaders: string[] = []

  for (let rowNumber = 1; rowNumber <= Math.min(10, sheet.rowCount); rowNumber++) {
    const row = sheet.getRow(rowNumber)
    const count = Math.min(Number(row.cellCount ?? row.actualCellCount ?? 100), 100)
    const headerValues = Array.from({ length: count }, (_, index) => cellText(row.getCell(index + 1)))
    const mapped = mapPerinatologyLogbookHeaders(headerValues)

    if (mapped.missingHeaders.length === 0 && mapped.duplicateHeaders.length === 0) {
      return { rowNumber, indexes: mapped.indexes }
    }

    if (!bestMissingHeaders.length || mapped.missingHeaders.length < bestMissingHeaders.length) {
      bestMissingHeaders = mapped.missingHeaders
      bestDuplicateHeaders = mapped.duplicateHeaders
    }
  }

  const details = [
    bestMissingHeaders.length ? 'Header wajib belum ditemukan: ' + bestMissingHeaders.join(', ') + '.' : '',
    bestDuplicateHeaders.length ? 'Header ganda: ' + bestDuplicateHeaders.join(', ') + '.' : '',
  ].filter(Boolean).join(' ')
  throw new Error('Header Logbook Perinatologi tidak lengkap.' + (details ? ' ' + details : ' Periksa baris header Logbook.'))
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
  ].join('|')
}

function preparePayload(row: PreparedRow, fileName: string, userId: string, profiles: PerinatologyIndicatorProfile[]) {
  const profileByCode = new Map(
    profiles
      .filter(profile => Number(profile.room_id) === 20 && Number(profile.profile_year) === 2026 && profile.is_active === true && profile.status === 'published')
      .map(profile => [String(profile.code), profile]),
  )

  const indicatorValues: Record<string, Record<string, unknown>> = {}
  const sourceIndicatorValues: Record<string, string> = {}
  const responses: Array<Record<string, unknown>> = []

  for (const item of PERINATOLOGY_SOURCE_INDICATORS) {
    const answer = row.indicators[item.code]
    if (!answer) continue
    const profile = profileByCode.get(item.code)
    if (!profile?.id) throw new Error('Master indikator ' + item.code + ' tidak tersedia untuk impor Perinatologi.')

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
      other_text: answer.reviewRequired ? answer.sourceLabel : null,
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
      source_header: row.unmappedBhpLinenHeader,
      source_value: row.unmappedBhpLinen,
      mapping_status: 'combined_bhp_linen_source_not_mapped',
      reason: 'Pilihan sumber memuat gabungan BHP/Linen/barang penunjang; data disimpan sebagai provenance dan tidak dipaksakan ke indikator terpisah.',
      target_profiles: ['20.6 Kekosongan Linen', '20.12 Kekosongan Obat'],
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
    'Berat Badan': row.weight,
    'Tinggi Badan': row.height,
    'Lenght of Stay': row.computedLos,
    'Perawat Penerima': row.receivingNurse,
    'DPJP': row.dpjp,
    [row.unmappedBhpLinenHeader + ' (sumber belum dipetakan)']: row.unmappedBhpLinen,
  }

  const core = {
    patient_name: row.patientName,
    medical_record_no: row.medicalRecordNo,
    admission_at: row.admissionDate,
    discharge_at: row.dischargeDate,
    unit_name: 'Perinatology & Neonatology',
    room_id: 20,
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
      room_id: 20,
      profile_year: 2026,
      measurement_grain: 'patient_episode',
      record_date: row.admissionDate,
      subject_key: makePerinatologySubjectKey(2026, row.sourceRow),
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

export default function PerinatologyExcelImportDialog({
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

  const eligible = open && authorized && roomId === 20 && year === 2026
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

  const parseWorkbook = async (selectedFile: File) => {
    setFile(selectedFile)
    setRows([]); setErrors([]); setResult(null); setPartial(null); setProgress(0); setErrorMessage(''); setFindings(null)

    if (!eligible) {
      setErrorMessage('Pilih Perinatology & Neonatology dan tahun 2026 sebelum mengunggah.')
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
            if (!isPerinatologyFormulaError(formulaValue(cell))) return
            if (worksheet.name === 'Logbook') sourceFormulaErrors++
            else reportFormulaErrors++
          })
        })
      }

      const header = findHeaderRow(sheet)
      const activeProfiles = profiles.filter(profile =>
        Number(profile.room_id) === 20 &&
        Number(profile.profile_year) === 2026 &&
        profile.is_active === true &&
        profile.status === 'published',
      )
      const profileByCode = new Map(activeProfiles.map(profile => [String(profile.code), profile]))
      for (const item of PERINATOLOGY_SOURCE_INDICATORS) {
        const profile = profileByCode.get(item.code)
        if (!profile?.id) throw new Error('Master indikator ' + item.code + ' belum aktif/terbit di unit Perinatologi.')
        if (!Array.isArray(profile.options_json) || profile.options_json.length === 0) {
          throw new Error('Pilihan master indikator ' + item.code + ' belum disinkronkan dari Profil workbook. Terapkan migrasi Perinatologi terlebih dahulu.')
        }
      }

      const unmappedBhpLinenHeader = cellText(sheet.getRow(header.rowNumber).getCell(header.indexes.unmappedBhpLinen))
      const prepared: PreparedRow[] = []
      const rowErrors: string[] = []
      const sequenceCounts = new Map<string, number>()
      const duplicateEpisodeCounts = new Map<string, number>()

      for (let excelRow = header.rowNumber + 1; excelRow <= sheet.rowCount; excelRow++) {
        const source = sheet.getRow(excelRow)
        const patientName = header.indexes.patientName == null ? '' : cellText(source.getCell(header.indexes.patientName))
        if (!patientName.trim()) continue

        if (prepared.length + rowErrors.length >= MAX_DATA_ROWS) {
          rowErrors.push('Jumlah episode melampaui batas ' + MAX_DATA_ROWS + ' baris.')
          break
        }

        const raw = (key: string) => header.indexes[key] == null ? '' : cellText(source.getCell(header.indexes[key]))
        const dateRaw = (key: string) => header.indexes[key] == null ? null : readCellValue(source.getCell(header.indexes[key]))
        try {
          const sourceNo = sourceNumber(source.getCell(header.indexes.sourceNo))
          const medicalRecordNo = raw('medicalRecordNo')
          const admissionDate = normalizePerinatologyDate(dateRaw('admissionDate'))
          const dischargeRaw = dateRaw('dischargeDate')
          const dischargeDate = dischargeRaw == null || String(dischargeRaw).trim() === ''
            ? null
            : normalizePerinatologyDate(dischargeRaw)
          const diagnosis = raw('diagnosis')
          const patientCategory = raw('patientCategory')
          const dischargeStatus = raw('dischargeStatus')
          const weight = raw('weight')
          const height = raw('height')
          const sourceLos = raw('sourceLos')
          const receivingNurse = raw('receivingNurse')
          const dpjp = raw('dpjp')
          const unmappedBhpLinen = raw('unmappedBhpLinen')

          if (!sourceNo || !/^\d+$/.test(sourceNo)) throw new Error('Nomor urut sumber kosong atau bukan angka.')
          if (!medicalRecordNo) throw new Error('No. Rekam Medis kosong.')
          if (!admissionDate) throw new Error('Tanggal Masuk kosong atau tidak valid.')
          if (Number(admissionDate.slice(0, 4)) !== 2026) throw new Error('Tanggal Masuk tidak sesuai profil 2026.')
          if (dischargeRaw != null && String(dischargeRaw).trim() !== '' && !dischargeDate) throw new Error('Tanggal Keluar terisi tetapi tidak valid.')
          if (dischargeDate && Number(dischargeDate.slice(0, 4)) !== 2026) throw new Error('Tanggal Keluar di luar profil 2026.')
          if (dischargeDate && dischargeDate < admissionDate) throw new Error('Tanggal Keluar lebih awal daripada Tanggal Masuk.')
          if (!diagnosis) throw new Error('Diagnosa Tegak kosong.')
          if (!receivingNurse) throw new Error('Perawat Penerima kosong.')
          if (!dpjp) throw new Error('DPJP kosong.')
          if (!weight) throw new Error('Berat Badan kosong.')

          const computedLos = calculatePerinatologyStayDays(admissionDate, dischargeDate)
          const warnings: string[] = []
          if (!dischargeDate) warnings.push('Tanggal Keluar belum tersedia; episode dipertahankan dengan status Ready for Review.')
          if (!dischargeStatus) warnings.push('Status Pulang belum tersedia; perlu konfirmasi apakah episode masih berjalan.')
          if (!height) warnings.push('Tinggi Badan tidak terisi pada sumber.')
          if (computedLos != null && sourceLos.trim() === '') {
            warnings.push('Cache formula Length of Stay kosong; LOS dihitung ulang dari tanggal masuk/keluar.')
          } else if (computedLos != null && sourceLos.trim() !== '' && Number.isFinite(Number(sourceLos)) && Number(sourceLos) !== computedLos) {
            warnings.push('Nilai LOS sumber berbeda dari selisih tanggal; nilai turunan memakai tanggal masuk/keluar.')
          }

          const indicators: Record<string, PerinatologySourceAnswer> = {}
          for (const item of PERINATOLOGY_SOURCE_INDICATORS) {
            const sourceValue = raw('indicator:' + item.code)
            if (!sourceValue.trim()) continue
            const profile = profileByCode.get(item.code)!
            const answer = parsePerinatologySourceAnswer(
              sourceValue,
              Array.isArray(profile.options_json) ? profile.options_json : [],
            )
            if (!answer) continue
            if (answer.mappingStatus !== 'mapped_pending_classification') {
              throw new Error(item.code + ' ' + item.header + ': pilihan sumber tidak cocok secara unik dengan master (' + answer.mappingStatus + '). Koreksi pilihan sumber sebelum impor.')
            }
            indicators[item.code] = answer
          }

          if (unmappedBhpLinen.trim()) {
            warnings.push(unmappedBhpLinenHeader + ' memuat pilihan gabungan BHP/Linen; nilai dipertahankan sebagai data sumber dan tidak dipetakan otomatis.')
          }

          const row: PreparedRow = {
            sourceRow: excelRow, sourceNo, patientName, medicalRecordNo, admissionDate,
            dischargeDate, diagnosis, patientCategory, dischargeStatus, weight, height,
            sourceLos, computedLos, receivingNurse, dpjp, unmappedBhpLinen, unmappedBhpLinenHeader, indicators, warnings,
          }
          sequenceCounts.set(sourceNo, (sequenceCounts.get(sourceNo) ?? 0) + 1)
          prepared.push(row)
          const identity = duplicateEpisodeKey(row)
          duplicateEpisodeCounts.set(identity, (duplicateEpisodeCounts.get(identity) ?? 0) + 1)
        } catch (error) {
          rowErrors.push('Baris Excel ' + excelRow + ': ' + (error instanceof Error ? error.message : 'Data tidak valid.'))
        }
      }

      let repeatedSequenceGroups = 0
      let repeatedSequenceRows = 0
      for (const count of sequenceCounts.values()) {
        if (count > 1) {
          repeatedSequenceGroups++
          repeatedSequenceRows += count
        }
      }
      for (const row of prepared) {
        if ((sequenceCounts.get(row.sourceNo) ?? 0) > 1) {
          row.warnings.push('Nomor urut sumber berulang; kunci impor tetap menggunakan baris Excel ' + row.sourceRow + '.')
        }
        if ((duplicateEpisodeCounts.get(duplicateEpisodeKey(row)) ?? 0) > 1) {
          row.warnings.push('Identitas episode dan tanggal perawatan yang sama muncul lebih dari sekali; perlu verifikasi.')
        }
      }

      setFindings({
        sheetCount: workbook.worksheets.length,
        dataRows: prepared.length,
        sourceFormulaErrors,
        reportFormulaErrors,
        repeatedSequenceGroups,
        repeatedSequenceRows,
      })
      if (!prepared.length && !rowErrors.length) throw new Error('Tidak ditemukan episode pasien pada sheet Logbook.')
      setRows(prepared)
      setErrors(rowErrors)
      if (rowErrors.length) {
        setErrorMessage('Ada baris yang tidak valid. Seluruh impor ditahan sampai baris wajib diperbaiki; tidak ada partial import.')
      } else {
        setErrorMessage('Pratinjau selesai. Respons indikator menunggu klasifikasi pembilang; seluruh episode berstatus Ready for Review.')
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
        const { data, error } = await quality().rpc('import_perinatology_logbook_batch', { p_rows: batch })
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
    <section className="aqDrawer aqWide aqPerinatologyImport" role="dialog" aria-modal="true" aria-labelledby="aqPerinatologyImportTitle">
      <style>{'.aqPerinatologyImport .aqBody{display:grid;align-content:start;gap:12px}.aqPerinatologyImport .piBox{padding:11px 13px;border:1px solid #e2e8e4;border-radius:11px;background:#fff;font-size:11px;line-height:1.55}.aqPerinatologyImport .piError{background:#fff1f0;color:#8b2822}.aqPerinatologyImport .piWarn{background:#fff8e8;color:#795c26}.aqPerinatologyImport .piSuccess{background:#ebf8ef;color:#1e6544}.aqPerinatologyImport .piTable{max-height:340px;overflow:auto;border:1px solid #e2e8e4;border-radius:10px}.aqPerinatologyImport table{width:100%;border-collapse:collapse;font-size:10px}.aqPerinatologyImport th,.aqPerinatologyImport td{padding:8px 9px;border-bottom:1px solid #e2e8e4;text-align:left;vertical-align:top}.aqPerinatologyImport th{position:sticky;top:0;background:#f5f8f6;z-index:1}.aqPerinatologyImport .piStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.aqPerinatologyImport .piStat{padding:10px;border:1px solid #e2e8e4;border-radius:10px;background:#fff;min-width:0}.aqPerinatologyImport .piStat span{display:block;color:#65736b;font-size:9px}.aqPerinatologyImport .piStat strong{display:block;font-size:17px;margin-top:4px}.aqPerinatologyImport .piFooter{position:sticky;bottom:0;background:rgba(255,255,255,.96);padding:12px 0 0;border-top:1px solid #e2e8e4;display:flex;justify-content:space-between;gap:10px;align-items:center}.aqPerinatologyImport .piProgress{height:7px;background:#e7ece9;border-radius:999px;overflow:hidden}.aqPerinatologyImport .piProgress>span{display:block;height:100%;background:var(--accent);transition:width .2s}.aqPerinatologyImport .piTag{display:inline-block;padding:3px 6px;border-radius:6px;background:#eef4f0;font-size:9px;margin:1px}.aqPerinatologyImport .piTag.pending{background:#fff1d6;color:#805d16}@media(max-width:850px){.aqPerinatologyImport .piStats{grid-template-columns:repeat(2,minmax(0,1fr))}.aqPerinatologyImport .piFooter{display:grid}}'}</style>
      <div className="aqDHead">
        <div>
          <div className="eyebrow">AUDIT INDIKATOR MUTU · PERINATOLOGY & NEONATOLOGY</div>
          <h4 id="aqPerinatologyImportTitle">Import workbook Perinatologi 2026</h4>
          <p>Pratinjau episode dari Logbook, pemetaan 10 indikator aktif, serta telaah klasifikasi sebelum pelaporan mutu.</p>
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
          <div className="aqSub">Nomor urut sumber berulang pada {findings.repeatedSequenceGroups} kelompok ({findings.repeatedSequenceRows} baris); identitas impor menggunakan baris Excel fisik.</div>
        </div>}

        {rows.length > 0 && <div className="piStats">
          <div className="piStat"><span>Episode siap dipratinjau</span><strong>{rows.length}</strong></div>
          <div className="piStat"><span>Respons indikator tersinkron</span><strong>{matchedResponses}</strong></div>
          <div className="piStat"><span>Respons menunggu klasifikasi</span><strong>{pendingResponses}</strong></div>
          <div className="piStat"><span>Episode dengan warning</span><strong>{rowsWithWarnings}</strong></div>
        </div>}

        {rows.length > 0 && <div className="piBox piWarn">
          <strong>Klasifikasi numerator belum ditetapkan:</strong> label dan kode sumber cocok dengan master, tetapi pilihan kode 1/2/3 tidak otomatis diperlakukan sebagai pembilang mutu. Seluruh respons indikator berstatus pending agar hasil mutu tidak salah dihitung sebelum pemilik indikator menetapkan pemetaan N/D.
          <div style={{ marginTop: 6 }}><strong>Kekosongan BHP/Linen:</strong> nilai sumber disimpan utuh, tetapi tidak dipetakan ke 20.6 Linen atau 20.12 Obat karena workbook tidak membedakan jenis barang.</div>
        </div>}

        {rows.length > 0 && <div className="piBox">
          <strong>Preview tersamarkan · 100 dari {rows.length} episode pertama</strong>
          <div className="piTable" style={{ marginTop: 8 }}>
            <table>
              <thead><tr><th>Baris Excel</th><th>No. RM</th><th>Nama</th><th>Tanggal masuk–keluar</th><th>LOS</th><th>Respons master</th><th>Warning</th></tr></thead>
              <tbody>
                {preview.map(row => <tr key={row.sourceRow}>
                  <td>{row.sourceRow}</td>
                  <td>{maskMedicalRecord(row.medicalRecordNo)}</td>
                  <td>{maskName(row.patientName)}</td>
                  <td>{row.admissionDate} – {row.dischargeDate ?? 'Belum pulang'}</td>
                  <td>{row.computedLos == null ? '—' : row.computedLos + ' hari'}</td>
                  <td>{Object.keys(row.indicators).length}/10 tersinkron</td>
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
          <span className="aqMetaText">{errors.length ? 'Perbaiki seluruh kesalahan baris sebelum impor.' : rows.length ? 'Impor memerlukan Admin/PMKP, akses Perinatologi, dan sesi login aktif.' : 'Belum ada workbook yang dipratinjau.'}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="aqBtn" disabled={parsing || importing} onClick={close}>Batal</button>
            <button type="button" className="aqBtn primary" disabled={!eligible || !rows.length || errors.length > 0 || parsing || importing || !!result} onClick={() => void importRows()}>{importing ? 'Mengimpor...' : 'Impor ' + rows.length + ' episode Perinatologi'}</button>
          </div>
        </div>
      </div>
    </section>
  </div>
}
