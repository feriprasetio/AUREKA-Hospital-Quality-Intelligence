'use client'

type OptionRow = {
  label: string
  code: number | null
  numerator: boolean | null
  denominator: boolean
  review_required: boolean
  [key: string]: unknown
}

export default function QualityOptionEditor({ text, onChange }: {
  text: string
  onChange: (next: string) => void
}) {
  let rows: OptionRow[] | null = null
  try {
    const parsed: unknown = JSON.parse(text || '[]')
    if (Array.isArray(parsed)) rows = parsed.map((item: unknown) => ({
      label: '', code: null, numerator: null, denominator: true, review_required: false,
      ...(item && typeof item === 'object' && !Array.isArray(item) ? item : { label: String(item ?? '') }),
    }))
  } catch { rows = null }
  if (!rows) return <div role="alert" className="qoeWarning">Opsi jawaban tersimpan tidak dapat dibaca. Tidak ada konfigurasi yang diubah. Periksa berkas sumber atau hubungi pengelola.</div>
  const write = (items: OptionRow[]) => onChange(JSON.stringify(items, null, 2))
  const update = (i: number, patch: Partial<OptionRow>) => write(rows!.map((r, index) => index === i ? { ...r, ...patch } : r))

  return <div className="qoe">
    <style>{[
      '.qoe{display:grid;gap:8px}.qoeRow{display:grid;grid-template-columns:26px minmax(150px,2fr) minmax(140px,1.5fr) minmax(140px,1.5fr) auto auto 32px;gap:7px;align-items:center;border:1px solid var(--line,#dbe5e0);padding:9px;border-radius:10px;background:var(--surface,#fff)}',
      '.qoeRow input[type=text],.qoeRow select{min-width:0;width:100%;border:1px solid var(--line,#dbe5e0);border-radius:8px;min-height:36px;padding:7px 8px;background:var(--surface,#fff);color:var(--ink,#293c32);font:inherit;font-size:12px}',
      '.qoeRow .qoeNumber{color:var(--muted,#7b867e);font-size:11px;text-align:center}.qoeCheck{display:flex;gap:5px;align-items:center;white-space:nowrap;font-size:11px;color:var(--muted,#66766c)}',
      '.qoeAdd,.qoeRemove{border:1px solid var(--line,#dbe5e0);background:var(--surface,#fff);color:var(--accent2,#266b4e);border-radius:8px;min-height:35px;cursor:pointer;font-size:12px;font-weight:750}.qoeRemove{min-width:31px}.qoeAdd{justify-self:start;padding:0 12px}',
      '.qoeHint,.qoeWarning{font-size:11px;color:var(--muted,#68786e);line-height:1.5}.qoeWarning{color:#a34b38}',
      '@media(max-width:950px){.qoeRow{grid-template-columns:24px minmax(110px,1fr) minmax(120px,1fr)}.qoeCheck{white-space:normal}.qoeRemove{justify-self:start}}',
      '@media(max-width:550px){.qoeRow{grid-template-columns:1fr 1fr}.qoeRow .qoeNumber{grid-column:1/-1;text-align:left}}',
    ].join('\n')}</style>
    <div className="qoeHint">Atur label, kode pilihan, status pembilang/penyebut, dan kewajiban alasan melalui kontrol. Tidak perlu mengedit JSON.</div>
    {rows.map((row, i) => <div key={i} className="qoeRow">
      <span className="qoeNumber">{i + 1}</span>
      <input type="text" value={String(row.label ?? '')} aria-label={'Label pilihan ' + (i + 1)}
        placeholder="Mis. Sesuai standar" onChange={event => update(i, { label: event.target.value })} />
      <select aria-label={'Kode pilihan ' + (i + 1)}
        value={row.code == null ? '' : String(row.code)}
        onChange={event => update(i, { code: event.target.value ? Number(event.target.value) : null })}>
        <option value="">Tanpa kode</option>
        <option value="1">Code 1</option><option value="2">Code 2</option><option value="3">Code 3</option>
      </select>
      <select aria-label={'Numerator pilihan ' + (i + 1)}
        value={row.numerator === true ? 'yes' : row.numerator === false ? 'no' : 'unset'}
        onChange={event => update(i, { numerator: event.target.value === 'yes' ? true : event.target.value === 'no' ? false : null })}>
        <option value="unset">Pembilang: mengikuti aturan kode</option>
        <option value="yes">Masuk pembilang</option><option value="no">Tidak masuk pembilang</option>
      </select>
      <label className="qoeCheck"><input type="checkbox" checked={row.denominator !== false}
        onChange={event => update(i, { denominator: event.target.checked })} /> Penyebut</label>
      <label className="qoeCheck"><input type="checkbox" checked={row.review_required === true}
        onChange={event => update(i, { review_required: event.target.checked })} /> Perlu telaah</label>
      <button type="button" className="qoeRemove" aria-label={'Hapus pilihan ' + (i + 1)}
        onClick={() => write(rows!.filter((_, index) => index !== i))}>×</button>
    </div>)}
    <button type="button" className="qoeAdd" onClick={() => write([...rows!, {
      label: '', code: null, numerator: null, denominator: true, review_required: false,
    }])}>+ Tambah pilihan</button>
  </div>
}
