'use client'

import { useMemo, useState } from 'react'
import { buildPharmacyImportRecords, PHARMACY_INDICATOR_CODES, type PharmacyImportRecord, type PharmacySourceObservation } from '@/lib/aureka/pharmacy-excel-import'
import { DEFAULT_IMPORT_BATCH_SIZE, MIN_IMPORT_BATCH_SIZE, isStatementTimeout, nextBatchSizeAfterTimeout } from '@/lib/aureka/import-batching'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import { aurekaSupabase } from '@/lib/aureka/supabase'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_DATA_ROWS = 5000
const BATCH_SIZE = DEFAULT_IMPORT_BATCH_SIZE
const MIN_BATCH_SIZE = MIN_IMPORT_BATCH_SIZE

const SHEETS = [
  { name: 'Copy Resep Rajal', code: '5.2', stream: 'Rawat Jalan', title: 'Angka Copy Resep', numeratorHeader: 'Jumlah Copy Resep yang Ditulis Oleh Farmasi', denominatorHeader: 'Jumlah Resep yang Dilayani Farmasi' },
  { name: 'High Alert Rajal', code: '5.3', stream: 'Rawat Jalan', title: 'Angka Ketidakpatuhan Penggunaan Label High Alert', numeratorHeader: 'Jumlah Obat yang Tidak Dilabeli High Alert', denominatorHeader: 'Jumlah Obat / Sediaan yang Harusnya Dilabeli High Alert' },
  { name: 'Fornas Rajal', code: '5.4', stream: 'Rawat Jalan', title: 'Kepatuhan Penggunaan Formularium Nasional', numeratorHeader: 'Jumlah Resep yang Patuh Dengan Formularium Nasional', denominatorHeader: 'Jumlah Resep yang Dilayani Farmasi' },
  { name: 'Forumkit Rajal', code: '5.5', stream: 'Rawat Jalan', title: 'Kepatuhan Penggunaan Formularium Rumah Sakit', numeratorHeader: 'Jumlah Resep yang Patuh Dengan Formularium Rumah Sakit', denominatorHeader: 'Jumlah Resep yang Dilayani Farmasi' },
  { name: 'Copy Resep Ranap', code: '5.2', stream: 'Rawat Inap', title: 'Angka Copy Resep', numeratorHeader: 'Jumlah Copy Resep yang Ditulis Oleh Farmasi', denominatorHeader: 'Jumlah Resep yang Dilayani Farmasi' },
  { name: 'High Alert Ranap', code: '5.3', stream: 'Rawat Inap', title: 'Angka Ketidakpatuhan Penggunaan Label High Alert', numeratorHeader: 'Jumlah Obat yang Tidak Dilabeli High Alert', denominatorHeader: 'Jumlah Obat / Sediaan yang Harusnya Dilabeli High Alert' },
  { name: 'Fornas Ranap', code: '5.4', stream: 'Rawat Inap', title: 'Kepatuhan Penggunaan Formularium Nasional', numeratorHeader: 'Jumlah Resep yang Patuh Dengan Formularium Nasional', denominatorHeader: 'Jumlah Resep yang Dilayani Farmasi' },
  { name: 'Forumkit Ranap', code: '5.5', stream: 'Rawat Inap', title: 'Kepatuhan Penggunaan Formularium Rumah Sakit', numeratorHeader: 'Jumlah Resep yang Patuh Dengan Formularium Rumah Sakit', denominatorHeader: 'Jumlah Resep yang Dilayani Farmasi' },
] as const

type IndicatorProfile = Record<string, any> & {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  is_active?: boolean
  status?: string
}
type ImportCounts = { received: number; imported: number; skipped: number; completedBatches: number }
type Props = {
  open: boolean
  roomId: number | null
  year: number
  authorized: boolean
  profiles: IndicatorProfile[]
  onClose: () => void
  onImported: (summary: { imported: number; skipped: number; received: number }) => void | Promise<void>
}
type ImportResponse = { received_count?: number; imported_count?: number; skipped_existing_count?: number }

function readCellValue(cell: any): unknown {
  const value = cell?.value
  if (value == null) return ''
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if ('result' in value && value.result != null) return value.result
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
  if (value instanceof Date) return dateValue(value) ?? ''
  return String(value).trim()
}

function dateValue(value: unknown): string | null {
  if (value instanceof Date) {
    const y = value.getUTCFullYear()
    const m = value.getUTCMonth() + 1
    const d = value.getUTCDate()
    if (!y || !m || !d) return null
    return String(y) + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0')
  }
  const source = String(value ?? '').trim()
  if (!source) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(source)) {
    const parsed = new Date(source + 'T00:00:00.000Z')
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === source ? source : null
  }
  const dmy = source.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})$/)
  if (dmy) {
    const day = Number(dmy[1]), month = Number(dmy[2]), year = Number(dmy[3])
    const date = new Date(Date.UTC(year, month - 1, day))
    return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
      ? String(year) + '-' + String(month).padStart(2, '0') + '-' + String(day).padStart(2, '0')
      : null
  }
  if (/^\d+(?:[.,]\d+)?$/.test(source)) {
    const serial = Number(source.replace(',', '.'))
    if (Number.isFinite(serial) && serial >= 20000 && serial <= 80000) {
      return new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86400000).toISOString().slice(0, 10)
    }
  }
  return null
}

function countValue(value: unknown): number | null {
  if (value == null || String(value).trim() === '') return null
  if (typeof value === 'number') return Number.isSafeInteger(value) && value >= 0 ? value : null
  let raw = String(value).trim().replace(/\s/g, '')
  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(raw)) raw = raw.replace(/\./g, '').replace(',', '.')
  else raw = raw.replace(',', '.')
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null
}

function isCountCellBlank(value: unknown): boolean {
  return value == null || String(value).trim() === ''
}

function formatCount(value: number | null | undefined): string {
  return value == null ? '—' : Number(value).toLocaleString('id-ID')
}

function makePayload(row: PharmacyImportRecord, fileName: string, userId: string, profiles: IndicatorProfile[]) {
  const indicatorValues: Record<string, Record<string, number>> = {}
  const responses: Array<Record<string, unknown>> = []

  for (const code of PHARMACY_INDICATOR_CODES) {
    const profile = profiles.find(item =>
      Number(item.room_id) === 5 &&
      Number(item.profile_year) === 2026 &&
      String(item.code) === code &&
      item.id &&
      item.is_active === true &&
      item.status === 'published'
    )
    if (!profile?.id) throw new Error('Master indikator Farmasi ' + code + ' tidak aktif/terbit. Muat ulang modul dan periksa master sebelum impor.')

    const metric = row.values[code]
    const value = {
      numerator: metric.numerator,
      denominator: metric.denominator,
      ...(code === '5.3' ? { noncompliant: metric.noncompliant ?? 0 } : {}),
      source_numerator: metric.sourceNumerator,
      source_denominator: metric.sourceDenominator,
    }
    indicatorValues[code] = value
    responses.push({
      indicator_id: profile.id,
      response_label: null,
      response_code: null,
      raw_value: value,
      other_text: null,
      review_status: 'not_required',
    })
  }

  const sourceImport = {
    source_workbook: fileName,
    source_rows: row.sourceRows,
    source_sheet_names: Object.keys(row.sourceRows),
    import_scope: 'daily_detail_sheets_only',
  }
  const formFields = {
    'Tanggal pengamatan': row.date,
    'Alur layanan': row.serviceStream,
    'Catatan harian': '',
  }
  const core = {
    patient_name: '',
    medical_record_no: '',
    admission_at: row.date,
    unit_name: 'Instalasi Farmasi',
    room_id: 5,
    status: 'Ready for Review',
    workflow_status: 'Ready for Review',
    form_fields: formFields,
    calculated_fields: {},
    indicator_values: indicatorValues,
    measurement_grain: 'daily_metric',
    source_import: sourceImport,
  }
  return {
    payload: {
      room_id: 5,
      profile_year: 2026,
      measurement_grain: 'daily_metric',
      record_date: row.date,
      subject_key: '5:' + row.date + ':' + row.serviceStream,
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

export default function PharmacyExcelImportDialog({
  open, roomId, year, authorized, profiles, onClose, onImported,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<PharmacyImportRecord[]>([])
  const [excluded, setExcluded] = useState<Array<{ date: string; serviceStream: string; reasons: string[]; sourceRows: Record<string, number> }>>([])
  const [noObservationCount, setNoObservationCount] = useState(0)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportCounts | null>(null)
  const [partial, setPartial] = useState<ImportCounts | null>(null)
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const [fileInputKey, setFileInputKey] = useState(0)
  const eligible = useMemo(() => open && authorized && roomId === 5 && year === 2026, [open, authorized, roomId, year])
  const outpatientCount = rows.filter(row => row.serviceStream === 'Rawat Jalan').length
  const inpatientCount = rows.filter(row => row.serviceStream === 'Rawat Inap').length

  const reset = () => {
    setFile(null)
    setRows([])
    setExcluded([])
    setNoObservationCount(0)
    setParsing(false)
    setImporting(false)
    setResult(null)
    setPartial(null)
    setProgress(0)
    setErrorMessage('')
    setFileInputKey(value => value + 1)
  }
  const close = () => {
    if (parsing || importing) return
    reset()
    onClose()
  }

  const parseWorkbook = async (selectedFile: File) => {
    setFile(selectedFile)
    setRows([])
    setExcluded([])
    setNoObservationCount(0)
    setResult(null)
    setPartial(null)
    setProgress(0)
    setErrorMessage('')

    if (!eligible) {
      setErrorMessage('Pilih unit Instalasi Farmasi dan tahun profil 2026 sebelum mengimpor.')
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

    setParsing(true)
    try {
      const ExcelJSModule = await import('exceljs-hardened')
      const ExcelJS: any = (ExcelJSModule as any).default ?? ExcelJSModule
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await selectedFile.arrayBuffer())

      const observations: PharmacySourceObservation[] = []
      const structureErrors: string[] = []
      const invalidDateGroups = new Map<string, { date: string; serviceStream: string; sourceRows: Record<string, number>; codes: Set<string>; noSample: boolean; reasons: string[] }>()
      let sourceRowsRead = 0

      for (const sheetConfig of SHEETS) {
        const worksheet = workbook.getWorksheet(sheetConfig.name)
        if (!worksheet) {
          structureErrors.push('Sheet "' + sheetConfig.name + '" tidak ditemukan.')
          continue
        }
        const title = cellText(worksheet.getRow(1).getCell(6))
        if (normalizeExactHeader(title) !== normalizeExactHeader(sheetConfig.title)) {
          structureErrors.push('Judul F1 pada sheet "' + sheetConfig.name + '" tidak sesuai. Diharapkan "' + sheetConfig.title + '".')
        }

        const headerRow = worksheet.getRow(10)
        const dateHeader = normalizeExactHeader(cellText(headerRow.getCell(2)))
        const numeratorHeader = normalizeExactHeader(cellText(headerRow.getCell(3)))
        const denominatorHeader = normalizeExactHeader(cellText(headerRow.getCell(4)))
        if (dateHeader !== normalizeExactHeader('Tanggal') ||
            numeratorHeader !== normalizeExactHeader(sheetConfig.numeratorHeader) ||
            denominatorHeader !== normalizeExactHeader(sheetConfig.denominatorHeader)) {
          structureErrors.push('Header baris 10 kolom B–D pada sheet "' + sheetConfig.name + '" tidak cocok. Pastikan menggunakan struktur workbook Instalasi Farmasi yang resmi.')
          continue
        }

        if (worksheet.rowCount > 5100) {
          structureErrors.push('Sheet "' + sheetConfig.name + '" melewati batas 5.100 baris.')
          continue
        }

        for (let excelRow = 11; excelRow <= worksheet.rowCount; excelRow++) {
          const sourceRow = worksheet.getRow(excelRow)
          const rawDate = readCellValue(sourceRow.getCell(2))
          const rawNumerator = readCellValue(sourceRow.getCell(3))
          const rawDenominator = readCellValue(sourceRow.getCell(4))
          if (isCountCellBlank(rawDate) && isCountCellBlank(rawNumerator) && isCountCellBlank(rawDenominator)) continue

          sourceRowsRead += 1
          if (sourceRowsRead > MAX_DATA_ROWS * SHEETS.length) {
            structureErrors.push('Workbook melampaui batas jumlah baris sumber yang diizinkan.')
            break
          }

          const date = dateValue(rawDate)
          if (!date) {
            const invalidKey = sheetConfig.stream + '|' + String(rawDate ?? '').trim()
            const current = invalidDateGroups.get(invalidKey) ?? {
              date: 'Tanggal sumber tidak valid: ' + String(rawDate ?? 'kosong'),
              serviceStream: sheetConfig.stream,
              sourceRows: {},
              codes: new Set<string>(),
              noSample: true,
              reasons: [],
            }
            const invalidNumerator = countValue(rawNumerator)
            const invalidDenominator = countValue(rawDenominator)
            const isNoSample = invalidNumerator === 0 && invalidDenominator === 0
            current.sourceRows[sheetConfig.name] = excelRow
            if (current.codes.has(sheetConfig.code)) {
              current.noSample = false
              current.reasons.push('Kode indikator berulang pada tanggal sumber yang tidak valid.')
            }
            current.codes.add(sheetConfig.code)
            current.noSample = current.noSample && isNoSample
            current.reasons.push('Sheet "' + sheetConfig.name + '" baris ' + excelRow + ': tanggal tidak valid; nilai sumber tidak ditebak.')
            if (!isNoSample) current.reasons.push('Terdapat nilai sumber yang memerlukan tanggal kalender yang valid.')
            invalidDateGroups.set(invalidKey, current)
            continue
          }
          const numerator = countValue(rawNumerator)
          const denominator = countValue(rawDenominator)
          const valueError = (
            (!isCountCellBlank(rawNumerator) && numerator == null) ||
            (!isCountCellBlank(rawDenominator) && denominator == null)
          ) ? 'Nilai numerator/denominator bukan bilangan bulat non-negatif.' : undefined

          observations.push({
            date,
            serviceStream: sheetConfig.stream as PharmacySourceObservation['serviceStream'],
            indicatorCode: sheetConfig.code as PharmacySourceObservation['indicatorCode'],
            numerator,
            denominator,
            sourceSheet: sheetConfig.name,
            sourceRow: excelRow,
            ...(valueError ? { error: valueError } : {}),
          })
        }
      }

      const built = buildPharmacyImportRecords(observations)
      const invalidDateExclusions = Array.from(invalidDateGroups.values())
        .filter(group => !(group.noSample && group.codes.size === 4))
        .map(group => ({
          date: group.date,
          serviceStream: group.serviceStream,
          sourceRows: group.sourceRows,
          reasons: group.reasons,
        }))
      const invalidDateNoSampleCount = invalidDateGroups.size - invalidDateExclusions.length
      setRows(built.records)
      setExcluded([...built.excluded, ...invalidDateExclusions])
      setNoObservationCount(built.noObservationCount + invalidDateNoSampleCount)
      setErrorMessage(structureErrors.length ? structureErrors.slice(0, 30).join('\n') + (structureErrors.length > 30 ? '\n… dan ' + (structureErrors.length - 30) + ' kesalahan struktur lain.' : '') : '')
      if (observations.length === 0 && structureErrors.length === 0) {
        setErrorMessage('Tidak ditemukan data harian pada delapan sheet sumber. Pastikan menggunakan workbook Farmasi yang benar.')
      }
    } catch (error) {
      setRows([])
      setExcluded([])
      setNoObservationCount(0)
      setErrorMessage(error instanceof Error ? error.message : 'Workbook Farmasi tidak dapat dibaca.')
    } finally {
      setParsing(false)
    }
  }

  const importRows = async () => {
    if (!file || !rows.length || !eligible || !authorized || importing || result || errorMessage) return
    setImporting(true)
    setErrorMessage('')
    setPartial({ received: 0, imported: 0, skipped: 0, completedBatches: 0 })
    setProgress(0)

    try {
      const authResult = await sb.auth.getUser()
      if (authResult.error) throw authResult.error
      const userId = authResult.data.user?.id
      if (!userId) throw new Error('Sesi login tidak ditemukan. Masuk ke AUREKA lalu ulangi impor.')

      const items = rows.map(row => makePayload(row, file.name, userId, profiles))
      const counts: ImportCounts = { received: 0, imported: 0, skipped: 0, completedBatches: 0 }
      let start = 0
      let batchSize = BATCH_SIZE
      let batchNumber = 0
      while (start < items.length) {
        const batch = items.slice(start, start + batchSize)
        batchNumber += 1
        const { data, error } = await quality().rpc('import_pharmacy_logbook_batch', { p_rows: batch })
        if (error) {
          if (/function .*import_pharmacy_logbook_batch.*not found|schema cache/i.test(error.message)) {
            throw new Error('Fungsi impor Farmasi belum tersedia di Supabase. Pastikan migrasi unified_workbook_imports telah diterapkan.')
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

                const received
        const received = Number(summary.received_count ?? batch.length)
        const imported = Number(summary.imported_count ?? 0)
        const skipped = Number(summary.skipped_existing_count ?? 0)
        if (received !== batch.length || imported + skipped !== received) {
          throw new Error('Ringkasan hasil server pada batch ' + batchNumber + ' tidak konsisten. Periksa daftar logbook sebelum mengulangi impor.')
        }
        counts.received += received
        counts.imported += imported
        counts.skipped += skipped
        counts.completedBatches += 1
        start += batch.length
        setPartial({ ...counts })
        setProgress(Math.round((counts.received / items.length) * 100))
      }

      if (counts.received !== items.length || counts.imported + counts.skipped !== counts.received) {
        throw new Error('Ringkasan akhir impor tidak konsisten. Periksa daftar logbook sebelum mengulangi impor.')
      }
      setResult({ ...counts })
      await onImported({ imported: counts.imported, skipped: counts.skipped, received: counts.received })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impor Farmasi gagal. Data tidak dianggap lengkap.')
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <div className="aqBack" role="presentation" onClick={event => { if (event.target === event.currentTarget) close() }}>
      <section className="aqDrawer aqPharmacyImport" role="dialog" aria-modal="true" aria-labelledby="aqPharmacyImportTitle">
        <style>{'.aqPharmacyImport .aqBody{display:grid;align-content:start;gap:12px}.aqPharmacyImport .ciIntro{font-size:12px;line-height:1.55;color:var(--muted)}.aqPharmacyImport .ciUpload{display:grid;gap:8px;padding:13px;border:1px dashed var(--line);border-radius:13px;background:rgba(255,255,255,.65)}.aqPharmacyImport .ciUpload input{width:100%;font-size:12px}.aqPharmacyImport .ciStats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.aqPharmacyImport .ciStat{padding:9px;background:#fff;border:1px solid var(--line);border-radius:11px;min-width:0}.aqPharmacyImport .ciStat span{display:block;color:var(--muted);font-size:10px}.aqPharmacyImport .ciStat strong{display:block;margin-top:4px;font-size:18px;overflow-wrap:anywhere}.aqPharmacyImport .ciMessage{padding:11px 13px;border-radius:11px;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.aqPharmacyImport .ciError{background:#fff0ef;color:#8b2822}.aqPharmacyImport .ciSuccess{background:#eaf8ef;color:#206443}.aqPharmacyImport .ciWarning{background:#fff8e7;color:#7b5d25}.aqPharmacyImport .ciTable{overflow:auto;max-height:310px;border:1px solid var(--line);border-radius:11px}.aqPharmacyImport table{width:100%;border-collapse:collapse;font-size:10px}.aqPharmacyImport th,.aqPharmacyImport td{padding:7px 8px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}.aqPharmacyImport th{position:sticky;top:0;background:#f7faf8}.aqPharmacyImport td.ciWrap{white-space:normal;min-width:200px}.aqPharmacyImport .ciPrivacy{font-size:10px;color:var(--muted);line-height:1.5}.aqPharmacyImport .ciCode{font-size:9px;font-weight:800;border:1px solid var(--line);padding:3px 5px;border-radius:6px;display:inline-block}@media(max-width:560px){.aqPharmacyImport .ciStats{grid-template-columns:repeat(2,minmax(0,1fr))}}'}</style>
        <div className="aqDHead">
          <div>
            <div className="eyebrow">Audit Indikator Mutu · Impor Terarah</div>
            <h4 id="aqPharmacyImportTitle">Unggah workbook Instalasi Farmasi</h4>
            <p>Profil 2026 · empat indikator harian · dua alur layanan</p>
          </div>
          <button className="aqClose" type="button" disabled={parsing || importing} onClick={close} aria-label="Tutup">×</button>
        </div>
        <div className="aqBody">
          {!authorized && <div className="ciMessage ciError">Impor workbook hanya tersedia untuk akun administrator/PMKP dengan akses unit yang sesuai.</div>}
          {!eligible && <div className="ciMessage ciError">Pilih Instalasi Farmasi dan tahun 2026 sebelum membuka alur impor ini.</div>}
          <div className="ciIntro">Sistem membaca delapan sheet harian: Copy Resep, High Alert, Fornas, dan Formularium Rumah Sakit untuk Rawat Jalan dan Rawat Inap. Header berada pada baris 10, data mulai baris 11. Sheet Dashboard dan rekap gabungan bulanan tidak diimpor agar tidak terjadi penghitungan ganda.</div>
          <div className="ciUpload">
            <label className="aqField"><span>Workbook Excel (.xlsx), maksimal 15 MB</span>
              <input key={fileInputKey} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!eligible || !authorized || parsing || importing} onChange={event => {
                const selectedFile = event.target.files?.[0]
                if (selectedFile) void parseWorkbook(selectedFile)
                event.currentTarget.value = ''
              }}/>
            </label>
            {file && <div className="ciPrivacy">Berkas dipilih: {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB. Data sumber Farmasi tidak memuat identitas pasien.</div>}
            <div className="ciPrivacy">Sistem menggabungkan empat indikator pada tanggal dan alur layanan yang sama. Baris 0/0 pada seluruh indikator dilewati; numerator yang melebihi denominator dikecualikan tanpa koreksi otomatis. Semua catatan baru berstatus Ready for Review, tidak tervalidasi otomatis. Batch awal 20 baris dan menyusut otomatis hingga 5 bila terjadi timeout.</div>
          </div>
          {parsing && <div className="ciMessage">Membaca delapan sheet dan memvalidasi data harian Farmasi…</div>}
          {errorMessage && <div className="ciMessage ciError" role="alert">{errorMessage}</div>}
          {(rows.length > 0 || excluded.length > 0) && <div className="ciStats">
            <div className="ciStat"><span>Siap diimpor</span><strong>{rows.length}</strong></div>
            <div className="ciStat"><span>Rawat Jalan</span><strong>{outpatientCount}</strong></div>
            <div className="ciStat"><span>Rawat Inap</span><strong>{inpatientCount}</strong></div>
            <div className="ciStat"><span>Dikecualikan</span><strong>{excluded.length}</strong></div>
            <div className="ciStat"><span>Tanggal tanpa pengamatan</span><strong>{noObservationCount}</strong></div>
          </div>}
          {excluded.length > 0 && <div className="ciMessage ciWarning">
            <strong>{excluded.length} tanggal/alur tidak ikut diimpor.</strong> Lengkapi atau koreksi data pada workbook sumber; sistem tidak menebak numerator/denominator.
            {'\n'}{excluded.slice(0, 50).map(row => row.date + ' · ' + row.serviceStream + ' · ' + row.reasons.join(' ')).join('\n')}
            {excluded.length > 50 ? '\n… dan ' + (excluded.length - 50) + ' tanggal/alur lainnya.' : ''}
          </div>}
          {rows.length > 0 && <div className="ciTable">
            <table><thead><tr><th>Tanggal</th><th>Alur</th><th>Copy Resep (N/D)</th><th>High Alert tidak berlabel (N/D)</th><th>Fornas (N/D)</th><th>Formularium RS (N/D)</th></tr></thead>
              <tbody>{rows.slice(0, 100).map(row => (
                <tr key={row.date + row.serviceStream}>
                  <td>{row.date}</td>
                  <td>{row.serviceStream}</td>
                  <td>{formatCount(row.values['5.2'].sourceNumerator)} / {formatCount(row.values['5.2'].sourceDenominator)}</td>
                  <td>{formatCount(row.values['5.3'].sourceNumerator)} / {formatCount(row.values['5.3'].sourceDenominator)}</td>
                  <td>{formatCount(row.values['5.4'].sourceNumerator)} / {formatCount(row.values['5.4'].sourceDenominator)}</td>
                  <td>{formatCount(row.values['5.5'].sourceNumerator)} / {formatCount(row.values['5.5'].sourceDenominator)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
          {rows.length > 100 && <div className="ciPrivacy">Pratinjau menampilkan 100 dari {rows.length} catatan siap diimpor.</div>}
          <div className="ciMessage ciWarning">Target Copy Resep pada workbook ≤ 5% berbeda dari target master aktif AUREKA ≤ 20%; target master tetap dipakai. Indikator High Alert di workbook belum mencakup LASA, sehingga perluasan cakupan 5.3 tetap memerlukan pencatatan sampel LASA.</div>
          {partial && importing && <div className="ciMessage">Progres: {progress}% · {partial.completedBatches} batch selesai · {partial.imported} catatan baru · {partial.skipped} dilewati karena sudah ada.</div>}
          {partial && !importing && !result && partial.completedBatches > 0 && <div className="ciMessage ciWarning">Sebagian proses selesai sebelum kegagalan: {partial.received} baris diproses, {partial.imported} baru tersimpan, {partial.skipped} sudah ada. Unggah ulang aman karena kunci tanggal/alur layanan idempoten; periksa pesan galat sebelum mengulang.</div>}
          {result && <div className="ciMessage ciSuccess" role="status">Impor selesai untuk {result.received} catatan valid. {result.imported} catatan baru tersimpan; {result.skipped} sudah ada dan dilewati. {result.completedBatches} batch selesai; daftar dimuat ulang dari server.</div>}
        </div>
        <div className="aqFoot">
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Periksa kembali data sumber dan setiap tanggal yang dikecualikan sebelum validasi.</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="aqBtn" disabled={parsing || importing} onClick={close}>Tutup</button>
            <button type="button" className="aqBtn primary" disabled={!eligible || !authorized || !rows.length || parsing || importing || !!result || !!errorMessage} onClick={() => void importRows()}>{importing ? 'Mengimpor…' : 'Impor ' + rows.length + ' catatan'}</button>
          </div>
        </div>
      </section>
    </div>
  )
}
