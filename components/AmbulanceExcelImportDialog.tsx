'use client'

import { useCallback, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { ambulanceSourceWarnings, calculateAmbulanceResponseMinutes, matchAmbulanceOption, normalizeAmbulanceDate, normalizeAmbulanceTime } from '@/lib/aureka/ambulance-logbook'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_ROWS = 500
const SOURCE_KEY_PREFIX = 'excel-pmkp-ambulance-2026:row:'

type IndicatorOption = {
  label: string
  code?: number | null
  numerator?: boolean | null
  denominator?: boolean | null
  review_required?: boolean
}
type IndicatorProfile = Record<string, any> & {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  options_json?: IndicatorOption[]
}
type PreparedRow = {
  sourceRow: number
  sourceNo: number
  patientName: string
  requestDate: string
  requestedTime: string
  deliveredTime: string
  origin: string
  driver: string
  activity: string
  destination: string
  responseMinutes: number | null
  overnightRollover: boolean
  arrivalTimeDayCarry: boolean
  warnings: string[]
  raw: {
    requestedTime: string
    deliveredTime: string
    indicatorValue: string
    formulaValue: unknown
  }
  option: IndicatorOption
}
type ExcludedRow = { sourceRow: number; sourceNo: number; reasons: string[] }
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
  requestDate: ['Tanggal Permintaan'],
  requestedTime: ['Waktu Permintaan'],
  deliveredTime: ['Waktu Diantar'],
  origin: ['Asal Ruangan'],
  driver: ['Nama Supir', 'Nama Sopir'],
  activity: ['Kegiatan Ambulance', 'Kegiatan Ambulans'],
  destination: ['Tujuan Ambulance', 'Tujuan Ambulans'],
  indicator: ['Pelayanan Ambulance', 'Pelayanan Ambulans'],
  formula: ['Kecepatan Respon (Menit)', 'Kecepatan Respons (Menit)'],
}

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
function formulaCellValue(cell: any): unknown {
  const value = cell?.value
  if (value && typeof value === 'object' && 'formula' in value) {
    return value.result == null ? '[rumus tanpa hasil tersimpan]' : value.result
  }
  return readCellValue(cell)
}
function findHeader(columns: Map<string, number>, candidates: string[]): number | null {
  for (const candidate of candidates) {
    const match = columns.get(normalizeExactHeader(candidate))
    if (match != null) return match
  }
  return null
}
function rowHasData(row: any, columns: Map<string, number>): boolean {
  return ['patientName', 'requestDate', 'requestedTime', 'deliveredTime', 'origin', 'driver', 'activity', 'destination', 'indicator']
    .some(key => {
      const column = findHeader(columns, REQUIRED_HEADERS[key])
      return column != null && cellText(row.getCell(column)) !== ''
    })
}
function sourceNumber(row: any, columns: Map<string, number>, excelRow: number): number {
  const column = findHeader(columns, REQUIRED_HEADERS.sourceNo)
  const raw = column == null ? '' : cellText(row.getCell(column))
  const parsed = Number(raw)
  return Number.isFinite(parsed) && parsed > 0 ? Math.trunc(parsed) : excelRow - 2
}
function readOptional(row: any, columns: Map<string, number>, key: string): string {
  const column = findHeader(columns, REQUIRED_HEADERS[key])
  return column == null ? '' : cellText(row.getCell(column))
}
function getFormulaSourceValue(raw: unknown): string | number | null {
  if (raw == null || raw === '') return null
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  return String(raw)
}
function makePayload(row: PreparedRow, fileName: string, userId: string, profiles: IndicatorProfile[]) {
  const profile = profiles.find(item =>
    Number(item.room_id) === 3 &&
    Number(item.profile_year) === 2026 &&
    String(item.code) === '3.1' &&
    item.id &&
    item.is_active === true &&
    item.status === 'published'
  )
  if (!profile?.id) throw new Error('Master indikator 3.1 belum aktif/terbit. Muat ulang modul setelah master Ambulance diterbitkan.')
  if (!row.option.label || row.option.code == null) throw new Error('Opsi indikator Pelayanan Ambulance tidak valid.')

  const sourceImport = {
    source_workbook: fileName,
    source_sheet: 'Logbook',
    source_excel_row: row.sourceRow,
    source_excel_no: row.sourceNo,
    source_indicator_value: row.raw.indicatorValue,
    source_formula_value: getFormulaSourceValue(row.raw.formulaValue),
    raw_requested_time: row.raw.requestedTime,
    raw_arrival_time: row.raw.deliveredTime,
    source_warnings: row.warnings,
    arrival_time_day_carry: row.arrivalTimeDayCarry,
    overnight_rollover: row.overnightRollover,
    allow_cross_year: Number(row.requestDate.slice(0, 4)) !== 2026,
  }
  const formFields: Record<string, unknown> = {
    'Nama Pasien': row.patientName,
    'Tanggal Permintaan': row.requestDate,
    'Waktu Permintaan': row.requestedTime,
    'Waktu Diantar': row.deliveredTime,
    'Asal Ruangan': row.origin,
    'Nama Supir': row.driver,
    'Kegiatan Ambulance': row.activity,
    'Tujuan Ambulance': row.destination,
    '__kecepatan_respon_overnight': row.overnightRollover,
    'Catatan Verifikasi Impor': row.warnings.join(' '),
  }
  const indicatorValue = {
    answer: row.option.label,
    code: Number(row.option.code),
    source_value: row.raw.indicatorValue,
  }
  const core = {
    patient_name: row.patientName,
    medical_record_no: '',
    admission_at: row.requestDate,
    unit_name: 'Ambulance',
    room_id: 3,
    status: 'Ready for Review',
    workflow_status: 'Ready for Review',
    form_fields: formFields,
    calculated_fields: { 'Kecepatan Respon (Menit)': row.responseMinutes },
    indicator_values: { '3.1': indicatorValue },
    measurement_grain: 'event',
    source_import: sourceImport,
  }
  return {
    payload: {
      room_id: 3,
      profile_year: 2026,
      measurement_grain: 'event',
      record_date: row.requestDate,
      subject_key: SOURCE_KEY_PREFIX + row.sourceRow,
      subject_json: { source_import: sourceImport },
      core_data: core,
      status: 'ready',
      review_required: true,
      entered_by: userId,
    },
    responses: [{
      indicator_id: profile.id,
      response_label: row.option.label,
      response_code: Number(row.option.code),
      raw_value: indicatorValue,
      other_text: null,
      review_status: 'pending',
    }],
    attributions: [],
  }
}

export default function AmbulanceExcelImportDialog({
  open, roomId, year, authorized, profiles, onClose, onImported,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<PreparedRow[]>([])
  const [excludedRows, setExcludedRows] = useState<ExcludedRow[]>([])
  const [formulaErrorCount, setFormulaErrorCount] = useState(0)
  const [errors, setErrors] = useState<string[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const eligible = useMemo(() => open && authorized && roomId === 3 && year >= 2026, [open, authorized, roomId, year])

  const reset = useCallback(() => {
    setFile(null)
    setRows([])
    setExcludedRows([])
    setFormulaErrorCount(0)
    setErrors([])
    setParsing(false)
    setImporting(false)
    setResult(null)
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
    setFormulaErrorCount(0)
    setErrors([])
    setResult(null)
    setErrorMessage('')
    if (!eligible) {
      setErrorMessage('Pilih unit Ambulance dan tahun profil 2026 sebelum mengimpor.')
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
      for (const [key, aliases] of Object.entries(REQUIRED_HEADERS)) {
        if (findHeader(columns, aliases) == null) throw new Error('Header wajib "' + aliases[0] + '" tidak ditemukan pada baris 2.')
      }

      const profile = profiles.find(item =>
        Number(item.room_id) === 3 && Number(item.profile_year) === 2026 &&
        String(item.code) === '3.1' && item.id && item.is_active === true && item.status === 'published'
      )
      if (!profile?.id || !Array.isArray(profile.options_json) || !profile.options_json.length) {
        throw new Error('Master indikator 3.1 belum aktif/terbit atau opsi pilihan belum tersedia. Muat ulang modul dan periksa master Ambulance.')
      }

      const parsed: PreparedRow[] = []
      const excluded: ExcludedRow[] = []
      const rowErrors: string[] = []
      let sourceRows = 0
      let formulaErrors = 0
      for (let excelRow = 3; excelRow <= Math.min(worksheet.rowCount, 5003); excelRow++) {
        const sourceRow = worksheet.getRow(excelRow)
        if (!rowHasData(sourceRow, columns)) continue
        sourceRows += 1
        if (sourceRows > MAX_ROWS) {
          rowErrors.push('Workbook melebihi batas ' + MAX_ROWS + ' baris data.')
          break
        }
        const sourceNo = sourceNumber(sourceRow, columns, excelRow)
        const dateColumn = findHeader(columns, REQUIRED_HEADERS.requestDate)
        const requestDate = normalizeAmbulanceDate(readCellValue(sourceRow.getCell(dateColumn!)))
        const patientName = readOptional(sourceRow, columns, 'patientName')
        const requestTimeRawValue = readCellValue(sourceRow.getCell(findHeader(columns, REQUIRED_HEADERS.requestedTime)!))
        const deliveredTimeRawValue = readCellValue(sourceRow.getCell(findHeader(columns, REQUIRED_HEADERS.deliveredTime)!))
        const requestedTimeRaw = cellText(sourceRow.getCell(findHeader(columns, REQUIRED_HEADERS.requestedTime)!))
        const deliveredTimeRaw = cellText(sourceRow.getCell(findHeader(columns, REQUIRED_HEADERS.deliveredTime)!))
        const origin = readOptional(sourceRow, columns, 'origin')
        const driver = readOptional(sourceRow, columns, 'driver')
        const activity = readOptional(sourceRow, columns, 'activity')
        const destination = readOptional(sourceRow, columns, 'destination')
        const rawIndicator = readOptional(sourceRow, columns, 'indicator')
        const formulaColumn = findHeader(columns, REQUIRED_HEADERS.formula)!
        const formulaValue = formulaCellValue(sourceRow.getCell(formulaColumn))
        if (typeof formulaValue === 'string' && /^#(VALUE|NUM|REF|DIV\/0|N\/A|NAME)!?$/i.test(formulaValue.trim())) formulaErrors += 1

        if (!requestDate) {
          const reason = readCellValue(sourceRow.getCell(dateColumn!)) == null || cellText(sourceRow.getCell(dateColumn!)) === ''
            ? 'Tanggal Permintaan kosong; baris tidak diimpor sampai tanggal dikoreksi dari sumber yang sah.'
            : 'Tanggal Permintaan tidak valid; baris tidak diimpor sampai tanggal dikoreksi dari sumber yang sah.'
          excluded.push({ sourceRow: excelRow, sourceNo, reasons: [reason] })
          continue
        }

        const requestedTimeResult = normalizeAmbulanceTime(requestTimeRawValue)
        const deliveredTimeResult = normalizeAmbulanceTime(deliveredTimeRawValue)
        const requestedTime = requestedTimeResult.time ?? ''
        const deliveredTime = deliveredTimeResult.time ?? ''
        const arrivalTimeDayCarry = deliveredTimeResult.excelDayCarry
        const requestedMinutes = requestedTime && /^\d{2}:\d{2}$/.test(requestedTime)
          ? Number(requestedTime.slice(0, 2)) * 60 + Number(requestedTime.slice(3, 5))
          : null
        const deliveredMinutes = deliveredTime && /^\d{2}:\d{2}$/.test(deliveredTime)
          ? Number(deliveredTime.slice(0, 2)) * 60 + Number(deliveredTime.slice(3, 5))
          : null
        const overnightRollover = arrivalTimeDayCarry && requestedMinutes != null && deliveredMinutes != null && deliveredMinutes < requestedMinutes
        const responseMinutes = calculateAmbulanceResponseMinutes(requestedTime, deliveredTime, overnightRollover)
        const option = matchAmbulanceOption(rawIndicator, profile.options_json)
        if (!option || option.code == null || !Number.isInteger(Number(option.code)) || Number(option.code) < 1 || Number(option.code) > 3) {
          excluded.push({ sourceRow: excelRow, sourceNo, reasons: ['Pilihan Pelayanan Ambulance tidak cocok dengan opsi master AUREKA yang aktif; baris tidak diimpor sampai klasifikasi dikoreksi.'] })
          continue
        }
        const timeWarnings = [...requestedTimeResult.warnings, ...deliveredTimeResult.warnings]
        if (formulaValue != null && /^\[rumus tanpa hasil tersimpan\]$/i.test(String(formulaValue))) {
          timeWarnings.push('Sel rumus Kecepatan Respon tidak memiliki hasil tersimpan; nilai dihitung ulang dari jam sumber.')
        }
        const warnings = ambulanceSourceWarnings({
          patientName,
          requestDate,
          requestedTime,
          deliveredTime,
          origin,
          driver,
          activity,
          destination,
          indicatorValue: rawIndicator,
          formulaValue,
          timeWarnings,
          overnightRollover,
          responseMinutes,
        })
        parsed.push({
          sourceRow: excelRow,
          sourceNo,
          patientName,
          requestDate,
          requestedTime,
          deliveredTime,
          origin,
          driver,
          activity,
          destination,
          responseMinutes,
          overnightRollover,
          arrivalTimeDayCarry,
          warnings,
          raw: {
            requestedTime: requestedTimeRaw,
            deliveredTime: deliveredTimeRaw,
            indicatorValue: rawIndicator,
            formulaValue,
          },
          option,
        })
      }
      if (sourceRows === 0 && rowErrors.length === 0) rowErrors.push('Tidak ada baris operasional yang ditemukan mulai dari baris 3.')
      setRows(parsed.sort((a, b) => a.sourceRow - b.sourceRow))
      setExcludedRows(excluded.sort((a, b) => a.sourceRow - b.sourceRow))
      setFormulaErrorCount(formulaErrors)
      setErrors(rowErrors)
    } catch (error) {
      setRows([])
      setExcludedRows([])
      setFormulaErrorCount(0)
      setErrors([])
      setErrorMessage(error instanceof Error ? error.message : 'Workbook tidak dapat dibaca.')
    } finally {
      setParsing(false)
    }
  }

  const importRows = async () => {
    if (!file || !rows.length || errors.length || !eligible || !authorized) return
    setImporting(true)
    setErrorMessage('')
    setResult(null)
    try {
      const { data: authData, error: authError } = await sb.auth.getUser()
      if (authError) throw authError
      if (!authData.user) throw new Error('Sesi login tidak ditemukan. Masuk ke AUREKA lalu ulangi impor.')
      const items = rows.map(row => makePayload(row, file.name, authData.user!.id, profiles))
      const { data, error } = await q().rpc('import_ambulance_logbook_batch', { p_rows: items })
      if (error) {
        if (/function .*import_ambulance_logbook_batch.*not found|schema cache/i.test(error.message)) {
          throw new Error('Fungsi impor Ambulance belum tersedia di Supabase. Migrasi secure_ambulance_logbook_excel_import perlu diterapkan.')
        }
        throw new Error(error.message)
      }
      const summary = (data ?? {}) as ImportResponse
      const received = Number(summary.received_count ?? rows.length)
      const imported = Number(summary.imported_count ?? 0)
      const skipped = Number(summary.skipped_existing_count ?? 0)
      if (received !== rows.length || imported + skipped !== received) {
        throw new Error('Ringkasan hasil dari server tidak konsisten. Jangan ulangi impor sebelum memeriksa log server.')
      }
      setResult(summary)
      await onImported({ imported, skipped, received })
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Impor gagal. Data sumber tidak dianggap berhasil disimpan.')
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null
  const warningRows = rows.filter(row => row.warnings.length > 0)
  return (
    <div className="aqBack" role="presentation" onClick={event => { if (event.target === event.currentTarget) close() }}>
      <section className="aqDrawer aqAmbulanceImport" role="dialog" aria-modal="true" aria-labelledby="aqAmbulanceImportTitle">
        <style>{'.aqAmbulanceImport .aqBody{display:grid;align-content:start;gap:14px}.aqAmbulanceImport .ciIntro{font-size:12px;line-height:1.55;color:var(--muted)}.aqAmbulanceImport .ciUpload{display:grid;gap:8px;padding:16px;border:1px dashed var(--line);border-radius:16px;background:rgba(255,255,255,.65)}.aqAmbulanceImport .ciUpload input{width:100%;font-size:12px}.aqAmbulanceImport .ciStats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.aqAmbulanceImport .ciStat{padding:11px;background:#fff;border:1px solid var(--line);border-radius:12px;min-width:0}.aqAmbulanceImport .ciStat span{display:block;color:var(--muted);font-size:10px}.aqAmbulanceImport .ciStat strong{display:block;margin-top:4px;font-size:20px;overflow-wrap:anywhere}.aqAmbulanceImport .ciMessage{padding:12px 14px;border-radius:12px;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.aqAmbulanceImport .ciError{background:#fff0ef;color:#8b2822}.aqAmbulanceImport .ciSuccess{background:#eaf8ef;color:#206443}.aqAmbulanceImport .ciWarning{background:#fff8e7;color:#7b5d25}.aqAmbulanceImport .ciTable{overflow:auto;max-height:300px;border:1px solid var(--line);border-radius:12px}.aqAmbulanceImport table{width:100%;border-collapse:collapse;font-size:11px}.aqAmbulanceImport th,.aqAmbulanceImport td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}.aqAmbulanceImport th{position:sticky;top:0;background:#f7faf8}.aqAmbulanceImport td.ciWrap{white-space:normal;min-width:240px}.aqAmbulanceImport .ciPrivacy{font-size:10px;color:var(--muted);line-height:1.5}@media(max-width:560px){.aqAmbulanceImport .ciStats{grid-template-columns:repeat(2,minmax(0,1fr))}}'}</style>
        <div className="aqDHead">
          <div>
            <div className="eyebrow">Audit Indikator Mutu · Impor Terarah</div>
            <h4 id="aqAmbulanceImportTitle">Unggah workbook Ambulance</h4>
            <p>Unit Ambulance · profil indikator 2026</p>
          </div>
          <button className="aqClose" type="button" disabled={parsing || importing} onClick={close} aria-label="Tutup">×</button>
        </div>
        <div className="aqBody">
          {!authorized && <div className="ciMessage ciError">Impor workbook hanya tersedia untuk akun administrator/PMKP dengan akses unit yang sesuai.</div>}
          {!eligible && <div className="ciMessage ciError">Pilih unit Ambulance dan tahun 2026 sebelum membuka alur impor ini.</div>}
          <div className="ciIntro">Sistem membaca sheet <strong>Logbook</strong>, header baris 2 dan data mulai baris 3. Hasil rumus Excel tidak dipakai untuk menghitung waktu respons; perhitungan dilakukan ulang dari jam sumber. Baris tanpa tanggal yang valid dikecualikan tanpa menebak tanggal.</div>
          <div className="ciUpload">
            <label className="aqField"><span>Workbook Excel (.xlsx), maksimal 15 MB</span>
              <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!eligible || !authorized || parsing || importing} onChange={event => {
                const selectedFile = event.target.files?.[0]
                if (selectedFile) void parseWorkbook(selectedFile)
                event.currentTarget.value = ''
              }}/>
            </label>
            {file && <div className="ciPrivacy">Berkas dipilih: {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB · identitas pasien disamarkan pada pratinjau.</div>}
            <div className="ciPrivacy">Berkas diproses di browser dan tidak dimasukkan ke repositori. Impor hanya dilakukan melalui sesi AUREKA yang terautentikasi; catatan akan berstatus Ready for Review.</div>
          </div>
          {parsing && <div className="ciMessage">Membaca workbook dan memeriksa baris logbook Ambulance…</div>}
          {errorMessage && <div className="ciMessage ciError" role="alert">{errorMessage}</div>}
          {(rows.length > 0 || excludedRows.length > 0) && <div className="ciStats">
            <div className="ciStat"><span>Baris valid bertanggal</span><strong>{rows.length}</strong></div>
            <div className="ciStat"><span>Dikecualikan</span><strong>{excludedRows.length}</strong></div>
            <div className="ciStat"><span>Perlu verifikasi</span><strong>{warningRows.length}</strong></div>
            <div className="ciStat"><span>Rumus error (semua baris)</span><strong>{formulaErrorCount}</strong></div>
            <div className="ciStat"><span>Kesalahan struktur</span><strong>{errors.length}</strong></div>
          </div>}
          {errors.length > 0 && <div className="ciMessage ciError" role="alert">
            <strong>Impor diblokir karena masalah struktur workbook.</strong>{'\n'}{errors.slice(0, 20).map((error, index) => String(index + 1) + '. ' + error).join('\n')}{errors.length > 20 ? '\n… dan ' + (errors.length - 20) + ' kesalahan lainnya.' : ''}
          </div>}
          {excludedRows.length > 0 && <div className="ciMessage ciWarning" role="alert">
            <strong>{excludedRows.length} baris tidak ikut diimpor.</strong> Tanggal permintaan tidak valid/kosong atau pilihan indikator tidak cocok. Lengkapi tanggal dari sumber resmi, bukan dengan perkiraan, lalu unggah ulang.{'\n'}
            {excludedRows.slice(0, 35).map(row => 'Baris Excel ' + row.sourceRow + ' (No. ' + row.sourceNo + '): ' + row.reasons.join(' ')).join('\n')}
            {excludedRows.length > 35 ? '\n… dan ' + (excludedRows.length - 35) + ' baris lainnya.' : ''}
          </div>}
          {rows.length > 0 && <div className="ciTable">
            <table><thead><tr><th>Baris</th><th>Tanggal</th><th>Nama (disamarkan)</th><th>Jam minta</th><th>Jam diantar</th><th>Menit respons</th><th>Catatan QA</th></tr></thead>
              <tbody>{rows.slice(0, 120).map(row => (
                <tr key={row.sourceRow}>
                  <td>{row.sourceRow}</td>
                  <td>{row.requestDate}</td>
                  <td>{row.patientName.length > 2 ? row.patientName.slice(0, 1) + '•••' + row.patientName.slice(-1) : row.patientName ? '•••' : '—'}</td>
                  <td>{row.requestedTime || '—'}</td>
                  <td>{row.deliveredTime || '—'}</td>
                  <td>{row.responseMinutes == null ? '—' : row.responseMinutes.toLocaleString('id-ID', { maximumFractionDigits: 2 })}</td>
                  <td className="ciWrap" style={{color:row.warnings.length?'#8b5b13':'var(--muted)'}}>{row.warnings.length ? row.warnings.join(' ') : '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>}
          {rows.length > 120 && <div className="ciPrivacy">Pratinjau menampilkan 120 dari {rows.length} baris bertanggal yang akan diimpor.</div>}
          {rows.some(row => row.warnings.length > 0) && <div className="ciMessage ciWarning"><strong>Perhatian data sumber.</strong> Temuan tidak ditutupi atau diubah diam-diam. Catatan yang dapat diimpor akan disimpan sebagai Ready for Review; lakukan pemeriksaan sebelum validasi.</div>}
          <div className="ciPrivacy">Setiap baris menggunakan kunci sumber stabil berdasarkan nomor baris Excel. Mengunggah ulang tidak menggandakan data yang telah tercatat. Baris tanpa tanggal atau tanpa klasifikasi indikator perlu perbaikan manual pada workbook.</div>
          {result && <div className="ciMessage ciSuccess" role="status">Impor selesai. {result.imported_count ?? 0} catatan baru tersimpan; {result.skipped_existing_count ?? 0} baris yang sudah ada dilewati. Data dimuat ulang dari server.</div>}
        </div>
        <div className="aqFoot">
          <span style={{fontSize:11,color:'var(--muted)'}}>Tidak ada data yang dianggap tervalidasi otomatis.</span>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button type="button" className="aqBtn" disabled={parsing || importing} onClick={close}>Tutup</button>
            <button type="button" className="aqBtn primary" disabled={!eligible || !authorized || !rows.length || errors.length > 0 || parsing || importing || !!result} onClick={() => void importRows()}>{importing ? 'Mengimpor…' : 'Impor ' + rows.length + ' catatan bertanggal'}</button>
          </div>
        </div>
      </section>
    </div>
  )
}
