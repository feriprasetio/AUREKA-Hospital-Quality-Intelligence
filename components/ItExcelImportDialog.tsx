'use client'

import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'
import { useCallback, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import {
  buildItImportPayload,
  createItSubjectKey,
  normalizeItDateTime,
  resolveItIndicatorOption,
  type ItIndicatorOption,
  type ItPreparedLogbookRow,
} from '@/lib/aureka/it-logbook-import'

const sb = aurekaSupabase
const q = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_ROWS = 500
const BATCH_SIZE = 100

type IndicatorProfile = Record<string, any> & {
  id?: string
  room_id?: number
  profile_year?: number
  code?: string
  status?: string
  is_active?: boolean
  options_json?: ItIndicatorOption[]
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
type ImportResponse = {
  received_count?: number
  imported_count?: number
  skipped_existing_count?: number
}

const REQUIRED_HEADERS: Record<string, string[]> = {
  sourceNo: ['No.', 'No', 'Nomor'],
  issue: ['Gangguan IT'],
  sourceRoom: ['Asal Ruangan'],
  complaintAt: ['Tanggal Keluhan'],
  staff: ['Petugas IT'],
  difficulty: ['Tingkat Kesulitan'],
  followup: ['Tindak Lanjut'],
}

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
  return String(value).trim()
}

function findHeader(columns: Map<string, number>, candidates: string[]): number | null {
  for (const candidate of candidates) {
    const match = columns.get(normalizeExactHeader(candidate))
    if (match != null) return match
  }
  return null
}

function positiveInteger(value: unknown): number | null {
  const raw = String(value ?? '').trim()
  if (!/^[1-9]\d{0,8}$/.test(raw)) return null
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) ? parsed : null
}

function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Browser tidak mendukung SHA-256 untuk menjaga identitas sumber workbook.')
  return globalThis.crypto.subtle.digest('SHA-256', buffer).then((digest) =>
    Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0')).join(''),
  )
}

export default function ItExcelImportDialog({
  open, roomId, year, authorized, profiles, onClose, onImported,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<ItPreparedLogbookRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportResponse | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const eligible = useMemo(
    () => open && authorized && roomId === 2 && year === 2026,
    [open, authorized, roomId, year],
  )
  const profile = useMemo(
    () => profiles.find((item) =>
      Number(item.room_id) === 2 &&
      Number(item.profile_year) === 2026 &&
      String(item.code) === '2.1' &&
      item.status === 'published' &&
      item.is_active === true &&
      !!item.id,
    ),
    [profiles],
  )

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
  const importDialogRef = useAccessibleDialog<HTMLElement>({open,onClose:close,lockScroll:true})

  const parseWorkbook = async (selectedFile: File) => {
    setFile(selectedFile)
    setRows([])
    setErrors([])
    setResult(null)
    setErrorMessage('')

    if (!eligible) {
      setErrorMessage('Pilih unit Informatika dan Teknologi serta tahun profil 2026 sebelum mengimpor.')
      return
    }
    if (!/\.xlsx$/i.test(selectedFile.name)) {
      setErrorMessage('Pilih workbook .xlsx. Berkas .xls, .csv, dan .xlsm tidak diterima.')
      return
    }
    if (selectedFile.size <= 0 || selectedFile.size > MAX_FILE_BYTES) {
      setErrorMessage('Ukuran workbook harus lebih besar dari 0 dan tidak melebihi 15 MB.')
      return
    }
    if (!profile?.id || !Array.isArray(profile.options_json) || profile.options_json.length === 0) {
      setErrorMessage('Master indikator 2.1 belum aktif atau pilihan Tindak Lanjut belum tersedia.')
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
      if (!worksheet) throw new Error('Sheet "Logbook" tidak ditemukan pada workbook.')
      if (worksheet.rowCount > 5003) throw new Error('Logbook melewati batas baris 5003 yang diizinkan.')

      const columns = new Map<string, number>()
      const headerRow = worksheet.getRow(2)
      for (let column = 1; column <= Math.min(worksheet.columnCount, 100); column++) {
        const name = cellText(headerRow.getCell(column))
        if (name) columns.set(normalizeExactHeader(name), column)
      }
      for (const [, aliases] of Object.entries(REQUIRED_HEADERS)) {
        if (findHeader(columns, aliases) == null) {
          throw new Error('Header wajib "' + aliases[0] + '" tidak ditemukan pada baris 2.')
        }
      }

      const parsed: ItPreparedLogbookRow[] = []
      const rowErrors: string[] = []
      const seenSourceNumbers = new Set<number>()
      const columnByKey = Object.fromEntries(
        Object.entries(REQUIRED_HEADERS).map(([key, aliases]) => [key, findHeader(columns, aliases)!]),
      ) as Record<keyof typeof REQUIRED_HEADERS, number>

      for (let excelRow = 3; excelRow <= Math.min(worksheet.rowCount, 5003); excelRow++) {
        const sourceRow = worksheet.getRow(excelRow)
        const rawValues = Object.entries(columnByKey).map(([key, column]) => [key, cellValue(sourceRow.getCell(column))] as const)
        const rowHasData = rawValues.some(([, value]) => String(value ?? '').trim() !== '')
        if (!rowHasData) continue

        if (parsed.length >= MAX_ROWS) {
          rowErrors.push('Workbook melebihi batas ' + MAX_ROWS + ' baris data.')
          break
        }

        try {
          const values = Object.fromEntries(rawValues) as Record<keyof typeof REQUIRED_HEADERS, unknown>
          const sourceNo = positiveInteger(values.sourceNo)
          if (sourceNo == null) throw new Error('Nomor laporan (No.) harus berupa bilangan bulat positif.')
          if (seenSourceNumbers.has(sourceNo)) throw new Error('Nomor laporan (No.) duplikat di dalam workbook.')
          seenSourceNumbers.add(sourceNo)

          const issue = String(values.issue ?? '').trim()
          const sourceRoom = String(values.sourceRoom ?? '').trim()
          const staff = String(values.staff ?? '').trim()
          const difficulty = String(values.difficulty ?? '').trim()
          const followupRaw = String(values.followup ?? '').trim()
          const dateTime = normalizeItDateTime(values.complaintAt)

          if (!issue) throw new Error('Gangguan IT wajib diisi.')
          if (!sourceRoom) throw new Error('Asal Ruangan wajib diisi.')
          if (!dateTime) throw new Error('Tanggal Keluhan tidak valid.')
          if (!staff) throw new Error('Petugas IT wajib diisi.')
          if (!difficulty) throw new Error('Tingkat Kesulitan wajib diisi.')
          if (!followupRaw) throw new Error('Tindak Lanjut wajib diisi.')

          const response = resolveItIndicatorOption(followupRaw, profile.options_json ?? [])
          if (!response) throw new Error('Respons Tindak Lanjut tidak dapat dipetakan.')
          const formFields = {
            'No.': String(sourceNo),
            'Gangguan IT': issue,
            'Asal Ruangan': sourceRoom,
            'Tanggal Keluhan': dateTime,
            'Petugas IT': staff,
            'Tingkat Kesulitan': difficulty,
            'Tindak Lanjut': followupRaw,
          }

          createItSubjectKey(sourceNo)
          parsed.push({
            sourceRow: excelRow,
            sourceNo,
            recordDateTime: dateTime,
            formFields,
            response,
          })
        } catch (error) {
          rowErrors.push('Baris Excel ' + excelRow + ': ' + (error instanceof Error ? error.message : 'data tidak dapat dibaca.'))
        }
      }

      if (parsed.length === 0 && rowErrors.length === 0) {
        rowErrors.push('Tidak ada data Logbook yang ditemukan mulai dari baris 3.')
      }
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
    if (!file || !profile?.id || !rows.length || errors.length || !eligible || !authorized || importing) return
    setImporting(true)
    setErrorMessage('')
    setResult(null)
    let received = 0
    let imported = 0
    let skipped = 0

    try {
      const { data: authData, error: authError } = await sb.auth.getUser()
      if (authError) throw authError
      if (!authData.user) throw new Error('Sesi login tidak ditemukan. Masuk ke AUREKA lalu ulangi impor.')

      const fileSha256 = await sha256Hex(await file.arrayBuffer())
      const items = rows.map((row) => buildItImportPayload({
        row,
        fileName: file.name,
        fileSha256,
        profile: { id: profile.id!, options_json: profile.options_json ?? [] },
        userId: authData.user!.id,
      }))

      for (let start = 0; start < items.length; start += BATCH_SIZE) {
        const batch = items.slice(start, start + BATCH_SIZE)
        const { data, error } = await q().rpc('import_it_logbook_batch', { p_rows: batch })
        if (error) {
          if (/function .*import_it_logbook_batch.*not found|schema cache/i.test(error.message)) {
            throw new Error('Fungsi impor Informatika dan Teknologi belum tersedia. Migrasi secure_it_logbook_excel_import harus diterapkan.')
          }
          throw new Error(error.message)
        }
        const summary = (data ?? {}) as ImportResponse
        const batchReceived = Number(summary.received_count ?? batch.length)
        const batchImported = Number(summary.imported_count ?? 0)
        const batchSkipped = Number(summary.skipped_existing_count ?? 0)
        if (batchReceived !== batch.length || batchImported + batchSkipped !== batchReceived) {
          throw new Error('Ringkasan batch tidak konsisten. Periksa log server sebelum mengulang impor.')
        }
        received += batchReceived
        imported += batchImported
        skipped += batchSkipped
      }

      const summary = { received_count: received, imported_count: imported, skipped_existing_count: skipped }
      setResult(summary)
      await onImported({ imported, skipped, received })
    } catch (error) {
      const partial = imported + skipped > 0
        ? ' Batch yang sudah selesai: ' + imported + ' baru, ' + skipped + ' sudah ada dari ' + received + ' baris.'
        : ''
      setErrorMessage((error instanceof Error ? error.message : 'Impor gagal.') + partial)
    } finally {
      setImporting(false)
    }
  }

  const reviewCount = rows.filter((row) => row.response.review_required).length
  const codeCounts = rows.reduce((counts, row) => {
    const key = row.response.code == null ? 'Perlu review' : 'Code ' + row.response.code
    counts[key] = (counts[key] ?? 0) + 1
    return counts
  }, {} as Record<string, number>)

  if (!open) return null
  return (
    <div className="aqBack" role="presentation" onClick={(event) => { if (event.target === event.currentTarget) close() }}>
      <section ref={importDialogRef} tabIndex={-1}
        className="aqDrawer aqWide aqITImport"
        role="dialog"
        aria-modal="true"
        aria-labelledby="aqITImportTitle"
      >
        <style>{'.aqITImport .aqBody{display:grid;align-content:start;gap:13px}.aqITImport .itIntro{font-size:12px;line-height:1.55;color:var(--muted)}.aqITImport .itUpload{display:grid;gap:8px;padding:15px;border:1px dashed var(--line);border-radius:14px;background:#fff}.aqITImport .itUpload input{width:100%;font-size:12px}.aqITImport .itStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.aqITImport .itStat{padding:11px;background:#fff;border:1px solid var(--line);border-radius:12px;min-width:0}.aqITImport .itStat span{display:block;color:var(--muted);font-size:10px}.aqITImport .itStat strong{display:block;margin-top:4px;font-size:19px;overflow-wrap:anywhere}.aqITImport .itMessage{padding:11px 13px;border-radius:12px;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.aqITImport .itError{background:#fff0ef;color:#8b2822}.aqITImport .itSuccess{background:#eaf8ef;color:#206443}.aqITImport .itTable{overflow:auto;max-height:320px;border:1px solid var(--line);border-radius:12px;background:#fff}.aqITImport table{width:100%;border-collapse:collapse;font-size:11px}.aqITImport th,.aqITImport td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}.aqITImport th{position:sticky;top:0;background:#f7faf8;white-space:nowrap}.aqITImport .itPrivacy{font-size:10px;color:var(--muted);line-height:1.5}@media(max-width:600px){.aqITImport .itStats{grid-template-columns:repeat(2,minmax(0,1fr))}}'}</style>
        <div className="aqDHead">
          <div>
            <div className="eyebrow">Audit Indikator Mutu · Impor Terarah</div>
            <h4 id="aqITImportTitle">Unggah workbook Informatika dan Teknologi</h4>
            <p>Profil indikator 2.1 · Tahun 2026 · Room 2</p>
          </div>
          <button type="button" className="aqClose" aria-label="Tutup dialog impor" disabled={parsing || importing} onClick={close}>×</button>
        </div>
        <div className="aqBody">
          <div className="itIntro">
            Pilih file .xlsx yang berisi sheet <strong>Logbook</strong>. Baris header dibaca dari baris 2. Setiap laporan gangguan menjadi satu catatan aktivitas dan satu respons indikator Tindak Lanjut.
          </div>
          <div className="itUpload">
            <label htmlFor="aq-it-workbook"><strong>Unggah workbook .xlsx</strong></label>
            <input
              id="aq-it-workbook"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={parsing || importing || !authorized}
              onChange={(event) => {
                const selected = event.target.files?.[0]
                if (selected) void parseWorkbook(selected)
                event.currentTarget.value = ''
              }}
            />
            <div className="itPrivacy">Maksimal 15 MB dan 500 laporan. Identitas sumber disimpan dengan hash SHA-256, nama workbook, sheet, nomor baris, dan nomor laporan.</div>
          </div>

          {parsing && <div className="itMessage">Membaca workbook dan memeriksa setiap baris…</div>}
          {errorMessage && <div className="itMessage itError" role="alert">{errorMessage}</div>}
          {errors.length > 0 && (
            <div className="itMessage itError" role="alert">
              <strong>Impor diblokir sampai kesalahan berikut diperbaiki:</strong>
              {'\n'}{errors.slice(0, 30).join('\n')}
              {errors.length > 30 ? '\n… dan ' + (errors.length - 30) + ' kesalahan lainnya.' : ''}
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="itStats">
                <div className="itStat"><span>Baris siap diproses</span><strong>{rows.length}</strong></div>
                <div className="itStat"><span>Code 1 · ≤1 jam</span><strong>{codeCounts['Code 1'] ?? 0}</strong></div>
                <div className="itStat"><span>Code 2 / 3</span><strong>{(codeCounts['Code 2'] ?? 0) + (codeCounts['Code 3'] ?? 0)}</strong></div>
                <div className="itStat"><span>Perlu review mapping</span><strong>{reviewCount}</strong></div>
              </div>
              <div className="itMessage">
                <strong>Pratinjau berhasil.</strong> {rows.length} laporan terstruktur dan akan dikirim dalam batch. Nomor laporan menjadi kunci idempotensi; unggah ulang workbook yang sama tidak membuat rekaman ganda.
              </div>
              <div className="itTable">
                <table>
                  <thead><tr><th>No.</th><th>Tanggal keluhan</th><th>Gangguan IT</th><th>Asal ruangan</th><th>Petugas IT</th><th>Tindak lanjut</th><th>Mapping</th></tr></thead>
                  <tbody>
                    {rows.slice(0, 20).map((row) => (
                      <tr key={row.sourceNo}>
                        <td>{row.sourceNo}</td>
                        <td>{row.recordDateTime.replace('T', ' ')}</td>
                        <td>{row.formFields['Gangguan IT']}</td>
                        <td>{row.formFields['Asal Ruangan']}</td>
                        <td>{row.formFields['Petugas IT']}</td>
                        <td>{row.formFields['Tindak Lanjut']}</td>
                        <td>{row.response.code == null ? 'Perlu review' : 'Code ' + row.response.code}{row.response.source_option ? ' · sumber-only' : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 20 && <div className="itPrivacy">Menampilkan 20 dari {rows.length} laporan pada pratinjau. Seluruh baris yang lolos validasi akan diimpor.</div>}
            </>
          )}

          {result && (
            <div className="itMessage itSuccess" role="status">
              <strong>Impor selesai.</strong> Diterima: {result.received_count ?? 0}; catatan baru: {result.imported_count ?? 0}; sudah ada dan dilewati: {result.skipped_existing_count ?? 0}.
            </div>
          )}
        </div>
        <div className="aqFoot">
          <span className="itPrivacy">Status setelah impor: Siap Ditinjau. Validasi tetap dilakukan oleh pejabat yang berwenang.</span>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="aqBtn" disabled={parsing || importing} onClick={close}>Batal</button>
            <button
              type="button"
              className="aqBtn primary"
              disabled={!file || !rows.length || errors.length > 0 || parsing || importing || !authorized || !eligible}
              onClick={() => void importRows()}
            >
              {importing ? 'Mengimpor…' : 'Impor ' + rows.length + ' catatan'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
