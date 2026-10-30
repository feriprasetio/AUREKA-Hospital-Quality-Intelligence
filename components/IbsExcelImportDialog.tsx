'use client'

import { useCallback, useMemo, useState } from 'react'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import { DEFAULT_IMPORT_BATCH_SIZE, MIN_IMPORT_BATCH_SIZE, isStatementTimeout, nextBatchSizeAfterTimeout } from '@/lib/aureka/import-batching'
import {
  ibsSourceWarnings,
  maskIbsMedicalRecord,
  maskIbsPatientName,
  matchIbsOption,
  normalizeIbsDate,
  type IbsIndicatorOption,
} from '@/lib/aureka/ibs-logbook'
import { aurekaSupabase } from '@/lib/aureka/supabase'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_ROWS = 5000
const BATCH_SIZE = DEFAULT_IMPORT_BATCH_SIZE
const MIN_BATCH_SIZE = MIN_IMPORT_BATCH_SIZE
const INDICATORS = [
  { code: '4.1', header: 'Kekosongan BHP/Linen' },
  { code: '4.2', header: 'Laporan Operasi <24h' },
  { code: '4.3', header: 'Batal Operasi Elektif' },
  { code: '4.4', header: 'Lokasi/Prosedur Tepat' },
  { code: '4.5', header: 'Unplanned ICU Transfer' },
] as const

type IndicatorProfile = Record<string, any> & {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  options_json?: IbsIndicatorOption[]
}
type PreparedRow = {
  sourceRow: number
  sourceNo: number
  patientName: string
  medicalRecordNo: string
  date: string
  diagnosis: string
  procedure: string
  dpjp: string
  answers: Record<string, IbsIndicatorOption>
  rawAnswers: Record<string, string>
  warnings: string[]
}
type ExcludedRow = { sourceRow: number; sourceNo: string; reasons: string[] }
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
  medicalRecordNo: ['No. Rekam Medis', 'No RM', 'No. RM'],
  date: ['Tanggal Masuk'],
  diagnosis: ['Diagnosa Operasi', 'Diagnosis Operasi'],
  procedure: ['Jenis Tindakan', 'Jenis Operasi'],
  dpjp: ['DPJP'],
}
for (const indicator of INDICATORS) REQUIRED_HEADERS[indicator.code] = [indicator.header]

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
  if (value instanceof Date) return value.toISOString()
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
  return Object.values(REQUIRED_HEADERS).some(aliases => {
    const column = findHeader(columns, aliases)
    return column != null && String(readCellValue(row.getCell(column)) ?? '').trim() !== ''
  })
}

function maskChoiceCode(value: string): string {
  const match = value.match(/\(code\s*(\d+)\)\s*$/i)
  return match ? 'Kode ' + match[1] : value ? 'Pilihan terisi' : '—'
}

function parseSourceNo(value: unknown): number | null {
  const source = String(value ?? '').trim()
  if (!/^\d+$/.test(source)) return null
  const parsed = Number(source)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function makePayload(row: PreparedRow, fileName: string, userId: string, profiles: IndicatorProfile[]) {
  const sourceIndicatorValues: Record<string, string> = {}
  const indicatorValues: Record<string, { answer: string; code: number; source_value: string }> = {}
  const responses: Array<Record<string, unknown>> = []

  for (const indicator of INDICATORS) {
    const profile = profiles.find(item =>
      Number(item.room_id) === 4 &&
      Number(item.profile_year) === 2026 &&
      String(item.code) === indicator.code &&
      item.id &&
      item.is_active === true &&
      item.status === 'published'
    )
    const option = row.answers[indicator.code]
    const sourceValue = row.rawAnswers[indicator.code]
    if (!profile?.id || !option?.label || option.code == null) {
      throw new Error('Master indikator ' + indicator.code + ' atau pilihan sumber belum cocok. Muat ulang modul dan periksa master IBS.')
    }

    sourceIndicatorValues[indicator.code] = sourceValue
    indicatorValues[indicator.code] = {
      answer: option.label,
      code: Number(option.code),
      source_value: sourceValue,
    }
    responses.push({
      indicator_id: profile.id,
      response_label: option.label,
      response_code: Number(option.code),
      raw_value: {
        answer: option.label,
        code: Number(option.code),
        source_value: sourceValue,
      },
      other_text: null,
      review_status: 'pending',
    })
  }

  const sourceImport = {
    source_workbook: fileName,
    source_sheet: 'Logbook',
    source_excel_row: row.sourceRow,
    source_excel_no: row.sourceNo,
    source_indicator_values: sourceIndicatorValues,
    source_warnings: row.warnings,
    allow_cross_year: Number(row.date.slice(0, 4)) !== 2026,
    exclude_from_profile_year_metrics: Number(row.date.slice(0, 4)) !== 2026,
  }
  const formFields: Record<string, unknown> = {
    'Nama Pasien': row.patientName,
    'No. Rekam Medis': row.medicalRecordNo,
    'Tanggal Masuk': row.date,
    'Diagnosa Operasi': row.diagnosis,
    'Jenis Tindakan': row.procedure,
    'DPJP': row.dpjp,
    'Catatan Verifikasi Impor': row.warnings.join(' '),
  }
  const core = {
    patient_name: row.patientName,
    medical_record_no: row.medicalRecordNo,
    admission_at: row.date,
    unit_name: 'Instalasi Bedah Sentral',
    room_id: 4,
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
      room_id: 4,
      profile_year: 2026,
      measurement_grain: 'patient_episode',
      record_date: row.date,
      subject_key: 'excel-pmkp-ibs-2026:row:' + row.sourceRow,
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

export default function IbsExcelImportDialog({
  open, roomId, year, authorized, profiles, onClose, onImported,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<PreparedRow[]>([])
  const [excludedRows, setExcludedRows] = useState<ExcludedRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportCounts | null>(null)
  const [partial, setPartial] = useState<ImportCounts | null>(null)
  const [progress, setProgress] = useState(0)
  const [errorMessage, setErrorMessage] = useState('')
  const eligible = useMemo(() => open && authorized && roomId === 4 && year === 2026, [open, authorized, roomId, year])
  const warningRows = useMemo(() => rows.filter(row => row.warnings.length > 0), [rows])
  const historicalRows = useMemo(() => rows.filter(row => row.date.slice(0, 4) !== '2026').length, [rows])

  const reset = useCallback(() => {
    setFile(null)
    setRows([])
    setExcludedRows([])
    setErrors([])
    setParsing(false)
    setImporting(false)
    setResult(null)
    setPartial(null)
    setProgress(0)
    setErrorMessage('')
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
    setErrors([])
    setResult(null)
    setPartial(null)
    setProgress(0)
    setErrorMessage('')

    if (!eligible) {
      setErrorMessage('Pilih unit Instalasi Bedah Sentral dan tahun profil 2026 sebelum mengimpor.')
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
      const worksheet = workbook.getWorksheet('Logbook')
      if (!worksheet) throw new Error('Sheet "Logbook" tidak ditemukan. Periksa apakah workbook yang dipilih benar.')
      if (worksheet.rowCount > 5003) throw new Error('Logbook melewati batas 5003 baris yang diizinkan.')

      const columns = new Map<string, number>()
      const headerRow = worksheet.getRow(2)
      for (let column = 1; column <= Math.min(worksheet.columnCount, 100); column++) {
        const name = cellText(headerRow.getCell(column))
        if (name) columns.set(normalizeExactHeader(name), column)
      }
      const foundColumns: Record<string, number> = {}
      for (const [key, aliases] of Object.entries(REQUIRED_HEADERS)) {
        const index = findHeader(columns, aliases)
        if (index == null) throw new Error('Header wajib "' + aliases[0] + '" tidak ditemukan pada baris 2.')
        foundColumns[key] = index
      }

      const byCode: Record<string, IndicatorProfile> = {}
      for (const indicator of INDICATORS) {
        const matches = profiles.filter(item =>
          Number(item.room_id) === 4 &&
          Number(item.profile_year) === 2026 &&
          String(item.code) === indicator.code &&
          item.is_active === true &&
          item.status === 'published'
        )
        if (matches.length !== 1 || !matches[0].id || !Array.isArray(matches[0].options_json)) {
          throw new Error('Master indikator ' + indicator.code + ' harus tepat satu, aktif, terbit, dan memiliki opsi. Muat ulang setelah master IBS diperiksa.')
        }
        byCode[indicator.code] = matches[0]
      }

      const parsed: PreparedRow[] = []
      const excluded: ExcludedRow[] = []
      const rowErrors: string[] = []
      let sourceRows = 0

      for (let excelRow = 3; excelRow <= Math.min(worksheet.rowCount, 5003); excelRow++) {
        const sourceRow = worksheet.getRow(excelRow)
        if (!rowHasData(sourceRow, columns)) continue
        sourceRows += 1
        if (sourceRows > MAX_ROWS) {
          rowErrors.push('Workbook melebihi batas ' + MAX_ROWS + ' baris data.')
          break
        }

        const sourceNoText = cellText(sourceRow.getCell(foundColumns.sourceNo))
        const sourceNo = parseSourceNo(sourceNoText)
        if (sourceNo == null || sourceNo !== excelRow - 2) {
          rowErrors.push('Nomor pada kolom No. tidak sesuai dengan nomor baris Excel ' + excelRow + '. Periksa urutan sumber sebelum impor.')
          continue
        }

        const patientName = cellText(sourceRow.getCell(foundColumns.patientName))
        const medicalRecordNo = cellText(sourceRow.getCell(foundColumns.medicalRecordNo))
        const rawDateValue = readCellValue(sourceRow.getCell(foundColumns.date))
        const date = normalizeIbsDate(rawDateValue)
        const diagnosis = cellText(sourceRow.getCell(foundColumns.diagnosis))
        const procedure = cellText(sourceRow.getCell(foundColumns.procedure))
        const dpjp = cellText(sourceRow.getCell(foundColumns.dpjp))

        if (!date) {
          const reason = rawDateValue == null || String(rawDateValue).trim() === ''
            ? 'Tanggal Masuk kosong; tanggal tidak ditebak.'
            : 'Tanggal Masuk tidak valid; perbaiki menggunakan sumber resmi.'
          excluded.push({ sourceRow: excelRow, sourceNo: sourceNoText, reasons: [reason] })
          continue
        }

        const answers: Record<string, IbsIndicatorOption> = {}
        const rawAnswers: Record<string, string> = {}
        const choiceErrors: string[] = []
        for (const indicator of INDICATORS) {
          const raw = cellText(sourceRow.getCell(foundColumns[indicator.code]))
          const option = matchIbsOption(raw, byCode[indicator.code].options_json ?? [])
          if (!option || option.code == null || !Number.isInteger(Number(option.code)) || Number(option.code) < 1 || Number(option.code) > 3) {
            choiceErrors.push('Pilihan indikator ' + indicator.code + ' tidak cocok dengan opsi master AUREKA yang aktif.')
            continue
          }
          answers[indicator.code] = option
          rawAnswers[indicator.code] = raw
        }
        if (choiceErrors.length > 0) {
          excluded.push({ sourceRow: excelRow, sourceNo: sourceNoText, reasons: choiceErrors })
          continue
        }

        const warnings = ibsSourceWarnings({
          patientName,
          medicalRecordNo,
          diagnosis,
          procedure,
          dpjp,
          date,
        })
        parsed.push({
          sourceRow: excelRow,
          sourceNo,
          patientName,
          medicalRecordNo,
          date,
          diagnosis,
          procedure,
          dpjp,
          answers,
          rawAnswers,
          warnings,
        })
      }

      if (sourceRows === 0 && rowErrors.length === 0) rowErrors.push('Tidak ada baris logbook yang berisi data mulai dari baris 3.')
      setRows(parsed.sort((a, b) => a.sourceRow - b.sourceRow))
      setExcludedRows(excluded.sort((a, b) => a.sourceRow - b.sourceRow))
      setErrors(rowErrors)
    } catch (error) {
      setRows([])
      setExcludedRows([])
      setErrors([])
      setErrorMessage(error instanceof Error ? error.message : 'Workbook tidak dapat dibaca.')
    } finally {
      setParsing(false)
    }
  }

  const importRows = async () => {
    if (!file || !rows.length || errors.length || !eligible || !authorized || importing || result) return
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
        const { data, error } = await quality().rpc('import_ibs_logbook_batch', { p_rows: batch })

        if (error) {
          if (/function .*import_ibs_logbook_batch.*not found|schema cache/i.test(error.message)) {
            throw new Error('Fungsi impor IBS belum tersedia di Supabase. Pastikan migrasi secure_ibs_logbook_excel_import telah diterapkan.')
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
      await onImported({ imported: counts.imported, skipped: counts.skipped, received: counts.received })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impor IBS gagal. Data tidak dianggap lengkap.')
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <div className="aqBack" role="presentation" onClick={event => { if (event.target === event.currentTarget) close() }}>
      <section className="aqDrawer aqIbsImport" role="dialog" aria-modal="true" aria-labelledby="aqIbsImportTitle">
        <style>{'.aqIbsImport .aqBody{display:grid;align-content:start;gap:12px}.aqIbsImport .ciIntro{font-size:12px;line-height:1.55;color:var(--muted)}.aqIbsImport .ciUpload{display:grid;gap:8px;padding:13px;border:1px dashed var(--line);border-radius:13px;background:rgba(255,255,255,.65)}.aqIbsImport .ciUpload input{width:100%;font-size:12px}.aqIbsImport .ciStats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:7px}.aqIbsImport .ciStat{padding:9px;background:#fff;border:1px solid var(--line);border-radius:11px;min-width:0}.aqIbsImport .ciStat span{display:block;color:var(--muted);font-size:10px}.aqIbsImport .ciStat strong{display:block;margin-top:4px;font-size:18px;overflow-wrap:anywhere}.aqIbsImport .ciMessage{padding:11px 13px;border-radius:11px;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.aqIbsImport .ciError{background:#fff0ef;color:#8b2822}.aqIbsImport .ciSuccess{background:#eaf8ef;color:#206443}.aqIbsImport .ciWarning{background:#fff8e7;color:#7b5d25}.aqIbsImport .ciTable{overflow:auto;max-height:310px;border:1px solid var(--line);border-radius:11px}.aqIbsImport table{width:100%;border-collapse:collapse;font-size:10px}.aqIbsImport th,.aqIbsImport td{padding:7px 8px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}.aqIbsImport th{position:sticky;top:0;background:#f7faf8}.aqIbsImport td.ciWrap{white-space:normal;min-width:200px}.aqIbsImport .ciPrivacy{font-size:10px;color:var(--muted);line-height:1.5}.aqIbsImport .ciCode{font-size:9px;font-weight:800;border:1px solid var(--line);padding:3px 5px;border-radius:6px;display:inline-block}@media(max-width:560px){.aqIbsImport .ciStats{grid-template-columns:repeat(2,minmax(0,1fr))}}'}</style>
        <div className="aqDHead">
          <div>
            <div className="eyebrow">Audit Indikator Mutu · Impor Terarah</div>
            <h4 id="aqIbsImportTitle">Unggah workbook Instalasi Bedah Sentral</h4>
            <p>Unit IBS · profil indikator 2026 · 5 indikator aktif</p>
          </div>
          <button className="aqClose" type="button" disabled={parsing || importing} onClick={close} aria-label="Tutup">×</button>
        </div>
        <div className="aqBody">
          {!authorized && <div className="ciMessage ciError">Impor workbook hanya tersedia untuk akun administrator/PMKP dengan akses unit yang sesuai.</div>}
          {!eligible && <div className="ciMessage ciError">Pilih unit Instalasi Bedah Sentral dan tahun 2026 sebelum membuka alur impor ini.</div>}
          <div className="ciIntro">Sistem membaca sheet <strong>Logbook</strong>, header baris 2 dan data mulai baris 3. Pilihan indikator dicocokkan ke master aktif, termasuk kode sumber. Identitas pasien disamarkan di pratinjau. Data tidak dimasukkan ke repositori GitHub.</div>
          <div className="ciUpload">
            <label className="aqField"><span>Workbook Excel (.xlsx), maksimal 15 MB</span>
              <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!eligible || !authorized || parsing || importing} onChange={event => {
                const selectedFile = event.target.files?.[0]
                if (selectedFile) void parseWorkbook(selectedFile)
                event.currentTarget.value = ''
              }}/>
            </label>
            {file && <div className="ciPrivacy">Berkas dipilih: {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB · data identitas disamarkan di pratinjau.</div>}
            <div className="ciPrivacy">Impor memakai sesi AUREKA terautentikasi dan kunci sumber Excel yang stabil. Semua catatan baru disimpan sebagai Ready for Review, tidak tervalidasi otomatis. Batch awal 20 baris. Jika terjadi timeout, sistem otomatis mengecilkan ukuran transaksi sampai 5 baris dan mengulangi batch yang sama secara aman.</div>
          </div>
          {parsing && <div className="ciMessage">Membaca workbook dan memeriksa baris logbook IBS…</div>}
          {errorMessage && <div className="ciMessage ciError" role="alert">{errorMessage}</div>}
          {(rows.length > 0 || excludedRows.length > 0) && <div className="ciStats">
            <div className="ciStat"><span>Siap diimpor</span><strong>{rows.length}</strong></div>
            <div className="ciStat"><span>Dikecualikan</span><strong>{excludedRows.length}</strong></div>
            <div className="ciStat"><span>Perlu review sumber</span><strong>{warningRows.length}</strong></div>
            <div className="ciStat"><span>Catatan historis (2025)</span><strong>{historicalRows}</strong></div>
            <div className="ciStat"><span>Kesalahan struktur</span><strong>{errors.length}</strong></div>
          </div>}
          {errors.length > 0 && <div className="ciMessage ciError" role="alert">
            <strong>Impor diblokir karena masalah struktur workbook.</strong>{'\n'}{errors.slice(0, 20).map((error, index) => String(index + 1) + '. ' + error).join('\n')}{errors.length > 20 ? '\n… dan ' + (errors.length - 20) + ' kesalahan lainnya.' : ''}
          </div>}
          {excludedRows.length > 0 && <div className="ciMessage ciWarning" role="alert">
            <strong>{excludedRows.length} baris tidak ikut diimpor.</strong> Tanggal masuk atau pilihan indikator tidak valid. Lengkapi tanggal dari sumber resmi atau koreksi label sumber; sistem tidak menebak nilai. {'\n'}
            {excludedRows.slice(0, 50).map(row => 'Baris Excel ' + row.sourceRow + ' (No. ' + (row.sourceNo || '—') + '): ' + row.reasons.join(' ')).join('\n')}
            {excludedRows.length > 50 ? '\n… dan ' + (excludedRows.length - 50) + ' baris lainnya.' : ''}
          </div>}
          {rows.length > 0 && <div className="ciTable">
            <table><thead><tr><th>Baris</th><th>Tanggal masuk</th><th>Nama (masking)</th><th>No. RM (masking)</th>{INDICATORS.map(item => <th key={item.code}>{item.code}</th>)}<th>Catatan QA</th></tr></thead>
              <tbody>{rows.slice(0, 120).map(row => (
                <tr key={row.sourceRow}>
                  <td>{row.sourceRow}</td>
                  <td>{row.date}</td>
                  <td>{maskIbsPatientName(row.patientName)}</td>
                  <td>{maskIbsMedicalRecord(row.medicalRecordNo)}</td>
                  {INDICATORS.map(item => <td key={item.code}><span className="ciCode">{maskChoiceCode(row.rawAnswers[item.code])}</span></td>)}
                  <td className="ciWrap" style={{ color: row.warnings.length ? '#8b5b13' : 'var(--muted)' }}>{row.warnings.length ? row.warnings.join(' ') : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
          {rows.length > 120 && <div className="ciPrivacy">Pratinjau menampilkan 120 dari {rows.length} baris yang siap diimpor.</div>}
          {rows.some(row => row.warnings.length > 0) && <div className="ciMessage ciWarning"><strong>Perhatian data sumber.</strong> No. RM, diagnosa, jenis tindakan, dan DPJP yang kosong dipertahankan sebagai temuan; isilah dari dokumen sah sebelum validasi.</div>}
          {partial && importing && <div className="ciMessage">Progres: {progress}% · {partial.completedBatches} batch selesai · {partial.imported} catatan baru · {partial.skipped} dilewati karena sudah ada.</div>}
          {partial && !importing && !result && partial.completedBatches > 0 && <div className="ciMessage ciWarning">Sebagian proses telah selesai sebelum terjadi kegagalan: {partial.received} baris diproses, {partial.imported} baru tersimpan, {partial.skipped} sudah ada. Unggah ulang aman karena setiap baris menggunakan kunci sumber idempoten; periksa pesan galat sebelum mengulang.</div>}
          {result && <div className="ciMessage ciSuccess" role="status">Impor selesai untuk {result.received} baris yang valid. {result.imported} catatan baru tersimpan; {result.skipped} baris yang sudah ada dilewati. {result.completedBatches} batch selesai; data dimuat ulang dari server.</div>}
          <div className="ciPrivacy">Baris yang berasal dari tahun 2025 tetap disimpan sebagai historis dengan tanggal asli; jangan mengubah tanggal atau memasukkannya ke denominator mutu 2026. Tidak ada catatan yang otomatis tervalidasi.</div>
        </div>
        <div className="aqFoot">
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Data sumber pasien tetap perlu pemeriksaan oleh petugas.</span>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="aqBtn" disabled={parsing || importing} onClick={close}>Tutup</button>
            <button type="button" className="aqBtn primary" disabled={!eligible || !authorized || !rows.length || errors.length > 0 || parsing || importing || !!result} onClick={() => void importRows()}>{importing ? 'Mengimpor…' : 'Impor ' + rows.length + ' catatan'}</button>
          </div>
        </div>
      </section>
    </div>
  )
}
