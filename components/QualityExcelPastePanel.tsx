'use client'

import { useMemo, useState } from 'react'
import { parseExcelPaste, type ExcelPasteRow } from '@/lib/aureka/excel-paste'

type Props = {
  headers: string[]
  disabledReason?: string
  onUseRow: (values: Record<string, string>, sourceRow: number) => void
  onUseRows?: (rows: ExcelPasteRow[]) => void
  onClose: () => void
}

export default function QualityExcelPastePanel({ headers, disabledReason, onUseRow, onUseRows, onClose }: Props) {
  const [text, setText] = useState('')
  const parsed = useMemo(() => parseExcelPaste(text, headers), [text, headers])
  const blocked = Boolean(disabledReason) || parsed.errors.length > 0 || parsed.rows.length === 0
  const previewHeaders = parsed.headers.slice(0, 6)
  const previewIndexes = previewHeaders.map((header) => parsed.headers.indexOf(header))

  return (
    <section className="glass aepPanel" aria-label="Tempel data dari Excel">
      <style>{`
        .aepPanel{padding:18px;display:grid;gap:13px;min-width:0}
        .aepHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
        .aepHead h4{margin:0;font-size:18px;letter-spacing:-.025em}
        .aepHead p{margin:5px 0 0;color:var(--muted);font-size:11px;line-height:1.55;max-width:820px}
        .aepTextarea{width:100%;min-height:125px;resize:vertical;padding:12px 13px;border:1px solid var(--line);border-radius:12px;background:rgba(255,255,255,.78);color:var(--ink);font:12px/1.55 ui-monospace,SFMono-Regular,Consolas,monospace;outline-offset:2px}
        .aepBadges{display:flex;gap:7px;flex-wrap:wrap}
        .aepBadge{border-radius:999px;padding:6px 9px;background:#edf6f1;color:#245640;font-size:10px;font-weight:800}
        .aepBadge.warn{background:#fff1de;color:#8a4e13}
        .aepErrors{margin:0;padding:11px 13px;border-radius:11px;background:#fff4e7;color:#814910;font-size:11px;line-height:1.5}
        .aepErrors li+li{margin-top:3px}
        .aepTableWrap{overflow:auto;border:1px solid var(--line);border-radius:12px;max-width:100%}
        .aepTable{border-collapse:collapse;width:100%;font-size:10px;white-space:nowrap}
        .aepTable th,.aepTable td{padding:9px 10px;text-align:left;border-bottom:1px solid var(--line);max-width:260px;overflow:hidden;text-overflow:ellipsis}
        .aepTable th{background:rgba(235,244,239,.9);color:#3d5d4b;font-size:9px;position:sticky;top:0}
        .aepTable tr:last-child td{border-bottom:0}
        .aepActions{display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap}
        .aepHint{font-size:10px;color:var(--muted);line-height:1.5}
        .aepButton{border:1px solid var(--line);border-radius:10px;padding:9px 12px;background:rgba(255,255,255,.74);color:var(--ink);font-size:11px;font-weight:800;cursor:pointer}
        .aepButton.primary{background:var(--accent);color:white;border-color:transparent}
        .aepButton:disabled{opacity:.45;cursor:not-allowed}
        @media(max-width:650px){.aepPanel{padding:13px}.aepHead{display:block}.aepHead .aepButton{margin-top:9px}.aepActions{align-items:stretch}.aepActions .aepButton{flex:1}}
      `}</style>
      <div className="aepHead">
        <div>
          <h4>Tempel data dari Excel</h4>
          <p>Salin baris header beserta data dari lembar Excel, lalu tempel di kotak berikut. AUREKA hanya menerima nama header yang cocok dengan header unit aktif; kolom yang tidak dikenal atau ganda akan memblokir pemindahan data.</p>
        </div>
        <button type="button" className="aepButton" onClick={onClose}>Tutup</button>
      </div>
      {disabledReason && <p className="aepErrors">{disabledReason}</p>}
      <label>
        <span className="aepHint">Tempelan Excel (kolom dipisahkan tab)</span>
        <textarea className="aepTextarea" value={text} onChange={(event) => setText(event.target.value)} placeholder={'Nama Pasien\tNo. Rekam Medis\tTanggal Masuk\tDiagnosa Tegak\nContoh Pasien\tRM001\t2026-10-29\tContoh diagnosis'} spellCheck={false} />
      </label>
      {(text.trim() !== '') && <>
        <div className="aepBadges" aria-live="polite">
          <span className="aepBadge">{parsed.rows.length} baris terdeteksi</span>
          <span className="aepBadge">{parsed.matchedHeaders.length}/{parsed.headers.length} header cocok</span>
          {parsed.unknownHeaders.length > 0 && <span className="aepBadge warn">{parsed.unknownHeaders.length} header tidak dikenali</span>}
          {parsed.duplicateHeaders.length > 0 && <span className="aepBadge warn">Header ganda</span>}
        </div>
        {parsed.errors.length > 0 && <ul className="aepErrors">{parsed.errors.map((error, index) => <li key={index}>{error}</li>)}</ul>}
        {parsed.headers.length > 0 && <div className="aepTableWrap">
          <table className="aepTable">
            <thead><tr><th>Baris Excel</th>{previewHeaders.map((header) => <th key={header}>{header}</th>)}<th>Tindakan</th></tr></thead>
            <tbody>{parsed.rows.slice(0, 10).map((row: ExcelPasteRow) => <tr key={row.sourceRow}>
              <td>{row.sourceRow}</td>
              {previewIndexes.map((index) => <td key={index} title={row.cells[index] ?? ''}>{row.cells[index] || '—'}</td>)}
              <td><button type="button" className="aepButton primary" disabled={blocked} onClick={() => onUseRow(row.values, row.sourceRow)}>Gunakan baris</button></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {parsed.rows.length > 10 && <p className="aepHint">Pratinjau menampilkan 10 baris pertama. Semua baris valid tetap dapat dipilih setelah header terverifikasi.</p>}
      </>}
      <div className="aepActions"><span className="aepHint">Baris diproses sebagai draf di memori. Periksa dan simpan tiap catatan ke server.</span><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{onUseRows&&<button type="button" className="aepButton primary" disabled={blocked} onClick={()=>onUseRows(parsed.rows)}>{`Gunakan semua ${parsed.rows.length} baris`}</button>}
        <button type="button" className="aepButton" onClick={() => setText('')}>Bersihkan tempelan</button>
        </div>
      </div>
    </section>
  )
}
