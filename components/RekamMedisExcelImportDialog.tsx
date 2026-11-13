'use client'

import { useMemo, useState } from 'react'
import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import {
  buildRekamMedisImportPayload,
  normalizeRekamMedisDate,
  resolveRekamMedisIndicatorOption,
  type RekamMedisIndicatorProfile,
  type RekamMedisPreparedRow,
} from '@/lib/aureka/rekam-medis-logbook'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_DATA_ROWS = 5000
const BATCH_SIZE = 20
const REQUIRED_HEADERS: Record<string, string[]> = {
  sourceNo: ['No.', 'No'],
  patientName: ['Nama Pasien'],
  medicalRecordNo: ['No. Rekam Medis', 'No RM', 'No. RM.'],
  admissionDate: ['Tanggal Masuk'],
  sep: ['SEP', 'Nomor SEP'],
  dpjp: ['DPJP'],
  claim: ['Klaim'],
  klpcm: ['KLPCM'],
}

type ProfileInput = Partial<RekamMedisIndicatorProfile> & {
  room_id?: number
  profile_year?: number
  is_active?: boolean
  status?: string
}
type Props = {
  open: boolean
  roomId: number | null
  year: number
  authorized: boolean
  profiles: ProfileInput[]
  onClose: () => void
  onImported: (summary: { imported: number; skipped: number; received: number }) => void | Promise<void>
}
type ImportSummary = { received_count?: number; imported_count?: number; skipped_existing_count?: number }
type ImportCounts = { received_count: number; imported_count: number; skipped_existing_count: number }

function readCellValue(cell: any): unknown {
  const value = cell?.value
  if (value == null) return ''
  if (value instanceof Date) return value
  if (typeof value === 'object') {
    if ('result' in value) return value.result ?? ''
    if (Array.isArray(value.richText)) return value.richText.map((part: any) => String(part?.text ?? '')).join('')
    if (typeof value.text === 'string') return value.text
    if (typeof value.error === 'string') return value.error
    return ''
  }
  return value
}

function cellText(cell: any): string {
  const value = readCellValue(cell)
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  return String(value ?? '').trim()
}

function sourceNumber(cell: any): string {
  const value = readCellValue(cell)
  if (value == null || value === '') return ''
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Number.isInteger(value) ? String(value) : ''
  }
  return String(value).trim()
}

function maskName(value: string): string {
  const parts = value.trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '-'
  if (parts.length === 1) return parts[0].slice(0, 1) + '•••'
  return parts[0].slice(0, 1) + '••• ' + parts[parts.length - 1].slice(0, 1) + '•••'
}

function maskMedicalRecord(value: string): string {
  const compact = value.trim()
  return compact.length <= 4 ? '••••' : compact.slice(0, 2) + '••••' + compact.slice(-2)
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Browser tidak menyediakan fungsi SHA-256 untuk pemeriksaan sumber workbook.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export default function RekamMedisExcelImportDialog({
  open, roomId, year, authorized, profiles, onClose, onImported,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<RekamMedisPreparedRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportCounts | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [fileKey, setFileKey] = useState(0)

  const eligible = open && authorized && roomId === 13 && year === 2026
  const activeProfiles = useMemo(() => profiles.filter((profile): profile is RekamMedisIndicatorProfile & ProfileInput =>
    typeof profile.id === 'string' &&
    typeof profile.code === 'string' &&
    Number(profile.room_id) === 13 &&
    Number(profile.profile_year) === 2026 &&
    profile.is_active === true &&
    profile.status === 'published',
  ), [profiles])
  const profileByCode = useMemo(() => {
    const map = new Map<string, RekamMedisIndicatorProfile>()
    for (const profile of activeProfiles) map.set(String(profile.code), profile)
    return map
  }, [activeProfiles])
  const preview = useMemo(() => rows.slice(0, 20), [rows])
  const reviewCount = useMemo(() => rows.filter(row =>
    row.claimResponse.review_required || row.klpcmResponse.review_required,
  ).length, [rows])
  const claimCodeOne = useMemo(() => rows.filter(row => row.claimResponse.code === 1).length, [rows])
  const klpcmCodeOne = useMemo(() => rows.filter(row => row.klpcmResponse.code === 1).length, [rows])

  const reset = () => {
    setFile(null)
    setRows([])
    setErrors([])
    setParsing(false)
    setImporting(false)
    setResult(null)
    setErrorMessage('')
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
    setErrorMessage('')
    if (!eligible) {
      setErrorMessage('Pilih Instalasi Rekam Medis dan tahun 2026 sebelum mengunggah workbook.')
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
    if (profileByCode.size !== 2 || !profileByCode.get('13.1')?.id || !profileByCode.get('13.2')?.id) {
      setErrorMessage('Master indikator 13.1 dan 13.2 harus aktif dan terbit pada profil 2026.')
      return
    }
    for (const code of ['13.1', '13.2']) {
      const profile = profileByCode.get(code)
      if (!Array.isArray(profile?.options_json) || profile.options_json.length === 0) {
        setErrorMessage('Pilihan indikator ' + code + ' belum tersedia pada master aktif.')
        return
      }
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
      const worksheet = workbook.getWorksheet('Logbook')
      if (!worksheet) throw new Error('Sheet Logbook tidak ditemukan.')
      if (worksheet.rowCount > MAX_DATA_ROWS + 10 || worksheet.columnCount > 100) {
        throw new Error('Dimensi sheet Logbook melewati batas 5.010 baris atau 100 kolom.')
      }

      const header = worksheet.getRow(2)
      const columns = new Map<string, number[]>()
      for (let column = 1; column <= Math.min(worksheet.columnCount, 100); column++) {
        const label = cellText(header.getCell(column))
        if (!label) continue
        const key = normalizeExactHeader(label)
        const values = columns.get(key) ?? []
        values.push(column)
        columns.set(key, values)
      }
      const indexes: Record<string, number> = {}
      for (const [key, aliases] of Object.entries(REQUIRED_HEADERS)) {
        const match = aliases.map(alias => columns.get(normalizeExactHeader(alias))).find(value => value?.length)
        if (!match?.length) throw new Error('Header wajib "' + aliases[0] + '" tidak ditemukan pada baris 2.')
        if (match.length > 1) throw new Error('Header "' + aliases[0] + '" muncul lebih dari satu kali.')
        indexes[key] = match[0]
      }

      const prepared: RekamMedisPreparedRow[] = []
      const rowErrors: string[] = []
      const seenSourceNumbers = new Set<number>()
      const seenEpisodes = new Set<string>()
      const upper = Math.min(worksheet.rowCount, MAX_DATA_ROWS + 3)
      for (let excelRow = 3; excelRow <= upper; excelRow++) {
        const source = worksheet.getRow(excelRow)
        const hasData = ['patientName', 'medicalRecordNo', 'admissionDate', 'sep', 'dpjp', 'claim', 'klpcm']
          .some(key => cellText(source.getCell(indexes[key])).trim() !== '')
        if (!hasData) continue
        try {
          const sourceNoText = sourceNumber(source.getCell(indexes.sourceNo))
          const sourceNo = Number(sourceNoText)
          const patientName = cellText(source.getCell(indexes.patientName))
          const medicalRecordNo = cellText(source.getCell(indexes.medicalRecordNo))
          const admissionDate = normalizeRekamMedisDate(readCellValue(source.getCell(indexes.admissionDate)))
          const sep = cellText(source.getCell(indexes.sep))
          const dpjp = cellText(source.getCell(indexes.dpjp))
          const claim = cellText(source.getCell(indexes.claim))
          const klpcm = cellText(source.getCell(indexes.klpcm))

          if (!/^[1-9]\d{0,8}$/.test(sourceNoText)) throw new Error('No. sumber harus berupa bilangan bulat positif.')
          if (seenSourceNumbers.has(sourceNo)) throw new Error('No. sumber berulang.')
          seenSourceNumbers.add(sourceNo)
          if (!patientName) throw new Error('Nama Pasien kosong.')
          if (!medicalRecordNo) throw new Error('No. Rekam Medis kosong.')
          if (!admissionDate) throw new Error('Tanggal Masuk kosong atau tidak valid.')
          if (admissionDate.slice(0, 4) !== '2026') throw new Error('Tanggal Masuk harus berada dalam profil 2026.')
          if (!sep) throw new Error('SEP kosong.')
          if (!dpjp) throw new Error('DPJP kosong.')
          if (!claim) throw new Error('Pilihan Klaim kosong.')
          if (!klpcm) throw new Error('Pilihan KLPCM kosong.')
          if (patientName.length > 200 || medicalRecordNo.length > 64 || sep.length > 80 || dpjp.length > 180) {
            throw new Error('Panjang salah satu kolom identitas melewati batas yang diizinkan.')
          }

          const episodeKey = [medicalRecordNo.toLocaleLowerCase('id-ID'), admissionDate, sep].join('|')
          if (seenEpisodes.has(episodeKey)) throw new Error('Kombinasi No. RM, Tanggal Masuk, dan SEP berulang dalam workbook.')
          seenEpisodes.add(episodeKey)
          const claimResponse = resolveRekamMedisIndicatorOption(claim, profileByCode.get('13.1')?.options_json ?? [])
          const klpcmResponse = resolveRekamMedisIndicatorOption(klpcm, profileByCode.get('13.2')?.options_json ?? [])
          if (!claimResponse || !klpcmResponse) throw new Error('Respons indikator tidak dapat dibaca.')
          prepared.push({
            sourceRow: excelRow, sourceNo, patientName, medicalRecordNo, admissionDate,
            sep, dpjp, claim, klpcm, claimResponse, klpcmResponse,
          })
        } catch (error) {
          rowErrors.push('Baris Excel ' + excelRow + ': ' + (error instanceof Error ? error.message : 'Data tidak valid.'))
        }
        if (prepared.length + rowErrors.length >= MAX_DATA_ROWS) break
      }
      if (!prepared.length && !rowErrors.length) throw new Error('Tidak ditemukan catatan pada sheet Logbook mulai baris 3.')
      setRows(prepared.sort((a, b) => a.sourceRow - b.sourceRow))
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
    if (!file || !rows.length || errors.length || !eligible || !authorized || importing) return
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
      const items = rows.map(row => buildRekamMedisImportPayload({
        row,
        fileName: file.name,
        fileSha256,
        profiles: [
          { ...profileByCode.get('13.1')!, code: '13.1' },
          { ...profileByCode.get('13.2')!, code: '13.2' },
        ],
        userId: authData.user!.id,
      }))

      for (let start = 0; start < items.length; start += BATCH_SIZE) {
        const batch = items.slice(start, start + BATCH_SIZE)
        const { data, error } = await quality().rpc('import_rekam_medis_logbook_batch', { p_rows: batch })
        if (error) {
          if (/function .*import_rekam_medis_logbook_batch.*not found|schema cache/i.test(error.message)) {
            throw new Error('Fungsi impor Instalasi Rekam Medis belum tersedia. Terapkan migrasi secure_rekam_medis_logbook_import terlebih dahulu.')
          }
          throw new Error(error.message)
        }
        const summary = (data ?? {}) as ImportSummary
        const batchReceived = Number(summary.received_count ?? batch.length)
        const batchImported = Number(summary.imported_count ?? 0)
        const batchSkipped = Number(summary.skipped_existing_count ?? 0)
        if (batchReceived !== batch.length || batchImported + batchSkipped !== batchReceived) {
          throw new Error('Ringkasan batch tidak konsisten. Periksa catatan server sebelum mengulangi impor.')
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

  if (!open) return null
  return (
    <div className="aqBack" role="presentation" onClick={event => { if (event.target === event.currentTarget) close() }}>
      <section ref={importDialogRef} tabIndex={-1} className="aqDrawer aqWide aqRekamMedisImport"
        role="dialog" aria-modal="true" aria-labelledby="aqRekamMedisImportTitle">
        <style>{'.aqRekamMedisImport .aqBody{display:grid;align-content:start;gap:13px}.aqRekamMedisImport .rmIntro{font-size:12px;line-height:1.55;color:var(--muted)}.aqRekamMedisImport .rmUpload{display:grid;gap:8px;padding:15px;border:1px dashed var(--line);border-radius:14px;background:#fff}.aqRekamMedisImport .rmUpload input{width:100%;font-size:12px}.aqRekamMedisImport .rmStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.aqRekamMedisImport .rmStat{padding:11px;background:#fff;border:1px solid var(--line);border-radius:12px;min-width:0}.aqRekamMedisImport .rmStat span{display:block;color:var(--muted);font-size:11px}.aqRekamMedisImport .rmStat strong{display:block;margin-top:4px;font-size:19px;overflow-wrap:anywhere}.aqRekamMedisImport .rmMessage{padding:11px 13px;border-radius:12px;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.aqRekamMedisImport .rmError{background:#fff0ef;color:#8b2822}.aqRekamMedisImport .rmSuccess{background:#eaf8ef;color:#206443}.aqRekamMedisImport .rmTable{overflow:auto;max-height:320px;border:1px solid var(--line);border-radius:12px;background:#fff}.aqRekamMedisImport table{width:100%;border-collapse:collapse;font-size:11px}.aqRekamMedisImport th,.aqRekamMedisImport td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}.aqRekamMedisImport th{position:sticky;top:0;background:#f7faf8;white-space:nowrap}.aqRekamMedisImport .rmPrivacy{font-size:11px;color:var(--muted);line-height:1.5}@media(max-width:600px){.aqRekamMedisImport .rmStats{grid-template-columns:repeat(2,minmax(0,1fr))}}'}</style>
        <div className="aqDHead">
          <div>
            <div className="eyebrow">Audit Indikator Mutu · Impor Terarah</div>
            <h4 id="aqRekamMedisImportTitle">Unggah workbook Instalasi Rekam Medis</h4>
            <p>Profil indikator 13.1 dan 13.2 · Tahun 2026 · Room 13</p>
          </div>
          <button type="button" className="aqClose" aria-label="Tutup dialog impor" disabled={parsing || importing} onClick={close}>×</button>
        </div>
        <div className="aqBody">
          <div className="rmIntro">
            Pilih workbook .xlsx yang berisi sheet <strong>Logbook</strong>. Baris header dibaca dari baris 2. Setiap baris pasien menjadi satu catatan event dengan dua respons indikator. Data hanya dipetakan ke master indikator aktif; nilai yang tidak dikenal dipertahankan dan diberi penanda perlu ditinjau.
          </div>
          <div className="rmUpload">
            <label htmlFor="aq-rekam-medis-workbook"><strong>Unggah workbook .xlsx</strong></label>
            <input id="aq-rekam-medis-workbook" key={fileKey} type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={parsing || importing || !authorized}
              onChange={event => {
                const selected = event.target.files?.[0]
                if (selected) void parseWorkbook(selected)
                event.currentTarget.value = ''
              }} />
            <div className="rmPrivacy">Maksimal 15 MB dan 5.000 catatan. Pratinjau menyamarkan nama dan nomor rekam medis. Data identitas hanya dikirim ke basis data AUREKA setelah tombol Impor ditekan; nomor SEP diperlakukan sebagai data sumber dan tidak digunakan sebagai kunci duplikasi.</div>
          </div>

          {parsing && <div className="rmMessage">Membaca workbook dan memeriksa setiap baris…</div>}
          {errorMessage && <div className="rmMessage rmError" role="alert">{errorMessage}</div>}
          {errors.length > 0 && <div className="rmMessage rmError" role="alert">
            <strong>Impor diblokir sampai kesalahan berikut diperbaiki:</strong>
            {'\n'}{errors.slice(0, 30).join('\n')}
            {errors.length > 30 ? '\n… dan ' + (errors.length - 30) + ' kesalahan lainnya.' : ''}
          </div>}

          {rows.length > 0 && <>
            <div className="rmStats">
              <div className="rmStat"><span>Catatan siap diproses</span><strong>{rows.length}</strong></div>
              <div className="rmStat"><span>Klaim · Code 1</span><strong>{claimCodeOne}</strong></div>
              <div className="rmStat"><span>KLPCM · Code 1</span><strong>{klpcmCodeOne}</strong></div>
              <div className="rmStat"><span>Perlu review mapping</span><strong>{reviewCount}</strong></div>
            </div>
            <div className="rmMessage">
              <strong>Pratinjau berhasil.</strong> {rows.length} catatan lolos pemeriksaan lokal. Unggah ulang workbook yang sama akan melewati baris yang sudah ada, bukan membuat duplikasi.
            </div>
            <div className="rmTable">
              <table>
                <thead><tr><th>No.</th><th>Tanggal Masuk</th><th>Pasien</th><th>No. RM</th><th>DPJP</th><th>Klaim</th><th>KLPCM</th></tr></thead>
                <tbody>{preview.map(row => <tr key={row.sourceRow}>
                  <td>{row.sourceNo}</td>
                  <td>{row.admissionDate}</td>
                  <td>{maskName(row.patientName)}</td>
                  <td>{maskMedicalRecord(row.medicalRecordNo)}</td>
                  <td>DPJP tersimpan</td>
                  <td>{row.claimResponse.code == null ? 'Perlu review' : 'Code ' + row.claimResponse.code}</td>
                  <td>{row.klpcmResponse.code == null ? 'Perlu review' : 'Code ' + row.klpcmResponse.code}</td>
                </tr>)}</tbody>
              </table>
            </div>
            {rows.length > preview.length && <div className="rmPrivacy">Menampilkan {preview.length} dari {rows.length} catatan; seluruh catatan yang lolos validasi akan diimpor.</div>}
          </>}

          {result && <div className="rmMessage rmSuccess" role="status">
            <strong>Impor selesai.</strong> Diterima: {result.received_count}; catatan baru: {result.imported_count}; sudah ada dan dilewati: {result.skipped_existing_count}.
          </div>}
        </div>
        <div className="aqFoot">
          <span className="rmPrivacy">Status setelah impor: Siap Ditinjau. Validasi tetap dilakukan oleh validator yang berwenang.</span>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <button type="button" className="aqBtn" disabled={parsing || importing} onClick={close}>Batal</button>
            <button type="button" className="aqBtn primary"
              disabled={!file || !rows.length || errors.length > 0 || parsing || importing || !authorized || !eligible}
              onClick={() => void importRows()}>
              {importing ? 'Mengimpor…' : 'Impor ' + rows.length + ' catatan'}
            </button>
          </div>
        </div>
      </section>
    </div>
  )
}
