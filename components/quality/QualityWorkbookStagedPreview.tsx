'use client'

import QualityWorkbookPreviewControls, { useQualityWorkbookPreview } from './QualityWorkbookPreviewControls'

type StagedPreviewRow = {
  source_key: string
  source_sheet: string
  source_row: number
  row_payload: Record<string, any>
}

function formatResponsePreview(response: { response_label?: string; raw_value?: Record<string, unknown> }) {
  const value = response.raw_value ?? {}
  if (response.response_label) return response.response_label
  if (typeof value.numerator === 'number' && typeof value.denominator === 'number') return value.numerator + ' / ' + value.denominator
  if (typeof value.minutes === 'number') return value.minutes + ' menit'
  if (typeof value.value === 'number') return String(value.value)
  if (typeof value.start === 'string' && typeof value.end === 'string') return value.start + '–' + value.end
  return 'Tercatat'
}

export default function QualityWorkbookStagedPreview({ rows }: { rows: StagedPreviewRow[] }) {
  const preview = useQualityWorkbookPreview(rows)
  if (!rows.length) return null
  return <section className="qwiPreview" aria-label="Pratinjau data workbook">
      <QualityWorkbookPreviewControls config={preview} title="Pratinjau record sebelum impor"/>
      <div className="qwiPreviewScroll" role="region" tabIndex={0} aria-label="Tabel pratinjau Excel tanpa identitas pasien">
        <table>
          <thead><tr><th>Sheet</th><th>Baris Excel</th><th>Tanggal</th><th>Jenis pengukuran</th><th>Respons indikator</th><th>Status</th></tr></thead>
          <tbody>
            {preview.preview.map((item, index) => {
              const record = item.row_payload.record_payload
              const responses = Array.isArray(item.row_payload.responses) ? item.row_payload.responses : []
              return <tr key={item.source_key + ':' + index}>
                <td>{item.source_sheet}</td>
                <td>{item.source_row}</td>
                <td>{String(record.record_date ?? '—')}</td>
                <td>{String(record.measurement_grain ?? '—')}</td>
                <td><ul className="qwiResponseList">{responses.map(response => <li key={response.indicator_code}>
                  <strong>{response.indicator_code}</strong> {formatResponsePreview(response)}
                </li>)}</ul></td>
                <td>{record.review_required ? 'Perlu telaah' : record.status === 'draft' ? 'Draf' : 'Siap ditinjau'}</td>
              </tr>
            })}
            {preview.preview.length === 0 && <tr><td colSpan={6}>Tidak ada baris pada filter ini.</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
}
