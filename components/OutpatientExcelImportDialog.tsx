'use client'

import { useCallback, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import { normalizeProviderName, type OutpatientProviderGroup } from '@/lib/aureka/outpatient-logbook'

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_ROWS = 500

type Props = {
  open: boolean
  roomId: number | null
  year: number
  groups: OutpatientProviderGroup[]
  authorized: boolean
  onClose: () => void
  onImported: () => Promise<void> | void
}
type PreparedRow = {
  sourceRow: number
  date: string
  clinic: string
  doctor: string
  minutes: number
  sourceColumn: string
}
type ImportSummary = { received_count?: number; imported_count?: number; skipped_existing_count?: number }

function valueOf(cell: any): unknown {
  const value = cell?.value
  if (value == null) return null
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if (value.result !== undefined) return value.result
    if (value.text !== undefined) return value.text
    if (Array.isArray(value.richText)) return value.richText.map((item: any) => item.text ?? '').join('')
    if (value.hyperlink) return value.text ?? value.hyperlink
  }
  return value
}
function textOf(cell: any): string {
  const value = valueOf(cell)
  return value instanceof Date ? value.toISOString() : String(value ?? '').trim()
}
function isoDate(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    return String(value.getFullYear()).padStart(4, '0') + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0')
  }
  if (typeof value === 'number' && Number.isFinite(value) && value > 10000 && value < 100000) {
    const date = new Date(Date.UTC(1899, 11, 30) + Math.round(value * 86400000))
    return date.toISOString().slice(0, 10)
  }
  const raw = String(value ?? '').trim()
  if (!raw) return null
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const y = Number(iso[1]), m = Number(iso[2]), d = Number(iso[3])
    const check = new Date(Date.UTC(y, m - 1, d))
    return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d
      ? y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') : null
  }
  const dmy = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})/)
  if (dmy) {
    const d = Number(dmy[1]), m = Number(dmy[2]), y = Number(dmy[3])
    const check = new Date(Date.UTC(y, m - 1, d))
    return check.getUTCFullYear() === y && check.getUTCMonth() === m - 1 && check.getUTCDate() === d
      ? y + '-' + String(m).padStart(2, '0') + '-' + String(d).padStart(2, '0') : null
  }
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed.getFullYear() + '-' + String(parsed.getMonth() + 1).padStart(2, '0') + '-' + String(parsed.getDate()).padStart(2, '0')
}
function numericMinutes(cell: any): number | null {
  const value = valueOf(cell)
  if (value == null || value === '') return null
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) return null
    const format = String(cell?.numFmt ?? '')
    const isExcelDuration = /\[(?:h|m|s)\]/i.test(format) || /^(?:h+:)?mm(?::ss)?$/i.test(format)
    const minutes = isExcelDuration && value < 1 ? value * 1440 : value
    return Number.isFinite(minutes) && minutes >= 0 ? Math.round(minutes * 100) / 100 : null
  }
  const raw = String(value).trim()
  const clock = raw.match(/^(\d{1,3}):(\d{2})(?::(\d{2}))?$/)
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]) + (Number(clock[3] ?? 0) / 60)
  const match = raw.replace(/,/g, '.').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const parsed = Number(match[0])
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed * 100) / 100 : null
}
function canonicalHeader(value: string): string {
  return normalizeExactHeader(value).replace(/_/g, ' ').replace(/\s+/g, ' ').trim()
}
function clinicMatch(value: string, groups: OutpatientProviderGroup[]): string | null {
  const key = normalizeProviderName(value)
  if (!key) return null
  const exact = groups.find(group => normalizeProviderName(group.clinic) === key)
  if (exact) return exact.clinic
  const strip = (v: string) => normalizeProviderName(v).replace(/^klinik\s+/, '').replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
  const candidates = groups.filter(group => strip(group.clinic) === strip(value) || strip(group.clinic).startsWith(strip(value)) || strip(value).startsWith(strip(group.clinic)))
  return candidates.length === 1 ? candidates[0].clinic : null
}
function doctorMatch(value: string, groups: OutpatientProviderGroup[]): { clinic: string; doctor: string } | null {
  const key = normalizeProviderName(value)
  if (!key) return null
  const matches = groups.flatMap(group => group.doctors
    .filter(doctor => normalizeProviderName(doctor) === key)
    .map(doctor => ({ clinic: group.clinic, doctor })))
  return matches.length === 1 ? matches[0] : null
}
function validateRow(row: PreparedRow, year: number, groups: OutpatientProviderGroup[]): string | null {
  const expectedClinic = clinicMatch(row.clinic, groups)
  const doctor = doctorMatch(row.doctor, groups)
  if (!row.date || Number(row.date.slice(0, 4)) !== year) return 'tanggal harus valid dan berada pada tahun ' + year
  if (!expectedClinic) return 'nama klinik tidak cocok dengan roster klinik Rawat Jalan'
  if (!doctor || normalizeProviderName(doctor.clinic) !== normalizeProviderName(expectedClinic)) return 'dokter tidak ditemukan pada roster klinik tersebut'
  if (!Number.isFinite(row.minutes) || row.minutes < 0 || row.minutes > 1440) return 'waktu tunggu harus angka 0 sampai 1.440 menit'
  return null
}
function parseTabular(worksheet: any, year: number, groups: OutpatientProviderGroup[]): { rows: PreparedRow[]; errors: string[] } | null {
  const aliases: Record<string, string[]> = {
    date: ['tanggal pengamatan', 'tanggal', 'record date', 'date'],
    clinic: ['klinik', 'clinic', 'nama klinik'],
    doctor: ['dokter', 'doctor', 'nama dokter'],
    minutes: ['waktu tunggu rawat jalan (menit)', 'waktu tunggu (menit)', 'waiting minutes', 'waiting time minutes', 'waiting_minutes'],
  }
  const headerAliases = Object.fromEntries(Object.entries(aliases).map(([key, list]) => [key, new Set(list.map(canonicalHeader))]))
  let headerRow = 0
  let columns: Record<string, number> = {}
  for (let r = 1; r <= Math.min(15, worksheet.rowCount); r++) {
    const candidate: Record<string, number> = {}
    for (let c = 1; c <= Math.min(worksheet.columnCount, 100); c++) {
      const value = canonicalHeader(textOf(worksheet.getRow(r).getCell(c)))
      for (const [key, accepted] of Object.entries(headerAliases)) if (accepted.has(value)) candidate[key] = c
    }
    if (Object.keys(candidate).length === 4) { headerRow = r; columns = candidate; break }
  }
  if (!headerRow) return null
  const rows: PreparedRow[] = [], errors: string[] = []
  const seen = new Set<string>()
  for (let r = headerRow + 1; r <= worksheet.rowCount && r <= headerRow + 5000; r++) {
    const source = worksheet.getRow(r)
    const raw = [columns.date, columns.clinic, columns.doctor, columns.minutes].map(c => textOf(source.getCell(c)))
    if (raw.every(v => !v)) continue
    const date = isoDate(valueOf(source.getCell(columns.date)))
    const clinic = textOf(source.getCell(columns.clinic))
    const doctor = textOf(source.getCell(columns.doctor))
    const minutes = numericMinutes(source.getCell(columns.minutes))
    if (!date || !clinic || !doctor || minutes == null) {
      errors.push('Baris Excel ' + r + ': tanggal, klinik, dokter, atau nilai waktu tunggu kosong/tidak valid.')
      continue
    }
    const matchedClinic = clinicMatch(clinic, groups) ?? clinic
    const matchedDoctor = doctorMatch(doctor, groups)
    const item = { sourceRow: r, date, clinic: matchedClinic, doctor: matchedDoctor?.doctor ?? doctor, minutes, sourceColumn: String(columns.minutes) }
    const issue = validateRow(item, year, groups)
    if (issue) { errors.push('Baris Excel ' + r + ': ' + issue + '.'); continue }
    const key = [date, normalizeProviderName(item.clinic), normalizeProviderName(item.doctor)].join('|')
    if (seen.has(key)) { errors.push('Baris Excel ' + r + ': kombinasi tanggal/klinik/dokter ganda dalam workbook.'); continue }
    seen.add(key); rows.push(item)
    if (rows.length > MAX_ROWS) { errors.push('Workbook melebihi batas ' + MAX_ROWS + ' catatan.'); break }
  }
  return { rows, errors }
}
function parseMatrix(worksheet: any, year: number, groups: OutpatientProviderGroup[]): { rows: PreparedRow[]; errors: string[] } {
  let headerRow = 0
  let dateColumns: Array<{ column: number; date: string }> = []
  let doctorColumn = 0
  let clinicColumn = 0
  for (let r = 1; r <= Math.min(15, worksheet.rowCount); r++) {
    const found: Array<{ column: number; date: string }> = []
    let candidateDoctor = 0
    let candidateClinic = 0
    for (let c = 1; c <= Math.min(worksheet.columnCount, 300); c++) {
      const cell = worksheet.getRow(r).getCell(c)
      const header = canonicalHeader(textOf(cell))
      if (['dokter','nama dokter','doctor','doctor name'].includes(header)) candidateDoctor = c
      if (['klinik','poliklinik','nama klinik','clinic','clinic name'].includes(header)) candidateClinic = c
      const date = isoDate(valueOf(cell))
      if (date && Number(date.slice(0, 4)) === year) found.push({ column: c, date })
    }
    if (found.length >= 1 && found.length > dateColumns.length) {
      headerRow = r
      dateColumns = found
      doctorColumn = candidateDoctor
      clinicColumn = candidateClinic
    }
  }
  if (!headerRow || !dateColumns.length) throw new Error('Tidak menemukan header tanggal pada sheet. Gunakan format tabel (Tanggal pengamatan, Klinik, Dokter, Waktu Tunggu) atau format matriks dokter/klinik dengan tanggal pada kolom.')
  const rows: PreparedRow[] = [], errors: string[] = [], seen = new Set<string>()
  let activeClinic: string | null = null
  for (let r = headerRow + 1; r <= worksheet.rowCount && r <= headerRow + 5000; r++) {
    const source = worksheet.getRow(r)
    let label = ''
    for (let c = 1; c <= Math.min(4, worksheet.columnCount); c++) {
      const candidate = textOf(source.getCell(c))
      if (candidate) { label = candidate; break }
    }
    if (!label) continue
    const rawClinic = clinicColumn ? textOf(source.getCell(clinicColumn)) : ''
    const rawDoctor = doctorColumn ? textOf(source.getCell(doctorColumn)) : label
    const foundClinic = rawClinic ? clinicMatch(rawClinic, groups) : clinicMatch(label, groups)
    if (foundClinic && !rawDoctor.trim()) { activeClinic = foundClinic; continue }
    if (foundClinic && rawDoctor.trim() && normalizeProviderName(rawDoctor) === normalizeProviderName(rawClinic)) {
      activeClinic = foundClinic
      continue
    }
    const foundDoctor = doctorMatch(rawDoctor || label, groups)
    if (!foundDoctor) {
      const hasValues = dateColumns.some(({ column }) => valueOf(source.getCell(column)) != null && valueOf(source.getCell(column)) !== '')
      if (hasValues) errors.push('Baris Excel ' + r + ': nama klinik/dokter "' + [rawDoctor, rawClinic].filter(Boolean).join(' · ') + '" tidak dikenali.')
      continue
    }
    const clinic = foundClinic ?? activeClinic ?? foundDoctor.clinic
    if (normalizeProviderName(clinic) !== normalizeProviderName(foundDoctor.clinic)) {
      errors.push('Baris Excel ' + r + ': dokter ' + foundDoctor.doctor + ' tidak sesuai dengan klinik ' + clinic + '.')
      continue
    }
    for (const { column, date } of dateColumns) {
      const cell = source.getCell(column)
      const raw = valueOf(cell)
      if (raw == null || raw === '') continue
      const minutes = numericMinutes(cell)
      if (minutes == null) { errors.push('Baris Excel ' + r + ', kolom ' + column + ': waktu tunggu bukan angka menit yang valid.'); continue }
      const item = { sourceRow: r, date, clinic, doctor: foundDoctor.doctor, minutes, sourceColumn: String(column) }
      const issue = validateRow(item, year, groups)
      if (issue) { errors.push('Baris Excel ' + r + ': ' + issue + '.'); continue }
      const key = [date, normalizeProviderName(clinic), normalizeProviderName(foundDoctor.doctor)].join('|')
      if (seen.has(key)) { errors.push('Tanggal/klinik/dokter ganda pada baris Excel ' + r + '.'); continue }
      seen.add(key); rows.push(item)
      if (rows.length > MAX_ROWS) { errors.push('Workbook melebihi batas ' + MAX_ROWS + ' catatan.'); return { rows, errors } }
    }
  }
  return { rows, errors }
}

export default function OutpatientExcelImportDialog({ open, roomId, year, groups, authorized, onClose, onImported }: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<PreparedRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [message, setMessage] = useState('')
  const eligible = useMemo(() => open && roomId === 11 && year >= 2024 && year <= 2030 && groups.length > 0, [open, roomId, year, groups])
  const reset = useCallback(() => { setFile(null); setRows([]); setErrors([]); setSummary(null); setMessage('') }, [])
  const close = () => { if (parsing || importing) return; reset(); onClose() }

  const readWorkbook = async (selected: File) => {
    reset(); setFile(selected)
    if (!eligible || !authorized) { setMessage('Impor hanya tersedia untuk PIC/PMKP/Admin Instalasi Rawat Jalan.'); return }
    if (!/\.xlsx$/i.test(selected.name)) { setMessage('Berkas harus berformat .xlsx.'); return }
    if (selected.size <= 0 || selected.size > MAX_FILE_BYTES) { setMessage('Ukuran berkas harus lebih besar dari 0 dan maksimal 15 MB.'); return }
    setParsing(true)
    try {
      const module = await import('exceljs-hardened')
      const ExcelJS: any = (module as any).default ?? module
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await selected.arrayBuffer())
      const worksheet = workbook.getWorksheet('Logbook') ?? workbook.worksheets?.[0]
      if (!worksheet) throw new Error('Workbook tidak memiliki worksheet yang dapat dibaca.')
      if (worksheet.rowCount > 10000 || worksheet.columnCount > 500) throw new Error('Dimensi workbook melewati batas pembacaan (10.000 baris × 500 kolom).')
      const parsed = parseTabular(worksheet, year, groups) ?? parseMatrix(worksheet, year, groups)
      if (!parsed.rows.length && !parsed.errors.length) parsed.errors.push('Tidak ada catatan waktu tunggu yang terdeteksi pada sheet ' + worksheet.name + '.')
      setRows(parsed.rows)
      setErrors(parsed.errors)
      if (parsed.errors.length) setMessage('Sebagian baris bermasalah. Perbaiki workbook hingga tidak ada kesalahan sebelum mengimpor.')
    } catch (error) {
      setRows([]); setErrors([])
      setMessage(error instanceof Error ? error.message : 'Workbook Excel tidak dapat dibaca.')
    } finally { setParsing(false) }
  }

  const importRows = async () => {
    if (!file || !rows.length || errors.length || !eligible || !authorized || summary) return
    setImporting(true); setMessage('')
    try {
      const { data: authData, error: authError } = await sb.auth.getUser()
      if (authError) throw authError
      if (!authData.user) throw new Error('Sesi login tidak ditemukan.')
      let imported = 0, skipped = 0, received = 0
      for (let offset = 0; offset < rows.length; offset += 100) {
        const batch = rows.slice(offset, offset + 100).map(row => {
          const subjectKey = '11:' + row.date + ':' + row.clinic + ':' + row.doctor
          const form = {
            'Tanggal pengamatan': row.date,
            'Klinik': row.clinic,
            'Dokter': row.doctor,
            'Waktu Tunggu Rawat Jalan (Menit)': row.minutes,
          }
          const core = {
            patient_name: row.doctor + ' · ' + row.clinic,
            medical_record_no: '',
            admission_at: row.date,
            unit_name: 'Instalasi Rawat Jalan',
            room_id: 11,
            status: 'ready',
            workflow_status: 'ready',
            form_fields: form,
            calculated_fields: {},
            indicator_values: {},
            measurement_grain: 'provider_day',
            source_import: { source_workbook: file.name, source_sheet: 'Logbook', source_excel_row: row.sourceRow, source_excel_column: row.sourceColumn },
          }
          return {
            payload: {
              room_id: 11,
              profile_year: year,
              measurement_grain: 'provider_day',
              record_date: row.date,
              subject_key: subjectKey,
              subject_json: core,
              core_data: core,
              status: 'ready',
              review_required: false,
              entered_by: authData.user!.id,
            },
            responses: [],
            attributions: [],
          }
        })
        const { data, error } = await q().rpc('import_outpatient_logbook_batch', { p_rows: batch })
        if (error) throw new Error(error.message)
        const result = (data ?? {}) as ImportSummary
        const got = Number(result.received_count ?? batch.length)
        const added = Number(result.imported_count ?? 0)
        const duplicate = Number(result.skipped_existing_count ?? 0)
        if (got !== batch.length || added + duplicate !== got) throw new Error('Ringkasan impor server tidak konsisten; hentikan proses dan periksa data sebelum mengulang.')
        received += got; imported += added; skipped += duplicate
      }
      setSummary({ received_count: received, imported_count: imported, skipped_existing_count: skipped })
      await onImported()
    } catch (error) {
      setMessage('Impor belum selesai: ' + (error instanceof Error ? error.message : 'Kesalahan tidak diketahui. Jika batch sebelumnya berhasil, baris tersebut akan dilewati otomatis saat impor ulang.'))
    } finally { setImporting(false) }
  }

  if (!open) return null
  return <div className="aqBack" role="presentation" onClick={event => { if (event.target === event.currentTarget) close() }}>
    <section className="aqDrawer aqWide aqOutpatientImport" role="dialog" aria-modal="true" aria-labelledby="aqOutpatientImportTitle">
      <style>{'.aqOutpatientImport .aqBody{display:grid;align-content:start;gap:12px}.aqOutpatientImport .oiUpload{padding:14px;border:1px dashed var(--line);border-radius:14px;background:#fff}.aqOutpatientImport .oiNote{font-size:10px;color:var(--muted);line-height:1.55}.aqOutpatientImport .oiMessage{padding:11px 13px;border-radius:10px;background:#fff4e6;color:#7b551b;font-size:11px;line-height:1.5;white-space:pre-wrap}.aqOutpatientImport .oiMessage.error{background:#fff0ef;color:#8b2822}.aqOutpatientImport .oiMessage.success{background:#eaf8ef;color:#206443}.aqOutpatientImport .oiTable{overflow:auto;max-height:340px;border:1px solid var(--line);border-radius:11px}.aqOutpatientImport table{width:100%;border-collapse:collapse;font-size:10px}.aqOutpatientImport th,.aqOutpatientImport td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);white-space:nowrap}.aqOutpatientImport th{position:sticky;top:0;background:#f7faf8}.aqOutpatientImport .oiStats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}.aqOutpatientImport .oiStat{padding:10px;border:1px solid var(--line);border-radius:10px;background:#fff}.aqOutpatientImport .oiStat span{display:block;font-size:9px;color:var(--muted)}.aqOutpatientImport .oiStat strong{display:block;font-size:18px;margin-top:3px}@media(max-width:560px){.aqOutpatientImport .oiStats{grid-template-columns:1fr}}'}</style>
      <div className="aqDHead"><div><div className="eyebrow">Instalasi Rawat Jalan · Impor Excel</div><h4 id="aqOutpatientImportTitle">Unggah workbook Rawat Jalan (.xlsx)</h4><p>Profil tahun {year} · pembacaan dan pratinjau dilakukan di browser</p></div><button className="aqClose" type="button" disabled={parsing || importing} onClick={close} aria-label="Batal">×</button></div>
      <div className="aqBody">
        {!authorized && <div className="oiMessage error">Akun ini tidak memiliki izin untuk mengimpor workbook Rawat Jalan.</div>}
        {!eligible && <div className="oiMessage error">Pilih Instalasi Rawat Jalan, tahun yang valid, dan pastikan roster klinik tersedia.</div>}
        <div className="oiUpload"><label className="aqField"><span>File Excel · maksimum 15 MB</span><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={!eligible || !authorized || parsing || importing} onChange={event => { const selected = event.target.files?.[0]; if (selected) void readWorkbook(selected); event.currentTarget.value = '' }}/></label><p className="oiNote">Format yang dibaca: tabel berkolom tanggal/klinik/dokter/waktu tunggu, atau matriks dengan tanggal pada header kolom, nama klinik sebagai baris kelompok, dan nama dokter pada baris berikutnya. Data dari tahun lain atau dokter yang tidak cocok dengan roster ditolak. Isi sel kosong diabaikan.</p>{file && <p className="oiNote">File: {file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>}</div>
        {parsing && <div className="oiMessage">Membaca workbook, mengidentifikasi tanggal, memetakan klinik/dokter, dan memvalidasi nilai menit…</div>}
        {message && <div className={'oiMessage ' + (summary ? 'success' : errors.length || /gagal|tidak|belum/i.test(message) ? 'error' : '')} role="alert">{message}</div>}
        {rows.length > 0 && <div className="oiStats"><div className="oiStat"><span>Catatan valid</span><strong>{rows.length}</strong></div><div className="oiStat"><span>Baris bermasalah</span><strong>{errors.length}</strong></div><div className="oiStat"><span>Klinik terpetakan</span><strong>{new Set(rows.map(row => row.clinic)).size}</strong></div></div>}
        {errors.length > 0 && <div className="oiMessage error" role="alert"><strong>Impor diblokir.</strong>{'\n'}{errors.slice(0, 30).map((error, index) => (index + 1) + '. ' + error).join('\n')}{errors.length > 30 ? '\n… dan ' + (errors.length - 30) + ' kesalahan lainnya.' : ''}</div>}
        {rows.length > 0 && <div className="oiTable"><table><thead><tr><th>Baris Excel</th><th>Tanggal</th><th>Klinik</th><th>Dokter</th><th>Waktu tunggu</th></tr></thead><tbody>{rows.slice(0, 100).map((row, index) => <tr key={row.date + row.clinic + row.doctor + index}><td>{row.sourceRow}</td><td>{row.date}</td><td>{row.clinic}</td><td>{row.doctor}</td><td>{row.minutes.toLocaleString('id-ID', { maximumFractionDigits: 2 })} menit</td></tr>)}</tbody></table></div>}
        {summary && <div className="oiMessage success" role="status">Impor selesai: {summary.imported_count ?? 0} catatan baru disimpan; {summary.skipped_existing_count ?? 0} catatan duplikat dilewati. Daftar logbook telah dimuat ulang.</div>}
      </div>
      <div className="aqFoot"><span className="oiNote">Workbook diproses lokal; hanya data hasil validasi yang dikirim ke server melalui sesi AUREKA.</span><div style={{display:'flex',gap:8}}><button type="button" className="aqBtn" disabled={parsing || importing} onClick={close}>Batal</button><button type="button" className="aqBtn primary" disabled={!eligible || !authorized || !rows.length || errors.length > 0 || parsing || importing || !!summary} onClick={() => void importRows()}>{importing ? 'Mengimpor…' : 'Simpan ' + rows.length + ' catatan'}</button></div></div>
    </section>
  </div>
}
