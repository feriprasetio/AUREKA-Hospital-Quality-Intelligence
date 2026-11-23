'use client'

import { useLayoutEffect, useRef } from 'react'

type OptionRow = {
  label: string
  code: number | null
  numerator: boolean | null
  denominator: boolean
  review_required: boolean
  [key: string]: unknown
}

const emptyOption: OptionRow = {
  label: '', code: null, numerator: null, denominator: true, review_required: false,
}

export default function QualityOptionEditor({ text, onChange }: {
  text: string
  onChange: (next: string) => void
}) {
  const editorRef = useRef<HTMLDivElement>(null)
  const nextFocus = useRef<number | 'add' | null>(null)
  useLayoutEffect(() => {
    if (nextFocus.current === null) return
    const selector = nextFocus.current === 'add' ? '.qoeAdd' : `[data-option-label="${nextFocus.current}"]`
    editorRef.current?.querySelector<HTMLElement>(selector)?.focus()
    nextFocus.current = null
  }, [text])

  let rows: OptionRow[] | null = null
  try {
    const parsed: unknown = JSON.parse(text || '[]')
    if (Array.isArray(parsed)) rows = parsed.map((item: unknown) => ({
      ...emptyOption,
      ...(item && typeof item === 'object' && !Array.isArray(item) ? item : { label: String(item ?? '') }),
    }))
  } catch { rows = null }
  if (!rows) return <p role="alert" className="qoeWarning">Opsi jawaban tersimpan tidak dapat dibaca. Periksa berkas sumber atau hubungi pengelola.</p>

  const items = rows
  const write = (options: OptionRow[]) => onChange(JSON.stringify(options, null, 2))
  const update = (index: number, patch: Partial<OptionRow>) =>
    write(items.map((row, i) => i === index ? { ...row, ...patch } : row))
  const remove = (index: number) => {
    nextFocus.current = items.length > 1 ? Math.min(index, items.length - 2) : 'add'
    write(items.filter((_, i) => i !== index))
  }

  return <div ref={editorRef} className="qoe">
    {items.length === 0 && <p className="qoeHint">Belum ada opsi jawaban. Klik Tambah pilihan untuk membuatnya.</p>}
    {items.map((row, i) => {
      const code = row.code == null ? '' : String(row.code)
      return <fieldset key={i} className="qoeRow">
        <legend>Pilihan {i + 1}</legend>
        <label className="qoeLabel">
          <span>Label jawaban</span>
          <textarea rows={2} data-option-label={i} value={String(row.label ?? '')}
            placeholder="Mis. Sesuai standar" onChange={event => update(i, { label: event.target.value })} />
        </label>
        <label className="qoeLabel">
          <span>Kode pilihan</span>
          <select value={code} onChange={event => update(i, { code: event.target.value ? Number(event.target.value) : null })}>
            <option value="">Tanpa kode</option>
            {['1', '2', '3'].map(value => <option key={value} value={value}>Kode {value}</option>)}
            {code && !['1', '2', '3'].includes(code) && <option value={code}>Kode tersimpan ({code})</option>}
          </select>
        </label>
        <label className="qoeLabel">
          <span>Pembilang</span>
          <select value={row.numerator === true ? 'yes' : row.numerator === false ? 'no' : 'unset'}
            onChange={event => update(i, { numerator: event.target.value === 'unset' ? null : event.target.value === 'yes' })}>
            <option value="unset">Ikuti aturan kode</option>
            <option value="yes">Masuk pembilang</option>
            <option value="no">Tidak masuk pembilang</option>
          </select>
        </label>
        <div className="qoeActions">
          <label className="qoeCheck">
            <input type="checkbox" checked={row.denominator !== false} onChange={event => update(i, { denominator: event.target.checked })} />
            Masuk penyebut
          </label>
          <label className="qoeCheck">
            <input type="checkbox" checked={row.review_required === true} onChange={event => update(i, { review_required: event.target.checked })} />
            Perlu telaah
          </label>
          <button type="button" className="akBtn akBtnGhost qoeRemove" aria-label={`Hapus pilihan ${i + 1}`} onClick={() => remove(i)}>Hapus</button>
        </div>
      </fieldset>
    })}
    <button type="button" className="akBtn akBtnGhost qoeAdd" onClick={() => {
      nextFocus.current = items.length
      write([...items, emptyOption])
    }}>+ Tambah pilihan</button>
  </div>
}
