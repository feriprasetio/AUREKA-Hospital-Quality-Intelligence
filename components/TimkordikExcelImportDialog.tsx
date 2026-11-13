'use client'

import { useMemo, useState } from 'react'
import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import {
  buildTimkordikImportPayload,
  createTimkordikSubjectKey,
  normalizeTimkordikDate,
  resolveTimkordikIndicatorOption,
  TIMKORDIK_INDICATORS,
  type TimkordikIndicatorProfile,
  type TimkordikIndicatorCode,
  type TimkordikPreparedRow,
} from '@/lib/aureka/timkordik-logbook-import'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_ROWS = 500
const BATCH_SIZE = 50

type ProfileInput = Partial<TimkordikIndicatorProfile> & {
  id?: string
  code?: string
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
type ImportSummary = {
  received_count?: number
  imported_count?: number
  skipped_existing_count?: number
}
type RequiredField = 'sourceNo' | 'studentName' | 'profession' | 'campus' | 'rotation' | 'startDate' | 'endDate' | 'ci'
const REQUIRED_HEADERS: Record<RequiredField, string[]> = {
  sourceNo: ['No.', 'No'],
  studentName: ['Nama Mahasiswa'],
  profession: ['Profesi/Prodi', 'Profesi', 'Prodi'],
  campus: ['Kampus'],
  rotation: ['Stase', 'Stase Terakhir'],
  startDate: ['Tanggal Mulai Praktek', 'Tanggal Mulai Praktik'],
  endDate: ['Tanggal Selesai Praktek', 'Tanggal Selesai Praktik'],
  ci: ['CI/Penanggung Jawab', 'CI / Penanggung Jawab'],
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
    return ''
  }
  return value
}

function cellText(cell: any): string {
  const value = readCellValue(cell)
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').trim()
}

function positiveInteger(value: unknown): number | null {
  const raw = String(value ?? '').trim()
  if (!/^[1-9]\d{0,8}$/.test(raw)) return null
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) ? parsed : null
}

async function sha256Hex(buffer: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) throw new Error('Browser tidak menyediakan fungsi SHA-256 untuk pemeriksaan sumber workbook.')
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer)
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, '0')).join('')
}

function validateSourceProfileSheet(worksheet: any): void {
  for (let index = 0; index < TIMKORDIK_INDICATORS.length; index++) {
    const indicator = TIMKORDIK_INDICATORS[index]
    const row = worksheet.getRow(index + 3)
    const sourceNo = positiveInteger(readCellValue(row.getCell(1)))
    const title = cellText(row.getCell(3))
    if (sourceNo !== index + 1 || title !== indicator.profileTitle) {
      throw new Error('Sheet Profil tidak cocok dengan master indikator ' + indicator.code + ' pada baris ' + (index + 3) + '.')
    }
    const sourceOptions: string[] = []
    for (let col = 9; col <= 18; col++) {
      const value = cellText(row.getCell(col))
      if (value) sourceOptions.push(value)
    }
    const resolved = sourceOptions.map(option => resolveTimkordikIndicatorOption(indicator.code, option))
    if (sourceOptions.length !== indicator.options.length || resolved.some(option => !option)) {
      throw new Error('Daftar pilihan pada Profil untuk indikator ' + indicator.code + ' berbeda dengan pilihan sumber yang disetujui.')
    }
    const sourceSet = new Set(resolved.map(option => option!.answer + '|' + option!.code))
    const expectedSet = new Set(indicator.options.map(option => option.label + '|' + option.code))
    if (sourceSet.size !== expectedSet.size || [...expectedSet].some(value => !sourceSet.has(value))) {
      throw new Error('Pilihan Code indikator ' + indicator.code + ' tidak konsisten dengan profil sumber.')
    }
  }
}

export default function TimkordikExcelImportDialog({
  open, roomId, year, authorized, profiles, onClose, onImported,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<TimkordikPreparedRow[]>([])
  const [errors, setErrors] = useState<string[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [result, setResult] = useState<ImportSummary | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [fileKey, setFileKey] = useState(0)

  const eligible = open && authorized && roomId === 30 && year === 2026
  const activeProfiles = useMemo(() => profiles.filter((profile): profile is TimkordikIndicatorProfile & ProfileInput =>
    typeof profile.id === 'string' &&
    typeof profile.code === 'string' &&
    Number(profile.room_id) === 30 &&
    Number(profile.profile_year) === 2026 &&
    profile.is_active === true &&
    profile.status === 'published',
  ), [profiles])
  const profileByCode = useMemo(() => {
    const map = new Map<string, TimkordikIndicatorProfile>()
    for (const profile of activeProfiles) map.set(String(profile.code), profile)
    return map
  }, [activeProfiles])
  const preview = useMemo(() => rows.slice(0, 20), [rows])
  const codeCounts = useMemo(() => {
    const counts = { code1: 0, code2: 0, code3: 0 }
    for (const row of rows) {
      for (const indicator of TIMKORDIK_INDICATORS) {
        const code = row.responses[indicator.code].code
        if (code === 1) counts.code1++
        else if (code === 2) counts.code2++
        else counts.code3++
      }
    }
    return counts
  }, [rows])

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
  const importDialogRef = useAccessibleDialog<HTMLElement>({open,onClose:close,lockScroll:true})

  const parseWorkbook = async (selectedFile: File) => {
    setFile(selectedFile)
    setRows([])
    setErrors([])
    setResult(null)
    setErrorMessage('')

    if (!eligible) {
      setErrorMessage('Pilih Tim Koordinasi Pendidikan dan tahun profil 2026 sebelum mengunggah workbook.')
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
    if (profileByCode.size !== 5 || TIMKORDIK_INDICATORS.some(item => !profileByCode.get(item.code)?.id)) {
      setErrorMessage('Lima master indikator Timkordik (30.1–30.5) harus aktif dan terbit pada profil 2026.')
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
      const profileSheet = workbook.getWorksheet('Profil')
      if (!profileSheet) throw new Error('Sheet Profil tidak ditemukan.')
      validateSourceProfileSheet(profileSheet)

      const worksheet = workbook.getWorksheet('Logbook')
      if (!worksheet) throw new Error('Sheet Logbook tidak ditemukan.')
      if (worksheet.rowCount > 5003 || worksheet.columnCount > 100) {
        throw new Error('Dimensi sheet Logbook melewati batas 5.003 baris atau 100 kolom.')
      }
      const header = worksheet.getRow(2)
      const columns = new Map<string, number[]>()
      for (let column = 1; column <= Math.min(worksheet.columnCount, 100); column++) {
        const label = cellText(header.getCell(column))
        if (!label) continue
        const key = normalizeExactHeader(label)
        const matches = columns.get(key) ?? []
        matches.push(column)
        columns.set(key, matches)
      }
      const indexes: Record<RequiredField, number> = {} as Record<RequiredField, number>
      for (const [key, aliases] of Object.entries(REQUIRED_HEADERS) as Array<[RequiredField, string[]]>) {
        const match = aliases.map(alias => columns.get(normalizeExactHeader(alias))).find(value => value?.length)
        if (!match?.length) throw new Error('Header wajib "' + aliases[0] + '" tidak ditemukan pada baris 2.')
        if (match.length > 1) throw new Error('Header "' + aliases[0] + '" muncul lebih dari satu kali.')
        indexes[key] = match[0]
      }
      const indicatorColumns = new Map<string, number>()
      for (const indicator of TIMKORDIK_INDICATORS) {
        const match = columns.get(normalizeExactHeader(indicator.header))
        if (!match?.length) throw new Error('Kolom indikator "' + indicator.header + '" tidak ditemukan.')
        if (match.length > 1) throw new Error('Kolom indikator "' + indicator.header + '" muncul lebih dari satu kali.')
        indicatorColumns.set(indicator.code, match[0])
      }

      const prepared: TimkordikPreparedRow[] = []
      const rowErrors: string[] = []
      const seenSourceNumbers = new Set<number>()
      const upper = Math.min(worksheet.rowCount, 5003)
      for (let excelRow = 3; excelRow <= upper; excelRow++) {
        const source = worksheet.getRow(excelRow)
        const hasData = [
          ...Object.values(indexes),
          ...indicatorColumns.values(),
        ].some(column => cellText(source.getCell(column)) !== '')
        if (!hasData) continue
        if (prepared.length + rowErrors.length >= MAX_ROWS) {
          rowErrors.push('Workbook melebihi batas ' + MAX_ROWS + ' catatan.')
          break
        }

        try {
          const sourceNo = positiveInteger(readCellValue(source.getCell(indexes.sourceNo)))
          if (sourceNo == null) throw new Error('No. harus berupa bilangan bulat positif.')
          if (seenSourceNumbers.has(sourceNo)) throw new Error('No. duplikat di dalam workbook.')
          seenSourceNumbers.add(sourceNo)

          const studentName = cellText(source.getCell(indexes.studentName))
          const profession = cellText(source.getCell(indexes.profession))
          const campus = cellText(source.getCell(indexes.campus))
          const rotation = cellText(source.getCell(indexes.rotation))
          const startDate = normalizeTimkordikDate(readCellValue(source.getCell(indexes.startDate)))
          const endDate = normalizeTimkordikDate(readCellValue(source.getCell(indexes.endDate)))
          const ci = cellText(source.getCell(indexes.ci))

          if (!studentName) throw new Error('Nama Mahasiswa kosong.')
          if (!profession) throw new Error('Profesi/Prodi kosong.')
          if (!campus) throw new Error('Kampus kosong.')
          if (!rotation) throw new Error('Stase kosong.')
          if (!startDate || startDate.slice(0, 4) !== '2026') throw new Error('Tanggal Mulai Praktek tidak valid atau di luar tahun 2026.')
          if (!endDate || endDate.slice(0, 4) !== '2026') throw new Error('Tanggal Selesai Praktek tidak valid atau di luar tahun 2026.')
          if (startDate > endDate) throw new Error('Tanggal Selesai Praktek mendahului Tanggal Mulai Praktek.')
          if (!ci) throw new Error('CI/Penanggung Jawab kosong.')
          if (studentName.length > 200 || profession.length > 180 || campus.length > 200 || rotation.length > 180 || ci.length > 180) {
            throw new Error('Panjang salah satu kolom identitas melebihi batas yang diizinkan.')
          }

          const responses = {} as TimkordikPreparedRow['responses']
          const formFields: Record<string, string> = {
            'No.': String(sourceNo),
            'Nama Mahasiswa': studentName,
            'Profesi/Prodi': profession,
            'Kampus': campus,
            'Stase Terakhir': rotation,
            'Tanggal Mulai Praktek': startDate,
            'Tanggal Selesai Praktek': endDate,
            'CI/Penanggung Jawab': ci,
          }
          for (const indicator of TIMKORDIK_INDICATORS) {
            const raw = cellText(source.getCell(indicatorColumns.get(indicator.code)!))
            const response = resolveTimkordikIndicatorOption(indicator.code, raw)
            if (!response) throw new Error('Pilihan indikator "' + indicator.header + '" tidak cocok dengan pilihan Code pada Profil.')
            responses[indicator.code] = response
            formFields[indicator.header] = raw
          }
          createTimkordikSubjectKey(sourceNo)
          prepared.push({ sourceRow: excelRow, sourceNo, startDate, endDate, formFields, responses })
        } catch (error) {
          rowErrors.push('Baris Excel ' + excelRow + ': ' + (error instanceof Error ? error.message : 'Data tidak valid.'))
        }
      }

      if (!prepared.length && !rowErrors.length) {
        throw new Error('Tidak ditemukan catatan Logbook mulai dari baris 3.')
      }
      setRows(prepared.sort((a, b) => a.sourceRow - b.sourceRow))
      setErrors(rowErrors)
      if (prepared.length && !rowErrors.length && prepared.length !== 196) {
        setErrorMessage('Pemeriksaan selesai: ' + prepared.length + ' catatan ditemukan. Jumlah berbeda dari 196 baris yang menjadi acuan workbook sumber.')
      }
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
    if (profileByCode.size !== 5) {
      setErrorMessage('Master indikator Timkordik berubah. Muat ulang AUREKA sebelum mengimpor.')
      return
    }
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
      const selectedProfiles = TIMKORDIK_INDICATORS.map(indicator => profileByCode.get(indicator.code)!)
      const items = rows.map(row => buildTimkordikImportPayload({
        row,
        fileName: file.name,
        fileSha256,
        profiles: selectedProfiles,
        userId: authData.user!.id,
      }))

      for (let start = 0; start < items.length; start += BATCH_SIZE) {
        const batch = items.slice(start, start + BATCH_SIZE)
        const { data, error } = await quality().rpc('import_timkordik_logbook_batch', { p_rows: batch })
        if (error) {
          if (/function .*import_timkordik_logbook_batch.*not found|schema cache/i.test(error.message)) {
            throw new Error('Fungsi impor Timkordik belum tersedia. Terapkan migrasi secure_timkordik_logbook_excel_import terlebih dahulu.')
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

  const maskName = (value: string): string => {
    const parts = value.trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return '-'
    if (parts.length === 1) return parts[0].slice(0, 1) + '•••'
    return parts[0].slice(0, 1) + '••• ' + parts[parts.length - 1].slice(0, 1) + '•••'
  }

  if (!open) return null
  return (
    <div className="aqBack" role="presentation" onClick={event => { if (event.target === event.currentTarget) close() }}>
      <section ref={importDialogRef} tabIndex={-1} className="aqDrawer aqWide aqTimkordikImport"
        role="dialog" aria-modal="true" aria-labelledby="aqTimkordikImportTitle">
        <style>{'.aqTimkordikImport .aqBody{display:grid;align-content:start;gap:13px}.aqTimkordikImport .tkIntro{font-size:12px;line-height:1.55;color:var(--muted)}.aqTimkordikImport .tkUpload{display:grid;gap:8px;padding:15px;border:1px dashed var(--line);border-radius:14px;background:#fff}.aqTimkordikImport .tkUpload input{width:100%;font-size:12px}.aqTimkordikImport .tkStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.aqTimkordikImport .tkStat{padding:11px;background:#fff;border:1px solid var(--line);border-radius:12px;min-width:0}.aqTimkordikImport .tkStat span{display:block;color:var(--muted);font-size:11px}.aqTimkordikImport .tkStat strong{display:block;margin-top:4px;font-size:19px;overflow-wrap:anywhere}.aqTimkordikImport .tkMessage{padding:11px 13px;border-radius:12px;font-size:11px;line-height:1.55;white-space:pre-wrap;overflow-wrap:anywhere}.aqTimkordikImport .tkError{background:#fff0ef;color:#8b2822}.aqTimkordikImport .tkSuccess{background:#eaf8ef;color:#206443}.aqTimkordikImport .tkTable{overflow:auto;max-height:320px;border:1px solid var(--line);border-radius:12px;background:#fff}.aqTimkordikImport table{width:100%;border-collapse:collapse;font-size:11px}.aqTimkordikImport th,.aqTimkordikImport td{padding:8px 10px;text-align:left;border-bottom:1px solid var(--line);vertical-align:top}.aqTimkordikImport th{position:sticky;top:0;background:#f7faf8;white-space:nowrap}.aqTimkordikImport .tkPrivacy{font-size:11px;color:var(--muted);line-height:1.5}@media(max-width:600px){.aqTimkordikImport .tkStats{grid-template-columns:repeat(2,minmax(0,1fr))}}'}</style>
        <div className="aqDHead">
          <div>
            <div className="eyebrow">Audit Indikator Mutu · Impor Terarah</div>
            <h4 id="aqTimkordikImportTitle">Unggah workbook Tim Koordinasi Pendidikan</h4>
            <p>Lima profil indikator 30.1–30.5 · Tahun 2026 · Room 30</p>
          </div>
          <button type="button" className="aqClose" aria-label="Tutup dialog impor" disabled={parsing || importing} onClick={close}>×</button>
        </div>
        <div className="aqBody">
          <div className="tkIntro">
            Pilih workbook .xlsx yang berisi sheet <strong>Profil</strong> dan <strong>Logbook</strong>. Setiap baris mahasiswa menjadi satu catatan aktivitas dengan lima respons indikator. Pilihan kode dipastikan cocok terhadap profil sumber; pratinjau menyamarkan identitas mahasiswa.
          </div>
          <div className="tkUpload">
            <label htmlFor="aq-timkordik-workbook"><strong>Unggah workbook .xlsx</strong></label>
            <input id="aq-timkordik-workbook" key={fileKey} type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={parsing || importing || !authorized}
              onChange={event => {
                const selected = event.target.files?.[0]
                if (selected) void parseWorkbook(selected)
                event.currentTarget.value = ''
              }} />
            <div className="tkPrivacy">Maksimal 15 MB dan 500 catatan. Nomor sumber mahasiswa menjadi kunci idempotensi. Data identitas hanya dikirim ke basis data setelah tombol Impor ditekan; tidak ada atribusi CI otomatis ke direktori staf.</div>
          </div>

          {parsing && <div className="tkMessage">Membaca Profil dan Logbook serta memeriksa setiap baris…</div>}
          {errorMessage && <div className="tkMessage tkError" role="alert">{errorMessage}</div>}
          {errors.length > 0 && <div className="tkMessage tkError" role="alert">
            <strong>Impor diblokir sampai kesalahan berikut diperbaiki:</strong>
            {'\n'}{errors.slice(0, 30).join('\n')}
            {errors.length > 30 ? '\n… dan ' + (errors.length - 30) + ' kesalahan lainnya.' : ''}
          </div>}

          {rows.length > 0 && <>
            <div className="tkStats">
              <div className="tkStat"><span>Catatan mahasiswa</span><strong>{rows.length}</strong></div>
              <div className="tkStat"><span>Respons · Code 1</span><strong>{codeCounts.code1}</strong></div>
              <div className="tkStat"><span>Respons · Code 2</span><strong>{codeCounts.code2}</strong></div>
              <div className="tkStat"><span>Respons · Code 3</span><strong>{codeCounts.code3}</strong></div>
            </div>
            <div className="tkMessage">
              <strong>Pratinjau berhasil.</strong> {rows.length} catatan dan {rows.length * 5} respons indikator lolos pemeriksaan lokal. Catatan disimpan dengan grain activity dan status Siap Ditinjau. Unggah ulang nomor sumber yang sama akan dilewati.
            </div>
            <div className="tkTable">
              <table>
                <thead><tr><th>No.</th><th>Mahasiswa</th><th>Prodi</th><th>Kampus</th><th>Stase</th><th>Mulai</th><th>Selesai</th><th>Kode 30.1–30.5</th></tr></thead>
                <tbody>{preview.map(row => <tr key={row.sourceNo}>
                  <td>{row.sourceNo}</td>
                  <td>{maskName(row.formFields['Nama Mahasiswa'])}</td>
                  <td>{row.formFields['Profesi/Prodi']}</td>
                  <td>{row.formFields['Kampus']}</td>
                  <td>{row.formFields['Stase Terakhir']}</td>
                  <td>{row.startDate}</td>
                  <td>{row.endDate}</td>
                  <td>{TIMKORDIK_INDICATORS.map(indicator => row.responses[indicator.code].code).join(' · ')}</td>
                </tr>)}</tbody>
              </table>
            </div>
            {rows.length > preview.length && <div className="tkPrivacy">Menampilkan {preview.length} dari {rows.length} catatan; seluruh catatan yang lolos validasi akan diproses.</div>}
          </>}

          {result && <div className="tkMessage tkSuccess" role="status">
            <strong>Impor selesai.</strong> Diterima: {result.received_count ?? 0}; catatan baru: {result.imported_count ?? 0}; sudah ada dan dilewati: {result.skipped_existing_count ?? 0}.
          </div>}
        </div>
        <div className="aqFoot">
          <span className="tkPrivacy">Status setelah impor: Siap Ditinjau. Validasi tetap dilakukan oleh validator yang berwenang.</span>
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
