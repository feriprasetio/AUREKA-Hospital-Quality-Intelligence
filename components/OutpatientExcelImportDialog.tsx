'use client'

import { useEffect, useMemo, useState } from 'react'
import { parseOutpatientWorkbook, type OutpatientWorkbookParseResult } from '@/lib/aureka/outpatient-excel-import'
import { aurekaSupabase } from '@/lib/aureka/supabase'

const sb = aurekaSupabase
const quality = () => sb.schema('aureka_quality')
const MAX_FILE_BYTES = 15 * 1024 * 1024
const BATCH_SIZE = 250

type ImportSummary = { received: number; imported: number; skipped: number; batches: number }
type Props = {
  open: boolean
  roomId: number | null
  year: number
  authorized: boolean
  onClose: () => void
  onImported: (summary: { imported: number; skipped: number; received: number }) => void | Promise<void>
}

function formatDate(value: string): string {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return match ? match[3] + '/' + match[2] + '/' + match[1] : value
}

export default function OutpatientExcelImportDialog({
  open, roomId, year, authorized, onClose, onImported,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [parsed, setParsed] = useState<OutpatientWorkbookParseResult | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [progress, setProgress] = useState(0)
  const [summary, setSummary] = useState<ImportSummary | null>(null)
  const [partial, setPartial] = useState<ImportSummary | null>(null)
  const [errorMessage, setErrorMessage] = useState('')
  const [inputKey, setInputKey] = useState(0)

  const eligible = useMemo(
    () => open && authorized && Number(roomId) === 11 && year === 2026,
    [open, authorized, roomId, year],
  )

  useEffect(() => {
    if (!open) return
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !parsing && !importing) close()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, parsing, importing])

  const reset = () => {
    setFile(null)
    setParsed(null)
    setParsing(false)
    setImporting(false)
    setProgress(0)
    setSummary(null)
    setPartial(null)
    setErrorMessage('')
    setInputKey(value => value + 1)
  }

  const close = () => {
    if (parsing || importing) return
    reset()
    onClose()
  }

  const parseFile = async (selectedFile: File) => {
    setFile(selectedFile)
    setParsed(null)
    setSummary(null)
    setPartial(null)
    setErrorMessage('')

    if (!eligible) {
      setErrorMessage('Unggah hanya tersedia untuk Instalasi Rawat Jalan tahun 2026 dan akun yang berwenang.')
      return
    }
    if (!/\.xlsx$/i.test(selectedFile.name)) {
      setErrorMessage('Pilih file .xlsx. File .xls, .xlsm, .csv, atau PDF tidak didukung.')
      return
    }
    if (selectedFile.size <= 0 || selectedFile.size > MAX_FILE_BYTES) {
      setErrorMessage('Ukuran file harus lebih besar dari 0 dan tidak melebihi 15 MB.')
      return
    }

    setParsing(true)
    try {
      const result = await parseOutpatientWorkbook(await selectedFile.arrayBuffer(), year)
      setParsed(result)
    } catch (error) {
      setParsed(null)
      setErrorMessage(error instanceof Error ? error.message : 'Workbook tidak dapat dibaca.')
    } finally {
      setParsing(false)
    }
  }

  const importRows = async () => {
    if (!file || !parsed?.rows.length || !eligible || !authorized || importing) return
    setImporting(true)
    setSummary(null)
    setPartial(null)
    setProgress(0)
    setErrorMessage('')

    const running: ImportSummary = { received: 0, imported: 0, skipped: 0, batches: 0 }
    try {
      const { data: authData, error: authError } = await sb.auth.getUser()
      if (authError) throw authError
      if (!authData.user) throw new Error('Sesi login tidak ditemukan. Masuk ke AUREKA lalu ulangi impor.')

      for (let offset = 0; offset < parsed.rows.length; offset += BATCH_SIZE) {
        const batch = parsed.rows.slice(offset, offset + BATCH_SIZE).map(row => ({
          record_date: row.recordDate,
          clinic: row.clinic,
          doctor: row.doctor,
          waiting_minutes: row.waitingMinutes,
          source_row: row.sourceRow,
          source_column: row.sourceColumn,
        }))
        const { data, error } = await quality().rpc('import_outpatient_logbook_excel', {
          p_profile_year: year,
          p_source_workbook: file.name,
          p_rows: batch,
        })
        if (error) {
          if (/function .*import_outpatient_logbook_excel.*not found|schema cache/i.test(error.message)) {
            throw new Error('Fungsi impor Rawat Jalan belum tersedia di database. Terapkan migrasi AUREKA Rawat Jalan sebelum mengunggah workbook.')
          }
          throw new Error(error.message)
        }

        const result = (data ?? {}) as Record<string, unknown>
        const received = Number(result.received_count ?? batch.length)
        const imported = Number(result.imported_count ?? 0)
        const skipped = Number(result.skipped_existing_count ?? 0)
        if (received !== batch.length || imported + skipped !== received) {
          throw new Error('Ringkasan impor dari server tidak konsisten pada batch ' + (running.batches + 1) + '.')
        }

        running.received += received
        running.imported += imported
        running.skipped += skipped
        running.batches += 1
        setPartial({ ...running })
        setProgress(Math.round(running.received / parsed.rows.length * 100))
      }

      if (running.received !== parsed.rows.length || running.imported + running.skipped !== running.received) {
        throw new Error('Jumlah hasil impor tidak sesuai dengan jumlah observasi yang diparsing.')
      }
      setSummary({ ...running })
      await onImported({ imported: running.imported, skipped: running.skipped, received: running.received })
    } catch (error) {
      setPartial({ ...running })
      setErrorMessage(
        (error instanceof Error ? error.message : 'Impor workbook gagal.') +
        (running.imported > 0 ? ' Sebagian data sudah tersimpan; jangan unggah ulang sebelum memeriksa rekap hasil.' : ''),
      )
      if (running.imported > 0) await onImported({ imported: running.imported, skipped: running.skipped, received: running.received })
    } finally {
      setImporting(false)
    }
  }

  if (!open) return null

  return (
    <div className="opxBack" role="presentation" onMouseDown={event => { if (event.target === event.currentTarget && !parsing && !importing) close() }}>
      <section className="opxDialog" role="dialog" aria-modal="true" aria-labelledby="opxTitle" aria-describedby="opxDescription">
        <style>{[
          ".opxBack{position:fixed;inset:0;z-index:10020;display:flex;align-items:center;justify-content:center;padding:18px;background:rgba(12,24,19,.48);backdrop-filter:blur(7px);overflow-y:auto}",
          ".opxDialog{width:min(920px,100%);max-height:min(92dvh,900px);display:flex;flex-direction:column;min-width:0;background:#fff;border:1px solid #dce6df;border-radius:20px;box-shadow:0 24px 80px rgba(8,29,19,.26);overflow:hidden}",
          ".opxHead{padding:20px 24px 16px;border-bottom:1px solid #e6ece8;display:flex;align-items:flex-start;justify-content:space-between;gap:16px}",
          ".opxEyebrow{font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#668175;font-weight:850}",
          ".opxHead h3{font-size:21px;line-height:1.2;letter-spacing:-.035em;margin:5px 0 6px;color:#18362a}",
          ".opxHead p{margin:0;color:#66786f;font-size:11px;line-height:1.5;max-width:710px}",
          ".opxClose{width:34px;height:34px;border:1px solid #e0e8e3;border-radius:10px;background:#fff;font-size:20px;color:#4c6257;flex:none}",
          ".opxBody{padding:18px 24px;overflow:auto;display:grid;gap:14px;align-content:start}",
          ".opxUpload{padding:16px;border:1px dashed #c5d5cc;background:#f8fbf9;border-radius:14px;display:grid;gap:8px}",
          ".opxUpload label{font-size:11px;font-weight:800;color:#324b3e}",
          ".opxUpload input{font-size:12px;max-width:100%}",
          ".opxHint{font-size:10px;color:#74837b;line-height:1.5}",
          ".opxStats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}",
          ".opxStat{padding:12px;border:1px solid #e3ebe6;border-radius:12px;background:#fff;min-width:0}",
          ".opxStat span{display:block;font-size:10px;color:#718078}",
          ".opxStat strong{display:block;font-size:20px;margin-top:4px;color:#1d4433;overflow-wrap:anywhere}",
          ".opxPreview{border:1px solid #e5ece8;border-radius:13px;overflow:hidden}",
          ".opxPreviewHead{padding:10px 13px;background:#f5f8f6;font-size:11px;font-weight:850;color:#29483a}",
          ".opxPreviewScroll{max-height:260px;overflow:auto}",
          ".opxPreview table{border-collapse:collapse;width:100%;font-size:10px}",
          ".opxPreview th,.opxPreview td{padding:8px 10px;text-align:left;border-top:1px solid #edf1ee;white-space:nowrap}",
          ".opxPreview th{font-weight:850;color:#63746b;background:#fbfcfb;position:sticky;top:0}",
          ".opxWarning,.opxError,.opxSuccess{padding:11px 13px;border-radius:11px;font-size:10px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere}",
          ".opxWarning{background:#fff8e7;color:#775a16;border:1px solid #f0e1ad}",
          ".opxError{background:#fff0ef;color:#8c2c25;border:1px solid #f0cac6}",
          ".opxSuccess{background:#edf8f0;color:#22623f;border:1px solid #cde8d4}",
          ".opxProgress{height:7px;background:#e8eee9;border-radius:99px;overflow:hidden}",
          ".opxProgress>span{display:block;height:100%;background:#34855e;transition:width .2s ease}",
          ".opxFoot{padding:14px 24px;border-top:1px solid #e6ece8;background:#fafcfb;display:flex;justify-content:space-between;align-items:center;gap:10px}",
          ".opxFoot small{font-size:10px;color:#748078;line-height:1.45}",
          ".opxActions{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}",
          ".opxBtn{min-height:38px;border:1px solid #d6e1da;background:#fff;border-radius:10px;padding:8px 12px;color:#355044;font-size:11px;font-weight:800}",
          ".opxBtn.primary{background:#236746;border-color:#236746;color:#fff}",
          ".opxBtn:disabled{opacity:.5;cursor:not-allowed}",
          "@media(max-width:650px){.opxBack{padding:8px}.opxDialog{max-height:96dvh;border-radius:14px}.opxHead,.opxBody,.opxFoot{padding-left:14px;padding-right:14px}.opxStats{grid-template-columns:repeat(2,minmax(0,1fr))}.opxFoot{align-items:flex-start;flex-direction:column}.opxActions{width:100%;justify-content:stretch}.opxActions .opxBtn{flex:1}}"
        ].join('')}</style>
        <header className="opxHead">
          <div>
            <div className="opxEyebrow">AUREKA · Impor sumber data</div>
            <h3 id="opxTitle">Unggah workbook Instalasi Rawat Jalan</h3>
            <p id="opxDescription">Sistem membaca sheet Logbook dalam format matriks: baris klinik, baris dokter, dan kolom tanggal. Setiap sel waktu tunggu numerik diimpor sebagai satu catatan dokter-hari.</p>
          </div>
          <button type="button" className="opxClose" aria-label="Tutup dialog" disabled={parsing || importing} onClick={close}>×</button>
        </header>
        <div className="opxBody">
          <div className="opxUpload">
            <label htmlFor="opxFile">Pilih workbook (.xlsx)</label>
            <input
              key={inputKey}
              id="opxFile"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              disabled={parsing || importing}
              onChange={event => {
                const selectedFile = event.target.files?.[0]
                if (selectedFile) void parseFile(selectedFile)
              }}
            />
            <div className="opxHint">Format yang dikenali: sheet <b>Logbook</b>, tanggal pada baris 1 mulai kolom B, nama klinik/dokter pada kolom A. Maksimal 15 MB dan 20.000 observasi per workbook. Sheet Dashboard dan rumus ringkasannya tidak digunakan sebagai sumber impor.</div>
          </div>

          {parsing && <div className="opxWarning">Sedang membaca workbook dan memvalidasi struktur Logbook…</div>}
          {errorMessage && <div className="opxError" role="alert">{errorMessage}</div>}

          {parsed && <div className="opxStats" aria-label="Ringkasan hasil pembacaan workbook">
            <div className="opxStat"><span>Observasi terbaca</span><strong>{parsed.rows.length.toLocaleString('id-ID')}</strong></div>
            <div className="opxStat"><span>Klinik</span><strong>{parsed.clinics.length}</strong></div>
            <div className="opxStat"><span>Dokter</span><strong>{parsed.doctors.length}</strong></div>
            <div className="opxStat"><span>Tanggal</span><strong>{parsed.dates.length}</strong></div>
          </div>}

          {parsed && <div className="opxPreview">
            <div className="opxPreviewHead">Pratinjau {Math.min(12, parsed.rows.length)} dari {parsed.rows.length.toLocaleString('id-ID')} observasi</div>
            <div className="opxPreviewScroll">
              <table><thead><tr><th>Tanggal</th><th>Klinik</th><th>Dokter</th><th>Waktu tunggu (menit)</th></tr></thead>
                <tbody>{parsed.rows.slice(0, 12).map((row, index) => <tr key={row.recordDate + row.clinic + row.doctor + index}>
                  <td>{formatDate(row.recordDate)}</td><td>{row.clinic}</td><td>{row.doctor}</td><td>{row.waitingMinutes.toLocaleString('id-ID')}</td>
                </tr>)}</tbody>
              </table>
            </div>
          </div>}

          {parsed && parsed.invalidCellCount > 0 && <div className="opxWarning">
            {parsed.invalidCellCount.toLocaleString('id-ID')} sel berisi nilai kosong/tidak valid/non-negatif dan dilewati. Observasi yang terbaca tetap dapat diimpor; rincian awal:
            {'\n'}{parsed.warnings.slice(0, 8).join('\n')}
          </div>}
          {parsed && summary && <div className="opxSuccess" role="status">
            Impor selesai: {summary.imported.toLocaleString('id-ID')} catatan baru disimpan, {summary.skipped.toLocaleString('id-ID')} duplikasi dilewati, dari {summary.received.toLocaleString('id-ID')} observasi.
          </div>}
          {partial && importing && <div className="opxWarning">Progres: {partial.received.toLocaleString('id-ID')} dari {parsed?.rows.length.toLocaleString('id-ID')} observasi telah diproses.</div>}
          {partial && !importing && !summary && partial.imported > 0 && <div className="opxWarning">Impor parsial: {partial.imported.toLocaleString('id-ID')} data tersimpan, {partial.skipped.toLocaleString('id-ID')} duplikasi dilewati. Periksa daftar logbook sebelum melanjutkan.</div>}
          {importing && <div className="opxProgress" aria-label={'Progres impor ' + progress + '%'}><span style={{ width: progress + '%' }} /></div>}
        </div>
        <footer className="opxFoot">
          <small>{importing ? 'Jangan tutup jendela selama proses impor berjalan.' : 'Impor ulang tidak menggandakan observasi yang sudah ada.'}</small>
          <div className="opxActions">
            <button type="button" className="opxBtn" disabled={parsing || importing} onClick={close}>Batal</button>
            {summary
              ? <button type="button" className="opxBtn primary" onClick={close}>Selesai</button>
              : <button type="button" className="opxBtn primary" disabled={!parsed?.rows.length || parsing || importing || !authorized} onClick={() => void importRows()}>
                  {importing ? 'Mengimpor… ' + progress + '%' : 'Impor ke logbook'}
                </button>}
          </div>
        </footer>
      </section>
    </div>
  )
}
