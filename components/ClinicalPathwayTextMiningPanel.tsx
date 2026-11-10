'use client'

import { useMemo, useState } from 'react'
import {
  analyzeClinicalPathwayText,
  type ClinicalTextMiningItem,
  type ClinicalTextMiningSuggestion,
} from '@/lib/clinical-pathway/text-mining'

type Props = {
  items: ClinicalTextMiningItem[]
  days: string[]
  admissionDate?: string
  disabled?: boolean
  onAccept: (suggestion: ClinicalTextMiningSuggestion, day: string) => void
}

function suggestionKey(row: ClinicalTextMiningSuggestion): string {
  return row.item_id + '|' + (row.day || row.day_candidate || 'undated')
}

function statusLabel(status: ClinicalTextMiningSuggestion['status']): string {
  if (status === 'completed') return 'Bukti pelaksanaan'
  if (status === 'planned') return 'Masih rencana'
  if (status === 'negated') return 'Negasi / berlawanan'
  return 'Perlu verifikasi'
}

function statusClass(status: ClinicalTextMiningSuggestion['status']): string {
  if (status === 'completed') return 'completed'
  if (status === 'planned') return 'planned'
  if (status === 'negated') return 'negated'
  return 'uncertain'
}

export default function ClinicalPathwayTextMiningPanel({ items, days, admissionDate, disabled = false, onAccept }: Props) {
  const [soap, setSoap] = useState('')
  const [result, setResult] = useState<ReturnType<typeof analyzeClinicalPathwayText> | null>(null)
  const [dayChoices, setDayChoices] = useState<Record<string, string>>({})
  const [accepted, setAccepted] = useState<Record<string, boolean>>({})
  const [filter, setFilter] = useState<'all' | 'completed' | 'planned' | 'negated' | 'uncertain'>('all')
  const [analyzing, setAnalyzing] = useState(false)

  const filtered = useMemo(() => {
    if (!result) return []
    return result.suggestions.filter((row) => filter === 'all' || row.status === filter)
  }, [filter, result])

  function analyze() {
    if (!soap.trim() || !items.length) return
    setAnalyzing(true)
    try {
      const next = analyzeClinicalPathwayText({ text: soap, items, admissionDate, days })
      setResult(next)
      setDayChoices({})
      setAccepted({})
      setFilter('all')
    } finally {
      setAnalyzing(false)
    }
  }

  function accept(row: ClinicalTextMiningSuggestion, day: string) {
    if (disabled || row.status !== 'completed' || !day || !days.includes(day)) return
    onAccept(row, day)
    setAccepted((current) => ({ ...current, [suggestionKey(row)]: true }))
  }

  function acceptAllDated() {
    if (!result || disabled) return
    result.suggestions
      .filter((row) => row.status === 'completed' && !!row.day && !accepted[suggestionKey(row)])
      .forEach((row) => accept(row, row.day as string))
  }

  const acceptedCount = Object.values(accepted).filter(Boolean).length
  const acceptReadyCount = result?.suggestions.filter((row) => row.status === 'completed' && !!row.day && !accepted[suggestionKey(row)]).length || 0

  return <section className="cpGlass cpPanel cpTextMining">
    <div className="cpSectionHead">
      <div>
        <h4>Text Mining SOAP / CPPT · Auto-Ceklis berbasis bukti</h4>
        <p>Tempel catatan klinis untuk mencari bukti yang berkaitan dengan item pada format CP ini. Teks diproses di browser dan tidak dikirim sebagai permintaan ke layanan AI eksternal.</p>
      </div>
      <span className="cpBadge">Analisis lokal</span>
    </div>
    <div className="cpTextMiningWarning">
      Hasil analisis merupakan rekomendasi dokumentasi, bukan penetapan tindakan klinis. Hanya bukti berstatus “Bukti pelaksanaan” yang dapat diajukan untuk diceklis; setiap penerimaan tetap membutuhkan tindakan PIC.
    </div>
    <div className="cpField">
      <label htmlFor="cp-soap-text">SOAP / CPPT / resume medis</label>
      <textarea
        id="cp-soap-text"
        className="cpTextMiningInput"
        value={soap}
        onChange={(event) => setSoap(event.target.value)}
        placeholder={'Tempel catatan pasien di sini. Pertahankan tanggal atau hari pada setiap catatan, misalnya:\\n10 November 2026, 09:15\\nS: ...\\nO: ...\\nA: ...\\nP: ...'}
        rows={8}
        disabled={disabled}
      />
      <small className="cpTiny">{soap.length.toLocaleString('id-ID')} karakter · Isi SOAP tidak disimpan otomatis ke audit.</small>
    </div>
    <div className="cpActions cpTextMiningActions">
      <button type="button" className="cpBtn primary" onClick={analyze} disabled={disabled || analyzing || !soap.trim()}>
        {analyzing ? 'Menganalisis…' : '⚙ Analisis & Auto-Ceklis'}
      </button>
      <button type="button" className="cpBtn" onClick={() => { setSoap(''); setResult(null); setDayChoices({}); setAccepted({}) }} disabled={disabled && !soap}>
        Bersihkan teks
      </button>
      {result && <button type="button" className="cpBtn" onClick={acceptAllDated} disabled={disabled || acceptReadyCount === 0}>
        Terima semua bukti bertanggal ({acceptReadyCount})
      </button>}
    </div>

    {result && <>
      <div className="cpTextMiningStats">
        <div><small>Item dianalisis</small><strong>{result.total_items}</strong></div>
        <div><small>Item terdeteksi</small><strong>{result.matched_items}</strong></div>
        <div><small>Bukti positif</small><strong className="ok">{result.completed_count}</strong></div>
        <div><small>Rencana</small><strong className="warn">{result.planned_count}</strong></div>
        <div><small>Negasi</small><strong className="bad">{result.negated_count}</strong></div>
        <div><small>Perlu verifikasi</small><strong>{result.uncertain_count}</strong></div>
        <div><small>Tidak ditemukan</small><strong>{result.missing_count}</strong></div>
        <div><small>Tanpa hari/tanggal</small><strong>{result.undated_count}</strong></div>
      </div>
      <div className="cpTextMiningFilters">
        {(['all', 'completed', 'planned', 'negated', 'uncertain'] as const).map((value) => <button type="button" key={value} className={'cpTextMiningFilter ' + (filter === value ? 'active' : '')} onClick={() => setFilter(value)}>
          {value === 'all' ? 'Semua temuan' : statusLabel(value)}
        </button>)}
      </div>
      <div className="cpTextMiningResults">
        {filtered.length === 0 ? <div className="cpEmpty">Tidak ada hasil pada kategori ini.</div> : filtered.map((row) => {
          const key = suggestionKey(row)
          const dayValue = row.day || dayChoices[key] || ''
          const done = !!accepted[key]
          return <article key={key} className="cpTextMiningResult">
            <div className="cpTextMiningResultHead">
              <div>
                <div className="cpItemLabel">{row.label}</div>
                <div className="cpTiny">{row.profession || 'Profesi belum ditentukan'}{row.stage ? ' · ' + row.stage : ''} · Keyakinan pencocokan {Math.round(row.confidence * 100)}%</div>
              </div>
              <span className={'cpTextMiningBadge ' + statusClass(row.status)}>{statusLabel(row.status)}</span>
            </div>
            <blockquote className="cpTextMiningEvidence">“{row.evidence}”</blockquote>
            <div className="cpTiny">{row.reason}</div>
            <div className="cpTextMiningResultFoot">
              <span className="cpTiny">{row.date ? 'Tanggal: ' + row.date : row.day_candidate ? 'Kandidat hari: H' + row.day_candidate : 'Tanggal / hari belum dapat ditentukan'}</span>
              {row.status === 'completed' && !row.day && <select className="cpInput cpTextMiningDay" value={dayChoices[key] || ''} onChange={(event) => setDayChoices((current) => ({ ...current, [key]: event.target.value }))} disabled={disabled || done} aria-label={'Pilih hari untuk ' + row.label}>
                <option value="">Tentukan hari…</option>
                {days.map((day) => <option value={day} key={day}>Hari {day}</option>)}
              </select>}
              {row.day && <span className="cpTextMiningDayTag">Hari {row.day}</span>}
              {row.status === 'completed' && <button type="button" className="cpBtn cpTextMiningAccept" disabled={disabled || done || !dayValue || !days.includes(dayValue)} onClick={() => accept(row, dayValue)}>
                {done ? '✓ Diterima PIC' : 'Terima & ceklis'}
              </button>}
              {row.status !== 'completed' && <span className="cpTextMiningManual">Tidak otomatis diceklis</span>}
            </div>
          </article>
        })}
      </div>
      <div className="cpTextMiningFooter">
        <span>{acceptedCount} saran diterima pada checklist. Temuan lain tetap hanya sebagai bahan telaah.</span>
        <span>Item yang tidak ditemukan tidak otomatis dianggap tidak dilakukan atau N/A.</span>
      </div>
    </>}
  </section>
}
