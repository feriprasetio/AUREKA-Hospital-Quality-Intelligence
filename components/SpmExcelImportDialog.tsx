'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import type { SpmSourceSummary } from '@/lib/aureka/spm-engine'
import {
  prepareSpmExcelImport,
  type SpmImportPreview,
  type SpmImportProfile,
  type SpmPreparedMeasurement,
} from '@/lib/aureka/spm-excel-import'

type ExistingMeasurement = {
  indicator_id: string
  period_month: number
}

type Props = {
  open: boolean
  year: number
  indicators: SpmImportProfile[]
  measurements: ExistingMeasurement[]
  sourceSummary: SpmSourceSummary | null
  onClose: () => void
  onImported: () => void | Promise<void>
}

type ImportResult = {
  written: number
  inserted: number
  updated: number
}

const MAX_FILE_BYTES = 15 * 1024 * 1024
const MAX_ROWS = 5000
const MAX_COLUMNS = 120
const BATCH_SIZE = 100

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des']

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

function measurementKey(indicatorId: string, month: number) {
  return indicatorId + ':' + month
}

function inputSummary(row: SpmPreparedMeasurement) {
  const v = row.input_json
  if (v.value != null) return 'Nilai ' + v.value
  if (v.score_mean != null) return 'Skor ' + v.score_mean + ' · n=' + v.respondents
  if (v.denominator != null) return 'N=' + v.numerator + ' · D=' + v.denominator
  return 'Numerator=' + v.numerator + ' · denominator tertaut'
}

export default function SpmExcelImportDialog({
  open, year, indicators, measurements, sourceSummary, onClose, onImported,
}: Props) {
  const [file, setFile] = useState<File | null>(null)
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [preview, setPreview] = useState<SpmImportPreview | null>(null)
  const [error, setError] = useState('')
  const [result, setResult] = useState<ImportResult | null>(null)
  const [progress, setProgress] = useState('')

  const existingKeys = useMemo(() => new Set(
    measurements.map(row => measurementKey(String(row.indicator_id), Number(row.period_month))),
  ), [measurements])

  const newCount = preview?.rows.filter(row => !existingKeys.has(measurementKey(row.indicator_id, row.period_month))).length ?? 0
  const updateCount = preview ? preview.rows.length - newCount : 0

  const reset = useCallback(() => {
    setFile(null)
    setPreview(null)
    setError('')
    setResult(null)
    setProgress('')
  }, [])

  const close = useCallback(() => {
    if (parsing || importing) return
    reset()
    onClose()
  }, [parsing, importing, reset, onClose])

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, close])

  if (!open) return null

  const parseFile = async (selected: File) => {
    setFile(selected)
    setPreview(null)
    setResult(null)
    setError('')
    setProgress('')

    if (!/\.xlsx$/i.test(selected.name)) {
      setError('Pilih file .xlsx. Format .xls, .xlsm, dan .csv tidak diterima.')
      return
    }
    if (selected.size <= 0 || selected.size > MAX_FILE_BYTES) {
      setError('Ukuran workbook harus lebih dari 0 dan tidak melebihi 15 MB.')
      return
    }

    setParsing(true)
    try {
      const ExcelJSModule = await import('exceljs-hardened')
      const ExcelJS: any = (ExcelJSModule as any).default ?? ExcelJSModule
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await selected.arrayBuffer())
      const worksheet = workbook.getWorksheet('Logbook')
      if (!worksheet) throw new Error('Sheet "Logbook" tidak ditemukan. Workbook harus memiliki sheet Logbook.')
      if (worksheet.rowCount > MAX_ROWS) throw new Error('Sheet Logbook melebihi batas ' + MAX_ROWS + ' baris.')
      if (worksheet.columnCount > MAX_COLUMNS) throw new Error('Sheet Logbook melebihi batas ' + MAX_COLUMNS + ' kolom.')

      const grid: unknown[][] = []
      for (let rowNumber = 1; rowNumber <= worksheet.rowCount; rowNumber++) {
        const row = worksheet.getRow(rowNumber)
        const values: unknown[] = []
        for (let column = 1; column <= worksheet.columnCount; column++) {
          values.push(cellValue(row.getCell(column)))
        }
        grid.push(values)
      }

      const prepared = prepareSpmExcelImport(grid, indicators, year, selected.name)
      const profileById = new Map(indicators.map(profile => [profile.id, profile]))
      const eligibleRows = prepared.rows.filter(row => {
        const profile = profileById.get(row.indicator_id)
        if (profile?.source_mode !== 'quality_denominator_linked') return true
        const denominator = sourceSummary?.falls?.find(item => Number(item.month) === row.period_month)?.denominator
        if (denominator != null && denominator > 0 && row.input_json.numerator > denominator) {
          prepared.warnings.push(
            row.code + ' bulan ' + MONTH_NAMES[row.period_month - 1]
            + ': numerator ' + row.input_json.numerator
            + ' melebihi denominator Indikator Mutu ' + denominator
            + '; nilai ini dilewati agar hasil tidak berstatus tidak valid.',
          )
          return false
        }
        return true
      })
      prepared.rows = eligibleRows
      if (!prepared.rows.length) {
        throw new Error('Tidak ada nilai yang lolos pemeriksaan sumber. Periksa kecocokan tahun dan denominator Indikator Mutu.')
      }
      setPreview(prepared)
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String((cause as any)?.message ?? cause)
      setError(message || 'Workbook belum dapat dibaca. Periksa file dan struktur sheet Logbook.')
    } finally {
      setParsing(false)
    }
  }

  const saveImport = async () => {
    if (!preview?.rows.length || importing || result) return
    setImporting(true)
    setError('')
    setProgress('Memverifikasi sesi dan hak akses…')
    let written = 0
    let inserted = 0
    let updated = 0
    try {
      const { data: authData, error: authError } = await aurekaSupabase.auth.getUser()
      if (authError || !authData.user?.id) throw authError || new Error('Sesi login tidak tersedia. Silakan masuk kembali.')

      const batches: SpmPreparedMeasurement[][] = []
      for (let index = 0; index < preview.rows.length; index += BATCH_SIZE) {
        batches.push(preview.rows.slice(index, index + BATCH_SIZE))
      }

      for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
        const batch = batches[batchIndex]
        setProgress('Menyimpan batch ' + (batchIndex + 1) + ' dari ' + batches.length + '…')
        const payload = batch.map(row => ({
          indicator_id: row.indicator_id,
          profile_year: year,
          period_month: row.period_month,
          input_json: row.input_json,
          status: 'submitted',
          notes: row.notes,
          updated_by: authData.user!.id,
          updated_at: new Date().toISOString(),
        }))
        const { error: saveError } = await aurekaSupabase
          .schema('aureka_quality')
          .from('spm_monthly_measurements')
          .upsert(payload, { onConflict: 'indicator_id,profile_year,period_month' })
        if (saveError) throw new Error('Batch ' + (batchIndex + 1) + ' gagal disimpan: ' + saveError.message)

        for (const row of batch) {
          if (existingKeys.has(measurementKey(row.indicator_id, row.period_month))) updated++
          else inserted++
        }
        written += batch.length
      }

      setResult({ written, inserted, updated })
      setProgress('Impor berhasil disimpan.')
      await onImported()
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String((cause as any)?.message ?? cause)
      setError(
        written > 0
          ? 'Sebagian impor tersimpan (' + written + ' dari ' + preview.rows.length + ' baris). ' + message + ' Muat ulang SPM sebelum melanjutkan impor berikutnya.'
          : message,
      )
      if (written > 0) await onImported()
    } finally {
      setImporting(false)
    }
  }

  return (
    <div
      className="spmOverlay"
      role="presentation"
      onMouseDown={event => { if (event.target === event.currentTarget) close() }}
    >
      <section className="spmDialog spmConfigDialog spmImportDialog" role="dialog" aria-modal="true" aria-labelledby="spm-import-title">
        <header>
          <div>
            <span>Impor data historis SPM · Tahun tujuan {year}</span>
            <h2 id="spm-import-title">Unggah workbook SPM (.xlsx)</h2>
            <small>File diproses dari sheet Logbook; data yang disimpan hanya nilai numerik bulanan yang berhasil dipetakan.</small>
          </div>
          <button type="button" onClick={close} aria-label="Tutup" disabled={parsing || importing}>×</button>
        </header>

        {!result && (
          <>
            <div className="spmImportInstructions">
              <strong>Format workbook yang didukung</strong>
              <p>Gunakan workbook dengan sheet <b>Logbook</b>, berisi blok kolom No., Indikator, Parameter, serta Januari–Desember. Sheet Report dan Dashboard hanya rekap dan tidak dijadikan sumber impor.</p>
              <p>Pastikan tahun tujuan di SPM sudah benar sebelum mengunggah. Bulan kosong tetap dianggap belum ada data. Nilai nol tetap dibaca sebagai nol.</p>
            </div>

            <label className="spmImportFile">
              <strong>Pilih workbook .xlsx</strong>
              <input
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                disabled={parsing || importing}
                onChange={event => {
                  const selected = event.target.files?.[0]
                  if (selected) void parseFile(selected)
                  event.currentTarget.value = ''
                }}
              />
              {file && <small>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</small>}
              <small>Maksimal 15 MB, 5.000 baris, dan 120 kolom.</small>
            </label>
          </>
        )}

        {parsing && <div className="spmNotice">Membaca workbook dan mencocokkan definisi indikator…</div>}
        {error && <div className="spmNotice warning" role="alert">{error}</div>}
        {progress && <div className="spmNotice">{progress}</div>}

        {preview && !result && (
          <>
            <div className="spmImportStats">
              <article><span>Nilai bulanan siap</span><strong>{preview.rows.length.toLocaleString('id-ID')}</strong></article>
              <article><span>Indikator cocok</span><strong>{preview.matched_indicators.length}</strong></article>
              <article><span>Data baru</span><strong>{newCount.toLocaleString('id-ID')}</strong></article>
              <article><span>Data diperbarui</span><strong>{updateCount.toLocaleString('id-ID')}</strong></article>
            </div>

            {(preview.linked_indicators_skipped > 0 || preview.ignored_unmatched_rows > 0 || preview.duplicate_rows_skipped > 0) && (
              <div className="spmImportNote">
                <strong>Catatan pemetaan</strong>
                <ul>
                  {preview.linked_indicators_skipped > 0 && <li>{preview.linked_indicators_skipped} baris indikator yang terhubung otomatis ke Indikator Mutu dilewati.</li>}
                  {preview.ignored_unmatched_rows > 0 && <li>{preview.ignored_unmatched_rows} baris atau blok yang tidak cocok dengan master SPM tidak diimpor.</li>}
                  {preview.duplicate_rows_skipped > 0 && <li>{preview.duplicate_rows_skipped} nilai duplikat dilewati; nilai pertama yang ditemukan dipakai.</li>}
                </ul>
              </div>
            )}

            {preview.warnings.length > 0 && (
              <div className="spmImportWarnings">
                <strong>Peringatan yang perlu ditinjau ({preview.warnings.length})</strong>
                <ul>{preview.warnings.map((warning,index) => <li key={index}>{warning}</li>)}</ul>
              </div>
            )}

            <div className="spmImportPreview">
              <div><strong>Pratinjau nilai</strong><span>Menampilkan maksimal 12 baris pertama.</span></div>
              <div className="spmImportTableScroll">
                <table>
                  <thead><tr><th>Kode</th><th>Indikator</th><th>Bulan</th><th>Nilai sumber</th><th>Baris XLSX</th><th>Operasi</th></tr></thead>
                  <tbody>
                    {preview.rows.slice(0,12).map((row,index) => {
                      const monthName = MONTH_NAMES[row.period_month - 1]
                      const exists = existingKeys.has(measurementKey(row.indicator_id,row.period_month))
                      return <tr key={row.indicator_id + ':' + row.period_month + ':' + index}>
                        <td><code>{row.code}</code></td>
                        <td><span>{row.title}</span><small>{row.group_name}</small></td>
                        <td>{monthName}</td>
                        <td>{inputSummary(row)}</td>
                        <td>{row.source_row}</td>
                        <td>{exists ? 'Perbarui' : 'Baru'}</td>
                      </tr>
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            <p className="spmHelp">
              Impor akan menulis ke tahun {year}. Bila indikator dan bulan sudah memiliki data, nilai lama akan diganti oleh nilai workbook. Status data hasil impor menjadi Menunggu Verifikasi.
            </p>
          </>
        )}

        {result && (
          <div className="spmImportSuccess">
            <strong>Impor berhasil disimpan.</strong>
            <div><span>Total tersimpan</span><b>{result.written.toLocaleString('id-ID')}</b></div>
            <div><span>Data baru</span><b>{result.inserted.toLocaleString('id-ID')}</b></div>
            <div><span>Data diperbarui</span><b>{result.updated.toLocaleString('id-ID')}</b></div>
            <p>Nilai sudah dimuat ulang pada SPM tahun {year}. Status pengukuran hasil impor adalah Menunggu Verifikasi.</p>
          </div>
        )}

        <footer>
          <button type="button" className="spmSecondary" onClick={close} disabled={parsing || importing}>
            {result ? 'Tutup' : 'Batal'}
          </button>
          {!result && (
            <button type="button" className="spmPrimary" onClick={() => void saveImport()} disabled={!preview?.rows.length || parsing || importing}>
              {importing ? 'Mengimpor…' : 'Impor & perbarui data'}
            </button>
          )}
        </footer>
      </section>
    </div>
  )
}
