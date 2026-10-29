'use client'

import { useCallback, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { calculateInclusiveDurationDays, complaintSourceWarnings, matchLogbookOption } from '@/lib/aureka/complaint-logbook'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_ROWS = 500
const SOURCE_KEY_PREFIX = 'excel-pmkp-informasi-pengaduan-2026:row:'

type IndicatorProfile = Record<string, any> & {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  options_json?: Array<{ label: string; code?: number | null; numerator?: boolean | null; denominator?: boolean | null; review_required?: boolean }>
}
type PreparedRow = {
  sourceRow: number
  sourceNo: number
  patientName: string
  medicalRecordNo: string
  complaintAt: string
  durationDays: number
  warnings: string[]
  formFields: Record<string, string>
  response11: { answer: string; code: number; sourceValue: string; reviewRequired: boolean }
  response12: { answer: string; code: number; sourceValue: string; reviewRequired: boolean }
  allowCrossYear: boolean
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
type ImportResponse = { received_count?: number; imported_count?: number; skipped_existing_count?: number }

const REQUIRED_HEADERS: Record<string, string[]> = {
  patientName: ['Nama Pasien'],
  medicalRecordNo: ['No RM', 'No. Rekam Medis', 'No Rekam Medis'],
  serviceUnit: ['Unit Pelayanan'],
  level: ['Level Masalah'],
  complaintAt: ['Tanggal Aduan'],
  followupAt: ['Tanggal Tindak Lanjut'],
  source: ['Sumber Aduan'],
  status: ['Status Aduan'],
  narrative: ['Kronologis Ringkas'],
  actionPlan: ['Rencana Tindak Lanjut'],
  resolution: ['Penyelesaian Aduan di Meja Informasi'],
  response11: ['Respon Komplain'],
  response12: ['Mengerti Informasi'],
}
const LEVELS = ['Ringan', 'Sedang', 'Berat']
const SOURCES = ['Website Rumah Sakit', 'Sumber Lainnya', 'Aduan Langsung Tatap Muka']
const SERVICE_UNITS = [
  'Farmasi', 'farmasi', 'Pelayanan', 'Radiologi', 'IT', 'Sarana dan prasarana',
  'Parkiran', 'Poli anak', 'Pendaftaran / RM Loket 2 (di gedung belakang)',
  'Pendaftaran IGD', 'Rajal', 'Ranap R.Mawar 2-Bedah',
]
const STATUSES = [
  'Aduan Selesai Dengan Klarifikasi Dari Manajemen',
  'Aduan Selesai Dengan Proses Pengadaan',
  'Aduan Selesai Dengan Penegakan Aturan',
  'Pengaduan selesai dengan ditindaklanjuti manajemen  melalui aplikasi simponi',
  'Pengaduan selesai dengan ditindaklanjuti manajemen ',
  'Pengaduan selesai dengan ditindaklanjuti manajemen  melalui tatapmuka dengan keluarga pasien',
  'Sudah ditindak lanjut ke bidang terkait , pasien di edukasi mengenai penggunaan aplikasi simponi.',
]

function cellValue(cell: any): unknown {
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
  const value = cellValue(cell)
  if (value == null) return ''
  if (value instanceof Date) return value.toISOString()
  return String(value)
}
function excelSerialDateTime(serial: number): string | null {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null
  const date = new Date(Date.UTC(1899, 11, 30) + serial * 86400000)
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 16)
}
function normalizeDateTime(cell: any): string | null {
  const value = cellValue(cell)
  if (value == null || String(value).trim() === '') return null
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null
    return value.toISOString().slice(0, 16)
  }
  if (typeof value === 'number') return excelSerialDateTime(value)
  const raw = String(value).trim()
  if (/^\d+(?:[.,]\d+)?$/.test(raw)) return excelSerialDateTime(Number(raw.replace(',', '.')))
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/)
  let datePart = ''
  let hour = 0
  let minute = 0
  let second = 0
  if (iso) {
    datePart = iso[1]
    hour = Number(iso[2] ?? 0)
    minute = Number(iso[3] ?? 0)
    second = Number(iso[4] ?? 0)
  } else if (dmy) {
    datePart = String(Number(dmy[3])) + '-' + String(Number(dmy[2])).padStart(2, '0') + '-' + String(Number(dmy[1])).padStart(2, '0')
    hour = Number(dmy[4] ?? 0)
    minute = Number(dmy[5] ?? 0)
    second = Number(dmy[6] ?? 0)
  } else return null
  const dateCheck = new Date(datePart + 'T00:00:00Z')
  if (Number.isNaN(dateCheck.getTime()) || dateCheck.toISOString().slice(0, 10) !== datePart) return null
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || second < 0 || second > 59) return null
  return datePart + 'T' + String(hour).padStart(2, '0') + ':' + String(minute).padStart(2, '0')
}
function normalizeRm(cell: any): string {
  const value = cellValue(cell)
  if (value == null) return ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    const displayed = String(cell?.text ?? '').trim()
    if (displayed && !/[Ee][+-]?\d+/.test(displayed)) return displayed
    return String(Math.trunc(value))
  }
  return String(value).trim()
}
function findHeader(columns: Map<string, number>, candidates: string[]): number | null {
  for (const candidate of candidates) {
    const match = columns.get(normalizeExactHeader(candidate))
    if (match != null) return match
  }
  return null
}
function requiredText(row: any, columns: Map<string, number>, key: string, excelRow: number): string {
  const column = findHeader(columns, REQUIRED_HEADERS[key])
  if (column == null) throw new Error('Header "' + REQUIRED_HEADERS[key][0] + '" tidak ditemukan di baris 2.')
  const value = key === 'medicalRecordNo' ? normalizeRm(row.getCell(column)) : cellText(row.getCell(column))
  if (!value.trim()) throw new Error('Baris Excel ' + excelRow + ': kolom "' + REQUIRED_HEADERS[key][0] + '" kosong.')
  return value
}
function findIndicatorOption(raw: string, profile: IndicatorProfile | undefined, header: string, excelRow: number) {
  if (!profile?.id || !Array.isArray(profile.options_json) || !profile.options_json.length) {
    throw new Error('Master indikator untuk "' + header + '" belum aktif/tersedia pada tahun 2026.')
  }
  const matched = matchLogbookOption(raw, profile.options_json)
  if (!matched || matched.code == null) {
    throw new Error('Baris Excel ' + excelRow + ': nilai "' + header + '" tidak cocok dengan satu pilihan master AUREKA.')
  }
  return { answer: String(matched.label), code: Number(matched.code), sourceValue: raw, reviewRequired: matched.review_required === true }
}
function makePayload(row: PreparedRow, fileName: string, userId: string, profiles: IndicatorProfile[]) {
  const p11 = profiles.find(profile => String(profile.code) === '1.1' && Number(profile.room_id) === 1 && Number(profile.profile_year) === 2026)
  const p12 = profiles.find(profile => String(profile.code) === '1.2' && Number(profile.room_id) === 1 && Number(profile.profile_year) === 2026)
  if (!p11?.id || !p12?.id) throw new Error('Master indikator 1.1 dan 1.2 harus terbit sebelum workbook dapat diimpor.')
  if (row.response11.answer !== 'Respon Tepat Waktu (Sesuai Grading Merah/Kuning/Hijau)' || row.response11.code !== 1) {
    throw new Error('Respons 1.1 pada workbook ini berbeda dari pilihan yang telah diverifikasi; impor diblokir.')
  }
  if (row.response12.answer !== 'Pasien Mengerti (Verifikasi pemahaman/Teach-back berhasil)' || row.response12.code !== 1) {
    throw new Error('Respons 1.2 pada workbook ini berbeda dari pilihan yang telah diverifikasi; impor diblokir.')
  }
  const recordDate = row.formFields['Tanggal Aduan'].slice(0, 10)
  const subjectKey = SOURCE_KEY_PREFIX + row.sourceRow
  const indicatorValues = {
    '1.1': { answer: row.response11.answer, code: row.response11.code, source_value: row.response11.sourceValue },
    '1.2': { answer: row.response12.answer, code: row.response12.code, source_value: row.response12.sourceValue },
  }
  const core = {
    patient_name: row.patientName,
    medical_record_no: row.medicalRecordNo,
    admission_at: row.formFields['Tanggal Aduan'],
    unit_name: 'Informasi dan Pengaduan',
    room_id: 1,
    status: 'Ready for Review',
    workflow_status: 'Ready for Review',
    form_fields: row.formFields,
    calculated_fields: { 'Lamanya Tindak Lanjut': row.durationDays },
    indicator_values: indicatorValues,
    measurement_grain: 'event',
    source_import: {
      source_workbook: fileName,
      source_sheet: 'Logbook',
      source_excel_row: row.sourceRow,
      source_excel_no: row.sourceNo,
      allow_cross_year: row.allowCrossYear,
    },
  }
  const responses = [
    {
      indicator_id: p11.id,
      response_label: row.response11.answer,
      response_code: row.response11.code,
      raw_value: indicatorValues['1.1'],
      other_text: null,
      review_status: row.response11.reviewRequired ? 'pending' : 'not_required',
    },
    {
      indicator_id: p12.id,
      response_label: row.response12.answer,
      response_code: row.response12.code,
      raw_value: indicatorValues['1.2'],
      other_text: null,
      review_status: row.response12.reviewRequired ? 'pending' : 'not_required',
    },
  ]
  return {
    payload: {
      room_id: 1,
      profile_year: 2026,
      measurement_grain: 'event',
      record_date: recordDate,
      subject_key: subjectKey,
      subject_json: { source_import: core.source_import },
      core_data: core,
      status: 'ready',
      review_required: true,
      entered_by: userId,
    },
    responses,
    attributions: [],
  }
}

export default function ComplaintExcelImportDialog({
  open, roomId, year, authorized, profiles, onClose, onImported,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<PreparedRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const eligible = useMemo(() => open && authorized && roomId === 1 && year === 2026, [open, authorized, roomId, year])

  const reset = useCallback(() => {
    setFile(null)
    setRows([])
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
    setErrors([])
    setResult(null)
    setErrorMessage('')
    if (!eligible) {
      setErrorMessage('Pilih unit Informasi dan Pengaduan serta tahun profil 2026 sebelum mengimpor.')
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
      if (!worksheet) throw new Error('Sheet "Logbook" tidak ditemukan. Periksa apakah file yang dipilih benar.')
      if (worksheet.rowCount > 5003) throw new Error('Jumlah baris Logbook melewati batas yang diizinkan (5003).')
      const columns = new Map<string, number>()
      const headerRow = worksheet.getRow(2)
      for (let column = 1; column <= Math.min(worksheet.columnCount, 100); column++) {
        const name = cellText(headerRow.getCell(column)).trim()
        if (name) columns.set(normalizeExactHeader(name), column)
      }
      for (const [key, aliases] of Object.entries(REQUIRED_HEADERS)) {
        if (findHeader(columns, aliases) == null) throw new Error('Header wajib "' + aliases[0] + '" tidak ditemukan pada baris 2.')
      }
      const p11 = profiles.find(profile => Number(profile.room_id) === 1 && Number(profile.profile_year) === 2026 && String(profile.code) === '1.1')
      const p12 = profiles.find(profile => Number(profile.room_id) === 1 && Number(profile.profile_year) === 2026 && String(profile.code) === '1.2')
      if (!p11?.id || !p12?.id) throw new Error('Master indikator 1.1 dan 1.2 belum tersedia. Muat ulang modul setelah master diterbitkan.')
      const parsed: PreparedRow[] = []
      const rowErrors: string[] = []
      const seenRows = new Set<number>()
      for (let excelRow = 3; excelRow <= Math.min(worksheet.rowCount, 5003); excelRow++) {
        const sourceRow = worksheet.getRow(excelRow)
        const rowHasData = Object.values(REQUIRED_HEADERS).some(aliases => {
          const column = findHeader(columns, aliases)
          return column != null && cellText(sourceRow.getCell(column)).trim() !== ''
        })
        if (!rowHasData) continue
        if (parsed.length >= MAX_ROWS) {
          rowErrors.push('Workbook melebihi batas ' + MAX_ROWS + ' baris data.')
          break
        }
        if (seenRows.has(excelRow)) {
          rowErrors.push('Baris Excel ' + excelRow + ' terdeteksi ganda.')
          continue
        }
        seenRows.add(excelRow)
        try {
          const patientName = requiredText(sourceRow, columns, 'patientName', excelRow)
          const medicalRecordNo = requiredText(sourceRow, columns, 'medicalRecordNo', excelRow)
          const serviceUnit = requiredText(sourceRow, columns, 'serviceUnit', excelRow)
          const level = requiredText(sourceRow, columns, 'level', excelRow)
          const complaintColumn = findHeader(columns, REQUIRED_HEADERS.complaintAt)!
          const followupColumn = findHeader(columns, REQUIRED_HEADERS.followupAt)!
          const complaintAt = normalizeDateTime(sourceRow.getCell(complaintColumn))
          const followupAt = normalizeDateTime(sourceRow.getCell(followupColumn))
          if (!complaintAt) throw new Error('Baris Excel ' + excelRow + ': tanggal aduan tidak valid.')
          if (!followupAt) throw new Error('Baris Excel ' + excelRow + ': tanggal tindak lanjut tidak valid.')
          const durationDays = calculateInclusiveDurationDays(complaintAt, followupAt)
          if (durationDays == null || !Number.isFinite(durationDays)) throw new Error('Baris Excel ' + excelRow + ': durasi tindak lanjut tidak dapat dihitung.')
          const warnings = complaintSourceWarnings(medicalRecordNo, complaintAt, followupAt)
          const source = requiredText(sourceRow, columns, 'source', excelRow)
          const status = requiredText(sourceRow, columns, 'status', excelRow)
          const narrative = requiredText(sourceRow, columns, 'narrative', excelRow)
          const actionPlan = requiredText(sourceRow, columns, 'actionPlan', excelRow)
          const resolution = requiredText(sourceRow, columns, 'resolution', excelRow)
          const response11Raw = requiredText(sourceRow, columns, 'response11', excelRow)
          const response12Raw = requiredText(sourceRow, columns, 'response12', excelRow)
          if (!LEVELS.includes(level)) throw new Error('Baris Excel ' + excelRow + ': Level Masalah "' + level + '" bukan pilihan yang valid.')
          if (!SERVICE_UNITS.includes(serviceUnit)) throw new Error('Baris Excel ' + excelRow + ': Unit Pelayanan "' + serviceUnit + '" tidak dikenal.')
          if (!SOURCES.includes(source)) throw new Error('Baris Excel ' + excelRow + ': Sumber Aduan "' + source + '" bukan pilihan yang valid.')
          if (!STATUSES.includes(status)) throw new Error('Baris Excel ' + excelRow + ': Status Aduan tidak cocok dengan daftar pilihan sumber.')
          const response11 = findIndicatorOption(response11Raw, p11, 'Respon Komplain', excelRow)
          const response12 = findIndicatorOption(response12Raw, p12, 'Mengerti Informasi', excelRow)
          if (response11.answer !== 'Respon Tepat Waktu (Sesuai Grading Merah/Kuning/Hijau)' || response11.code !== 1) {
            throw new Error('Baris Excel ' + excelRow + ': nilai Respon Komplain tidak sama dengan opsi tervalidasi pada workbook uji.')
          }
          if (response12.answer !== 'Pasien Mengerti (Verifikasi pemahaman/Teach-back berhasil)' || response12.code !== 1) {
            throw new Error('Baris Excel ' + excelRow + ': nilai Mengerti Informasi tidak sama dengan opsi tervalidasi pada workbook uji.')
          }
          const sourceNo = excelRow - 2
          const formFields: Record<string, string> = {
            'Nama Pasien': patientName,
            'No. Rekam Medis': medicalRecordNo,
            'Unit Pelayanan': serviceUnit,
            'Level Masalah': level,
            'Tanggal Aduan': complaintAt,
            'Tanggal Tindak Lanjut': followupAt,
            'Sumber Aduan': source,
            'Status Aduan': status,
            'Kronologis Ringkas': narrative,
            'Rencana Tindak Lanjut': actionPlan,
            'Penyelesaian Aduan di Meja Informasi': resolution,
          }
          parsed.push({
            sourceRow: excelRow,
            sourceNo,
            patientName,
            medicalRecordNo,
            complaintAt,
            durationDays,
            warnings,
            formFields,
            response11,
            response12,
            allowCrossYear: new Date(complaintAt.slice(0, 10) + 'T00:00:00Z').getUTCFullYear() !== 2026,
          })
        } catch (error) {
          rowErrors.push(error instanceof Error ? error.message : 'Baris Excel ' + excelRow + ': data tidak dapat dibaca.')
        }
      }
      if (parsed.length === 0 && rowErrors.length === 0) rowErrors.push('Tidak ada baris data yang ditemukan mulai dari baris 3.')
      setRows(parsed.sort((a, b) => a.sourceRow - b.sourceRow))
      setErrors(rowErrors)
    } catch (error) {
      setRows([])
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
      const { data, error } = await q().rpc('import_quality_logbook_batch', { p_rows: items })
      if (error) {
        if (/function .*import_quality_logbook_batch.*not found|schema cache/i.test(error.message)) {
          throw new Error('Fungsi impor belum tersedia di Supabase. Migrasi secure_complaint_logbook_excel_import harus diterapkan setelah review.')
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
  return (
    <div className="aqBack" role="presentation" onClick={event => { if (event.target === event.currentTarget) close() }}>
      <section className="aqDrawer aqComplaintImport" role="dialog" aria-modal="true" aria-labelledby="aqComplaintImportTitle">
        <style>{'.aqComplaintImport .aqBody{display:grid;align-content:start;gap:14px}.aqComplaintImport .ciIntro{font-size:12px;line-height:1.55;color:var(--muted)}.aqComplaintImport .ciUpload{display:grid;gap:8px;padding:16px;border:1px dashed var(--line);border-radius:16px;background:rgba(255,255,255,.65)}.aqComplaintImport .ciUpload input{width:100%;font-size:12px}.aqComplaintImport .ciStats{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px}.aqComplaintImport .ciStat{padding:11px;background:#fff;border:1px solid var(--line);border-radius:12px;min-width:0}.aqComplaintImport .ciStat span{display:block;color:var(--muted);font-size:10px}.aqComplaintImport .ciStat strong{display:block;margin-top:4px;font-size:20px;overflow-wrap:anywhere}.aqComplaintImport .ciMessage{padding:12px 14px;border-radius:12px;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.aqComplaintImport .ciError{background:#fff0ef;color:#8b2822}.aqComplaintImport .ciSuccess{background:#eaf8ef;color:#206443}.aqComplaintImport .ciTable{overflow:auto;max-height:300px;border:1px solid var(--line);border-radius:12px}.aqComplaintImport table{width:100%;border-collapse:collapse;font-size:11px}.aqComplaintImport th,.aqComplaintImport td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}.aqComplaintImport th{position:sticky;top:0;background:#f7faf8}.aqComplaintImport .ciPrivacy{font-size:10px;color:var(--muted);line-height:1.5}@media(max-width:560px){.aqComplaintImport .ciStats{grid-template-columns:repeat(2,minmax(0,1fr))}}'}</style>
        <div className="aqDHead">
          <div>
            <div className="eyebrow">Audit Indikator Mutu · Impor Terarah</div>
            <h4 id="aqComplaintImportTitle">Unggah workbook Informasi dan Pengaduan</h4>
            <p>Unit Informasi dan Pengaduan · profil indikator 2026</p>
          </div>
          <button className="aqClose" type="button" disabled={parsing || importing} onClick={close} aria-label="Tutup">×</button>
        </div>
        <div className="aqBody">
          {!authorized && <div className="ciMessage ciError">Impor workbook hanya tersedia untuk akun administrator/PMKP dengan akses unit yang sesuai.</div>}
          {!eligible && <div className="ciMessage ciError">Pilih unit Informasi dan Pengaduan serta tahun 2026 sebelum membuka jalur impor ini.</div>}
          <div className="ciIntro">Sistem membaca sheet <strong>Logbook</strong> dengan header di baris 2 dan data mulai baris 3. Baris ditinjau sebelum disimpan ke Supabase melalui sesi login AUREKA; workbook tidak dikirim ke penyimpanan browser atau repositori.</div>
          <div className="ciUpload">
            <label className="aqField"><span>Workbook Excel (.xlsx), maksimal 15 MB</span>
              <input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!eligible || !authorized || parsing || importing} onChange={event => {
                const selectedFile = event.target.files?.[0]
                if (selectedFile) void parseWorkbook(selectedFile)
                event.currentTarget.value = ''
              }}/>
            </label>
            {file && <div className="ciPrivacy">Berkas dipilih: {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB · nama pasien dan nomor rekam medis disamarkan pada pratinjau.</div>}
            <div className="ciPrivacy">Berkas hanya diproses di browser. Validasi membatasi sheet, header, tanggal, level masalah, sumber aduan, status, dan pilihan indikator sebelum panggilan impor autentikasi.</div>
          </div>
          {parsing && <div className="ciMessage">Membaca workbook dan memvalidasi baris logbook…</div>}
          {errorMessage && <div className="ciMessage ciError" role="alert">{errorMessage}</div>}
          {rows.length > 0 && <div className="ciStats">
            <div className="ciStat"><span>Baris valid</span><strong>{rows.length}</strong></div>
            <div className="ciStat"><span>Periode 2026</span><strong>{rows.filter(row => !row.allowCrossYear).length}</strong></div>
            <div className="ciStat"><span>Lintas tahun</span><strong>{rows.filter(row => row.allowCrossYear).length}</strong></div>
            <div className="ciStat"><span>Peringatan sumber</span><strong>{rows.filter(row => row.warnings.length > 0).length}</strong></div>
            <div className="ciStat"><span>Kesalahan</span><strong>{errors.length}</strong></div>
          </div>}
          {errors.length > 0 && <div className="ciMessage ciError" role="alert">
            <strong>Impor diblokir: perbaiki/cek data sumber dahulu.</strong>{'\n'}{errors.slice(0, 20).map((error, index) => String(index + 1) + '. ' + error).join('\n')}{errors.length > 20 ? '\n… dan ' + (errors.length - 20) + ' kesalahan lainnya.' : ''}
          </div>}
          {rows.length > 0 && <div className="ciTable">
            <table><thead><tr><th>Baris</th><th>Tanggal aduan</th><th>Nama (disamarkan)</th><th>No. RM</th><th>Unit layanan</th><th>Durasi formula Excel</th><th>Peringatan sumber</th></tr></thead>
              <tbody>{rows.slice(0, 100).map(row => <tr key={row.sourceRow}>
                <td>{row.sourceRow}</td>
                <td>{row.formFields['Tanggal Aduan'].replace('T', ' ')}</td>
                <td>{row.patientName.length > 2 ? row.patientName.slice(0, 1) + '•••' + row.patientName.slice(-1) : '•••'}</td>
                <td>••••••</td>
                <td>{row.formFields['Unit Pelayanan']}</td>
                <td>{row.durationDays.toLocaleString('id-ID', { maximumFractionDigits: 4 })} hari</td>
                <td style={{whiteSpace:'normal',minWidth:260,color:row.warnings.length?'#8b5b13':'var(--muted)'}}>{row.warnings.length ? row.warnings.join(' ') : '—'}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          <div className="ciPrivacy">Catatan 2025 pada workbook 2026 tetap disimpan sebagai data sumber lintas tahun, tetapi tidak masuk denominator capaian indikator tahun 2026. Impor ulang menggunakan kunci baris Excel yang stabil: baris yang sudah ada akan dilewati, bukan digandakan atau ditimpa otomatis.</div>
          {rows.some(row => row.warnings.length > 0) && <div className="ciMessage ciError" role="alert"><strong>Perhatian sumber:</strong> beberapa baris memiliki nilai yang harus diverifikasi manual. Nilai asli tetap dipertahankan; impor akan menyimpan catatan dalam status siap ditinjau.</div>}
          {result && <div className="ciMessage ciSuccess" role="status">Impor selesai. {result.imported_count ?? 0} catatan baru disimpan; {result.skipped_existing_count ?? 0} baris yang sebelumnya ada dilewati. Data telah dimuat ulang dari server.</div>}
        </div>
        <div className="aqFoot">
          <span style={{fontSize:11,color:'var(--muted)'}}>Data pasien tidak disertakan dalam commit kode.</span>
          <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
            <button type="button" className="aqBtn" disabled={parsing || importing} onClick={close}>Tutup</button>
            <button type="button" className="aqBtn primary" disabled={!eligible || !authorized || !rows.length || errors.length > 0 || parsing || importing || !!result} onClick={() => void importRows()}>{importing ? 'Mengimpor…' : 'Impor ' + rows.length + ' baris tervalidasi'}</button>
          </div>
        </div>
      </section>
    </div>
  )
}
