'use client'

import { useCallback, useEffect, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'

type ReviewRow = {
  diagnosis: string
  patient_count: number
  mapping_status: 'unmapped' | 'proposed' | 'rejected' | 'validated' | string
  icd10_code: string | null
  icd10_title: string | null
  validation_reference: string | null
}
type Draft = { code: string; title: string; reference: string; note: string }

const emptyDraft = (): Draft => ({ code: '', title: '', reference: '', note: '' })
const ICD10_PATTERN = /^[A-Z][0-9]{2}(?:\.[0-9A-Z]{1,4})?$/

export default function NaraIcd10ReviewWorkspace({ sb, onBack }: { sb: SupabaseClient; onBack?: () => void }) {
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [loading, setLoading] = useState(true)
  const [runningAi, setRunningAi] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    const { data, error: rpcError } = await sb.rpc('aureka_nara_icd10_review_queue', {
      p_year: new Date().getFullYear(), p_room: null, p_limit: 200,
    })
    if (rpcError) {
      setRows([])
      setError(/Antrian koding hanya tersedia|permission|not authorized|42501/i.test(rpcError.message || '')
        ? 'Antrian validasi ICD-10 hanya tersedia bagi Super Admin atau Komite PMKP.'
        : 'Antrian diagnosis belum dapat dimuat. Periksa koneksi dan konfigurasi NARA.')
      setLoading(false)
      return
    }
    const nextRows = Array.isArray(data) ? data as ReviewRow[] : []
    setRows(nextRows)
    setDrafts((current) => {
      const next: Record<string, Draft> = {}
      for (const row of nextRows) {
        next[row.diagnosis] = current[row.diagnosis] || {
          code: row.icd10_code || '',
          title: row.icd10_title || '',
          reference: row.validation_reference || '',
          note: '',
        }
      }
      return next
    })
    setLoading(false)
  }, [sb])

  useEffect(() => { void load() }, [load])

  const updateDraft = (diagnosis: string, patch: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [diagnosis]: { ...(current[diagnosis] || emptyDraft()), ...patch },
    }))
  }

  const runSuggestions = async () => {
    if (runningAi) return
    setRunningAi(true)
    setError('')
    setNotice('')
    try {
      const { data, error: invokeError } = await sb.functions.invoke('aureka-tanya', {
        body: {
          task: 'icd10_suggest',
          question: 'Usulkan pemetaan ICD-10 WHO 2019 untuk istilah diagnosis agregat yang belum memiliki usulan.',
        },
      })
      if (invokeError) {
        let detail = invokeError.message || 'Pemanggilan layanan AI gagal.'
        const context = (invokeError as unknown as { context?: unknown }).context
        if (context instanceof Response) {
          try {
            const payload = await context.clone().json() as { error?: unknown }
            if (typeof payload?.error === 'string' && payload.error.trim()) detail = payload.error
          } catch { /* gunakan pesan error Functions jika body tidak berupa JSON */ }
        }
        setError(detail)
        return
      }
      if (typeof data?.error === 'string' && data.error.trim()) {
        setError(data.error)
        return
      }
      const proposed = Number(data?.proposed) || 0
      const model = typeof data?.model === 'string' ? data.model : ''
      const answer = String(data?.answer || 'Proses usulan diagnosis selesai.')
      setNotice(answer + (model ? '\n\nProvider/model: ' + model : '') +
        (proposed ? '\n\nJumlah usulan baru tersimpan: ' + proposed : ''))
      await load()
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Terjadi gangguan saat menjalankan usulan AI.')
    } finally {
      setRunningAi(false)
    }
  }

  const saveMapping = async (row: ReviewRow, status: 'proposed' | 'validated') => {
    const draft = drafts[row.diagnosis] || emptyDraft()
    const code = draft.code.trim().toUpperCase()
    const title = draft.title.trim()
    const reference = draft.reference.trim()
    if (status === 'validated') {
      if (!ICD10_PATTERN.test(code)) {
        setError('Format kode ICD-10 tidak valid. Gunakan format kode WHO, misalnya A00 atau A00.1.')
        return
      }
      if (!title || !reference) {
        setError('Validasi memerlukan judul diagnosis resmi dan referensi pemeriksaan kode.')
        return
      }
    }
    setSaving(row.diagnosis)
    setError('')
    setNotice('')
    const { error: saveError } = await sb.rpc('aureka_nara_icd10_upsert_mapping', {
      p_diagnosis: row.diagnosis,
      p_icd10_code: code || null,
      p_icd10_title: title || null,
      p_status: status,
      p_validation_reference: status === 'validated' ? reference : null,
      p_review_note: draft.note.trim() || null,
    })
    setSaving(null)
    if (saveError) {
      setError('Pemetaan tidak dapat disimpan. Pastikan role akun dan kelengkapan kode, judul, serta referensi validasi.')
      return
    }
    setNotice(status === 'validated'
      ? 'Pemetaan "' + row.diagnosis + '" disahkan. Variasi diagnosis lain yang dipetakan ke kode ICD-10 yang sama akan dikelompokkan bersama dalam analitik.'
      : 'Usulan pemetaan "' + row.diagnosis + '" tersimpan dan masih menunggu validasi.')
    await load()
  }

  const proposedCount = rows.filter((row) => row.mapping_status === 'proposed').length
  const rejectedCount = rows.filter((row) => row.mapping_status === 'rejected').length

  return <div className="naraIcdReview">
    <header className="naraIcdHeader">
      <div>
        <p className="naraIcdEyebrow">NARA · CLINICAL INTELLIGENCE</p>
        <h2>Validasi terminologi & ICD-10</h2>
        <p className="naraIcdIntro">Tinjau variasi penulisan diagnosis yang telah dikelompokkan. Pemetaan yang divalidasi akan menjadi kamus rujukan AUREKA untuk analisis berikutnya.</p>
      </div>
      <div className="naraIcdActions">
        {onBack && <button type="button" className="naraIcdSecondary" onClick={onBack}>Kembali ke NARA</button>}
        <button type="button" className="naraIcdPrimary" disabled={runningAi || loading} onClick={() => void runSuggestions()}>
          {runningAi ? 'Menganalisis istilah…' : 'Buat usulan dengan AI'}
        </button>
      </div>
    </header>
    <div className="naraIcdStats">
      <div><strong>{rows.length}</strong><span>Istilah dalam antrean</span></div>
      <div><strong>{proposedCount}</strong><span>Usulan menunggu validasi</span></div>
      <div><strong>{rejectedCount}</strong><span>Perlu penelaahan ulang</span></div>
    </div>
    <p className="naraIcdSafety">Privasi: antrean hanya menampilkan istilah diagnosis agregat dengan minimal 5 pasien unik. Nama pasien dan nomor rekam medis tidak ditampilkan atau dikirim ke provider AI. Kode yang dihasilkan AI selalu berstatus usulan sampai diverifikasi PMIK/DPJP terhadap WHO ICD-10 2019.</p>
    {error && <p className="naraIcdMessage error" role="alert">{error}</p>}
    {notice && <p className="naraIcdMessage" role="status">{notice}</p>}
    {loading ? <p className="naraIcdEmpty">Memuat antrean diagnosis…</p> : rows.length === 0 ? (
      <p className="naraIcdEmpty">Tidak ada istilah diagnosis yang memenuhi kriteria antrean pada tahun dan unit yang dapat diakses akun ini.</p>
    ) : <div className="naraIcdList">
      {rows.map((row) => {
        const draft = drafts[row.diagnosis] || emptyDraft()
        const isSaving = saving === row.diagnosis
        return <article className="naraIcdCard" key={row.diagnosis}>
          <div className="naraIcdTerm">
            <div><strong>{row.diagnosis}</strong><span>{Number(row.patient_count) || 0} pasien unik</span></div>
            <span className={'naraIcdBadge ' + row.mapping_status}>
              {row.mapping_status === 'proposed' ? 'Usulan AI' : row.mapping_status === 'rejected' ? 'Ditolak · perlu telaah' : 'Belum dipetakan'}
            </span>
          </div>
          <div className="naraIcdFields">
            <label>Kode ICD-10
              <input value={draft.code} maxLength={8} placeholder="Contoh: J18.9" onChange={(e) => updateDraft(row.diagnosis, { code: e.target.value.toUpperCase() })}/>
            </label>
            <label>Judul diagnosis resmi
              <input value={draft.title} maxLength={180} placeholder="Judul sesuai WHO ICD-10 2019" onChange={(e) => updateDraft(row.diagnosis, { title: e.target.value })}/>
            </label>
            <label>Referensi validasi
              <input value={draft.reference} maxLength={500} placeholder="WHO ICD-10 2019 · bab/kategori/subkategori" onChange={(e) => updateDraft(row.diagnosis, { reference: e.target.value })}/>
            </label>
            <label>Catatan reviewer
              <input value={draft.note} maxLength={500} placeholder="Catatan / alasan pemetaan (opsional)" onChange={(e) => updateDraft(row.diagnosis, { note: e.target.value })}/>
            </label>
          </div>
          <div className="naraIcdCardActions">
            <button type="button" className="naraIcdSecondary" disabled={isSaving} onClick={() => void saveMapping(row, 'proposed')}>Simpan sebagai usulan</button>
            <button type="button" className="naraIcdPrimary" disabled={isSaving} onClick={() => void saveMapping(row, 'validated')}>{isSaving ? 'Menyimpan…' : 'Validasi pemetaan'}</button>
          </div>
        </article>
      })}
    </div>}
    <style jsx>{`
      .naraIcdReview{display:grid;gap:16px;min-width:0;color:#203047}
      .naraIcdHeader{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
      .naraIcdEyebrow{margin:0 0 6px;color:#0d7893;font-size:11px;font-weight:800;letter-spacing:.12em}
      .naraIcdHeader h2{margin:0;font-size:clamp(21px,2.2vw,29px);font-weight:800;letter-spacing:-.025em}
      .naraIcdIntro{max-width:70ch;margin:7px 0 0;color:#66768a;font-size:13px;line-height:1.55}
      .naraIcdActions,.naraIcdCardActions{display:flex;flex-wrap:wrap;gap:8px}
      .naraIcdActions{justify-content:flex-end}
      .naraIcdPrimary,.naraIcdSecondary{min-height:38px;padding:0 13px;border-radius:11px;font:inherit;font-size:12px;font-weight:750;cursor:pointer}
      .naraIcdPrimary{border:1px solid #0b627c;background:#0e7490;color:white}
      .naraIcdSecondary{border:1px solid #d7e1eb;background:#fff;color:#38556f}
      .naraIcdPrimary:disabled,.naraIcdSecondary:disabled{opacity:.55;cursor:wait}
      .naraIcdStats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
      .naraIcdStats>div{display:grid;gap:3px;padding:12px 14px;border:1px solid #e1e8ef;border-radius:14px;background:#fff}
      .naraIcdStats strong{font-size:23px;line-height:1.1;font-variant-numeric:tabular-nums}
      .naraIcdStats span{color:#6b788a;font-size:11px}
      .naraIcdSafety{margin:0;padding:11px 13px;border:1px solid #dceaf0;border-radius:12px;background:#f4fafc;color:#406074;font-size:12px;line-height:1.55}
      .naraIcdMessage{margin:0;padding:10px 12px;border-radius:10px;background:#edf7f2;color:#205b40;font-size:12px;line-height:1.5}
      .naraIcdMessage.error{background:#fff2f0;color:#9b322a}
      .naraIcdEmpty{margin:0;padding:24px;text-align:center;border:1px dashed #ccd7e2;border-radius:14px;color:#708094;font-size:13px}
      .naraIcdList{display:grid;gap:12px}
      .naraIcdCard{display:grid;gap:13px;padding:15px;border:1px solid #e1e8ef;border-radius:15px;background:#fff}
      .naraIcdTerm{display:flex;align-items:center;justify-content:space-between;gap:12px}
      .naraIcdTerm>div{display:grid;gap:3px;min-width:0}
      .naraIcdTerm strong{font-size:14px;overflow-wrap:anywhere}
      .naraIcdTerm span{color:#718096;font-size:11px}
      .naraIcdBadge{flex-shrink:0;padding:5px 8px;border-radius:999px;background:#f1f5f9;color:#536477;font-size:10px;font-weight:750}
      .naraIcdBadge.proposed{background:#fff5df;color:#86601a}
      .naraIcdBadge.rejected{background:#fff0ee;color:#9b322a}
      .naraIcdFields{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
      .naraIcdFields label{display:grid;gap:5px;color:#526277;font-size:11px;font-weight:700}
      .naraIcdFields input{width:100%;min-width:0;min-height:38px;padding:8px 10px;border:1px solid #d8e1ea;border-radius:9px;background:#fff;color:#233246;font:inherit;font-size:12px;font-weight:450}
      .naraIcdCardActions{justify-content:flex-end}
      @media(max-width:760px){.naraIcdHeader{display:grid}.naraIcdActions{justify-content:flex-start}.naraIcdFields{grid-template-columns:1fr}.naraIcdStats strong{font-size:19px}.naraIcdStats span{font-size:10px}.naraIcdTerm{align-items:flex-start;flex-direction:column}}
      :global(html[data-mode="gelap"]) .naraIcdReview{color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraIcdIntro,:global(html[data-mode="gelap"]) .naraIcdStats span,:global(html[data-mode="gelap"]) .naraIcdTerm span{color:#9aa9ba}
      :global(html[data-mode="gelap"]) .naraIcdStats>div,:global(html[data-mode="gelap"]) .naraIcdCard{background:rgba(255,255,255,.04);border-color:rgba(255,255,255,.12)}
      :global(html[data-mode="gelap"]) .naraIcdFields input,:global(html[data-mode="gelap"]) .naraIcdSecondary{background:rgba(255,255,255,.07);border-color:rgba(255,255,255,.14);color:#eef2f7}
      :global(html[data-mode="gelap"]) .naraIcdSafety{background:rgba(14,116,144,.12);border-color:rgba(14,116,144,.3);color:#b6dce7}
      :global(html[data-mode="gelap"]) .naraIcdEmpty{border-color:rgba(255,255,255,.18);color:#9aa9ba}
    `}</style>
  </div>
}
