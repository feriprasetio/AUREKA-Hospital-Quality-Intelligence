'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { SupabaseClient } from '@supabase/supabase-js'

type Msg = { role: 'user' | 'model'; text: string; error?: boolean }

const SUGGESTIONS = [
  'Unit mana yang paling banyak risiko Sangat Tinggi?',
  'Apa prioritas tindak lanjut minggu ini?',
  'Ringkas tren laporan IKP 6 bulan terakhir',
  'Jelaskan beda KTD, KNC, KTC, dan KPC',
]
const STORE_KEY = 'aureka-tanya-history'

/** Render teks jawaban AI secara aman (tanpa HTML): paragraf, poin, dan **tebal**. */
function renderAnswer(text: string): ReactNode {
  const inline = (s: string, k: string) => s.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    /^\*\*[^*]+\*\*$/.test(part) ? <b key={k + i}>{part.slice(2, -2)}</b> : <span key={k + i}>{part}</span>)
  const blocks: ReactNode[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (!list) return
    const items = list.items.map((it, i) => <li key={i}>{inline(it, 'li' + blocks.length + '-' + i)}</li>)
    blocks.push(list.ordered ? <ol key={'b' + blocks.length}>{items}</ol> : <ul key={'b' + blocks.length}>{items}</ul>)
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trimEnd()
    const bullet = /^\s*[-*•]\s+(.*)$/.exec(line)
    const num = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (bullet || num) {
      const ordered = Boolean(num)
      if (!list || list.ordered !== ordered) { flush(); list = { ordered, items: [] } }
      list.items.push((bullet || num)![1])
      continue
    }
    flush()
    if (!line.trim()) continue
    const heading = /^#{1,4}\s+(.*)$/.exec(line)
    blocks.push(heading ? <h5 key={'b' + blocks.length}>{inline(heading[1], 'h' + blocks.length)}</h5> : <p key={'b' + blocks.length}>{inline(line, 'p' + blocks.length)}</p>)
  }
  flush()
  return blocks
}

async function errorText(error: unknown): Promise<string> {
  const e = error as { name?: string; context?: Response; message?: string }
  if (e?.context && typeof e.context.json === 'function') {
    if (e.context.status === 404) return 'Tanya AUREKA belum diaktifkan di server. Super Admin perlu men-deploy fungsi "aureka-tanya".'
    try { const body = await e.context.json(); if (body?.error) return String(body.error) } catch { /* abaikan */ }
  }
  if (e?.name === 'FunctionsFetchError') return 'Tanya AUREKA belum dapat dihubungi. Periksa koneksi, atau fungsi server belum diaktifkan.'
  return 'Pertanyaan belum dapat dijawab. Coba lagi sebentar lagi.'
}

export default function TanyaAureka({ sb, page }: { sb: SupabaseClient; page?: string }) {
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [mounted, setMounted] = useState(false)
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    setMounted(true)
    try { const raw = sessionStorage.getItem(STORE_KEY); if (raw) setMsgs(JSON.parse(raw)) } catch { /* abaikan */ }
  }, [])
  useEffect(() => { try { sessionStorage.setItem(STORE_KEY, JSON.stringify(msgs.slice(-20))) } catch { /* abaikan */ } }, [msgs])
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy])
  useEffect(() => {
    if (!open) return
    setTimeout(() => inputRef.current?.focus(), 50)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const ask = async (q: string) => {
    const question = q.trim()
    if (!question || busy) return
    const history = msgs.filter(m => !m.error).slice(-6).map(m => ({ role: m.role, text: m.text }))
    setMsgs(m => [...m, { role: 'user', text: question }])
    setDraft('')
    setBusy(true)
    const { data, error } = await sb.functions.invoke('aureka-tanya', { body: { question, history, page } })
    setBusy(false)
    if (error || !data?.answer) { setMsgs(m => [...m, { role: 'model', text: error ? await errorText(error) : 'AI tidak memberikan jawaban.', error: true }]); return }
    setMsgs(m => [...m, { role: 'model', text: String(data.answer) }])
  }

  const panel = open && <section className="tanyaPanel" role="dialog" aria-label="Tanya AUREKA">
    <header className="tanyaHead">
      <span className="tanyaMark" aria-hidden="true">✦</span>
      <div><strong>Tanya AUREKA</strong><span>Asisten AI · membaca data sesuai hak akses Anda</span></div>
      {msgs.length > 0 && <button type="button" className="tanyaGhost" onClick={() => setMsgs([])} title="Mulai percakapan baru">Baru</button>}
      <button type="button" className="tanyaClose" aria-label="Tutup Tanya AUREKA" onClick={() => setOpen(false)}>×</button>
    </header>
    <div className="tanyaList" ref={listRef} aria-live="polite">
      {msgs.length === 0 && <div className="tanyaWelcome">
        <p>Tanyakan apa saja tentang mutu, keselamatan pasien, dan risiko di rumah sakit Anda.</p>
        <div className="tanyaChips">{SUGGESTIONS.map(s => <button type="button" key={s} onClick={() => void ask(s)}>{s}</button>)}</div>
      </div>}
      {msgs.map((m, i) => <div key={i} className={'tanyaMsg ' + m.role + (m.error ? ' error' : '')}>
        {m.role === 'model' && !m.error ? renderAnswer(m.text) : <p>{m.text}</p>}
      </div>)}
      {busy && <div className="tanyaMsg model typing" aria-label="AUREKA sedang menjawab"><i /><i /><i /></div>}
    </div>
    <form className="tanyaComposer" onSubmit={e => { e.preventDefault(); void ask(draft) }}>
      <textarea ref={inputRef} rows={1} value={draft} maxLength={1500} placeholder="Tulis pertanyaan…" aria-label="Pertanyaan untuk AUREKA"
        onChange={e => setDraft(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(draft) } }} />
      <button type="submit" disabled={busy || !draft.trim()} aria-label="Kirim pertanyaan">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
      </button>
    </form>
    <p className="tanyaNote">Jawaban AI bisa keliru — cek kembali angka penting di modul terkait. Identitas pasien tidak dikirim ke AI.</p>
  </section>

  return <>
    <button type="button" className={'workspaceHeaderIcon tanyaTrigger' + (open ? ' on' : '')} title="Tanya AUREKA" aria-label="Tanya AUREKA" aria-expanded={open} onClick={() => setOpen(v => !v)}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
    </button>
    {mounted && panel ? createPortal(panel, document.body) : null}
  </>
}
