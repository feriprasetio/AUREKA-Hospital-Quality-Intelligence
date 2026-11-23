'use client'

import { useEffect, useMemo, useState } from 'react'
import { normalizeExactHeader } from '@/lib/aureka/excel-paste'
import {
  readInteractiveExcelHeaderMapping,
  saveInteractiveExcelHeaderMapping,
} from '@/lib/aureka/interactive-header-mapping'

export type InlineWorkbookField = {
  fieldKey: string
  label: string
  aliases: readonly string[]
  required?: boolean
}

type HeaderColumn = { index: number; letter: string; header: string; occurrence: number }
type HeaderSample = { rowNumber: number; columns: HeaderColumn[] }
type SheetSample = { name: string; headers: HeaderSample[] }

function columnLetter(column: number): string {
  let result = ''
  for (let n = column; n > 0; n = Math.floor((n - 1) / 26)) {
    result = String.fromCharCode(65 + ((n - 1) % 26)) + result
  }
  return result
}

function readHeaderValue(cell: any): string {
  const raw = cell?.value
  if (raw == null) return ''
  if (typeof raw === 'object') {
    if (typeof raw.text === 'string') return raw.text.trim().slice(0, 140)
    if (Array.isArray(raw.richText)) return raw.richText.map((item: any) => String(item.text ?? '')).join('').trim().slice(0, 140)
    if (raw.result != null) return String(raw.result).trim().slice(0, 140)
    return ''
  }
  return String(raw).trim().slice(0, 140)
}

function headerColumns(row: any): HeaderColumn[] {
  const seen = new Map<string, number>()
  const count = Math.min(160, Number(row?.cellCount ?? row?.actualCellCount ?? 0))
  const result: HeaderColumn[] = []
  for (let index = 1; index <= count; index++) {
    const header = readHeaderValue(row.getCell(index))
    if (!header) continue
    const key = normalizeExactHeader(header)
    const occurrence = (seen.get(key) ?? 0) + 1
    seen.set(key, occurrence)
    result.push({ index, letter: columnLetter(index), header, occurrence })
  }
  return result
}

function autoSelection(columns: HeaderColumn[], field: InlineWorkbookField): string {
  const candidateHeaders = new Set(field.aliases.map(normalizeExactHeader))
  const matches = columns.filter(item => candidateHeaders.has(normalizeExactHeader(item.header)))
  return matches.length === 1 ? String(matches[0].index) : ''
}

export default function QualityWorkbookInlineColumnMapping({
  file, importerKey, fields, sheetHint = 'Logbook', disabled = false, onApply,
}: {
  file: File | null
  importerKey: string
  fields: readonly InlineWorkbookField[]
  sheetHint?: string
  disabled?: boolean
  onApply: () => void | Promise<void>
}) {
  const [sheets, setSheets] = useState<SheetSample[]>([])
  const [sheetName, setSheetName] = useState('')
  const [headerRow, setHeaderRow] = useState(1)
  const [selections, setSelections] = useState<Record<string, string>>({})
  const [reading, setReading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const activeSheet = sheets.find(item => item.name === sheetName)
  const columns = activeSheet?.headers.find(item => item.rowNumber === headerRow)?.columns ?? []
  const locked = useMemo(() => new Set(fields.filter(item => readInteractiveExcelHeaderMapping(importerKey, item.fieldKey)?.locked).map(item => item.fieldKey)), [fields, importerKey, columns])

  useEffect(() => {
    setSheets([])
    setSheetName('')
    setHeaderRow(1)
    setSelections({})
    setError('')
    setNotice('')
  }, [file])

  const hydrateSelections = (nextColumns: HeaderColumn[]) => {
    const next: Record<string, string> = {}
    for (const field of fields) {
      const stored = readInteractiveExcelHeaderMapping(importerKey, field.fieldKey)
      const matched = stored
        ? nextColumns.find(item => normalizeExactHeader(item.header) === stored.normalizedHeader && item.occurrence === stored.occurrence)
        : undefined
      next[field.fieldKey] = matched ? String(matched.index) : autoSelection(nextColumns, field)
    }
    setSelections(next)
  }

  const inspect = async () => {
    if (!file || reading || disabled) return
    setReading(true); setError(''); setNotice('')
    try {
      if (!/\.xlsx$/i.test(file.name) || file.size <= 0 || file.size > 25 * 1024 * 1024) throw new Error('Pilih workbook .xlsx valid, maksimal 25 MB.')
      const module = await import('exceljs-hardened')
      const ExcelJS: any = (module as any).default ?? module
      const workbook = new ExcelJS.Workbook()
      await workbook.xlsx.load(await file.arrayBuffer())
      if (!workbook.worksheets?.length || workbook.worksheets.length > 50) throw new Error('Jumlah worksheet tidak didukung.')
      const next: SheetSample[] = workbook.worksheets.map((sheet: any) => ({
        name: String(sheet.name ?? 'Sheet').slice(0, 80),
        headers: Array.from({ length: Math.min(15, sheet.rowCount) }, (_, i) => ({
          rowNumber: i + 1,
          columns: headerColumns(sheet.getRow(i + 1)),
        })),
      }))
      const selected = next.find(item => item.name.toLowerCase() === sheetHint.toLowerCase()) ?? next[0]
      if (!selected) throw new Error('Worksheet tidak ditemukan.')
      const score = (sample: HeaderSample) => fields.reduce((sum, field) => sum + Number(sample.columns.some(col => field.aliases.some(alias => normalizeExactHeader(alias) === normalizeExactHeader(col.header)))), 0)
      const best = selected.headers.reduce<HeaderSample | null>((current, candidate) => !current || score(candidate) > score(current) ? candidate : current, null)
      const row = best?.rowNumber ?? 1
      setSheets(next);setSheetName(selected.name);setHeaderRow(row)
      hydrateSelections(best?.columns ?? [])
    } catch (cause) {
      setSheets([]);setError(cause instanceof Error ? cause.message : 'Header workbook tidak dapat dibaca.')
    } finally { setReading(false) }
  }

  const changeSheet = (value: string) => {
    const next = sheets.find(item => item.name === value)
    if (!next) return
    const best = next.headers.reduce<HeaderSample | null>((current, candidate) => !current || candidate.columns.length > current.columns.length ? candidate : current, null)
    setSheetName(value);setHeaderRow(best?.rowNumber ?? 1)
    hydrateSelections(best?.columns ?? [])
    setNotice('');setError('')
  }

  const changeHeader = (row: number) => {
    const next = activeSheet?.headers.find(item => item.rowNumber === row)
    setHeaderRow(row)
    hydrateSelections(next?.columns ?? [])
    setNotice('');setError('')
  }

  const apply = async () => {
    if (disabled || reading || !columns.length) return
    setError('');setNotice('')
    try {
      const picks = fields.map(field => ({field, chosen: columns.find(item => String(item.index) === (selections[field.fieldKey] ?? ''))}))
      const absent = picks.filter(({field, chosen}) => field.required !== false && !chosen)
      if (absent.length) throw new Error('Lengkapi tautan kolom: ' + absent.map(item => item.field.label).join(', '))
      const used = picks.filter(item => !!item.chosen).map(item => item.chosen!.index)
      if (new Set(used).size !== used.length) throw new Error('Satu kolom Excel tidak boleh ditautkan ke lebih dari satu field.')
      for (const {field,chosen} of picks) if (chosen && !locked.has(field.fieldKey)) {
        saveInteractiveExcelHeaderMapping(importerKey, field.fieldKey, chosen.header, chosen.occurrence)
      }
      setNotice('Pemetaan kolom tersimpan di browser. Pratinjau diperiksa kembali menggunakan pilihan baru.')
      await onApply()
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Kolom belum berhasil ditautkan.') }
  }

  return <div className="qiuInlineMapping qiuMappingFields">
    <p className="qiuMappingNotice">Atur kolom berdasarkan header workbook yang diunggah. Pemetaan manual digunakan ketika pratinjau dihitung ulang; pengaturan server tetap dikunci.</p>
    {!file ? <p className="qiuMappingNotice">Unggah workbook dahulu melalui panel kanan.</p> : <>
      {!sheets.length && <div className="qiuMappingActions"><button type="button" disabled={disabled || reading} onClick={() => void inspect()}>{reading ? 'Membaca header…' : 'Baca header & tautkan'}</button></div>}
      {sheets.length > 0 && <>
        <label className="qiuField">Worksheet
          <select disabled={disabled} value={sheetName} onChange={event => changeSheet(event.target.value)}>{sheets.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}</select>
        </label>
        <label className="qiuField">Baris header
          <select disabled={disabled} value={headerRow} onChange={event => changeHeader(Number(event.target.value))}>
            {activeSheet?.headers.map(item => <option key={item.rowNumber} value={item.rowNumber}>Baris {item.rowNumber}</option>)}
          </select>
        </label>
        <div className="qiuMappingFields">
          {fields.map(field => <label key={field.fieldKey} className="qiuField">{field.label}{field.required !== false ? ' *' : ' (opsional)'}
            <select
              disabled={disabled || locked.has(field.fieldKey)}
              aria-label={'Kolom sumber untuk ' + field.label}
              value={selections[field.fieldKey] ?? ''}
              onChange={event => {setSelections(current => ({...current, [field.fieldKey]: event.target.value}));setNotice('')}}
            >
              <option value="">— Pilih kolom —</option>
              {columns.map(column => <option key={column.index} value={column.index}>{column.letter}: {column.header}</option>)}
            </select>
            {locked.has(field.fieldKey) && <small style={{fontWeight:500}}>Ditetapkan melalui Pusat Pemetaan Excel</small>}
          </label>)}
        </div>
        <div className="qiuMappingActions"><button type="button" disabled={disabled || reading} onClick={() => void apply()}>Terapkan & periksa ulang</button></div>
      </>}
    </>}
    {error && <p className="qiuMappingError" role="alert">{error}</p>}
    {notice && <p className="qiuMappingNotice" role="status">{notice}</p>}
  </div>
}
