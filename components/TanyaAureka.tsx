'use client'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { SupabaseClient } from '@supabase/supabase-js'
import { aurekaConfirm } from '@/components/ui/aurekaConfirm'

type Reminder = { units: string[]; message: string; selected?: string[]; status?: 'draft' | 'sending' | 'sent' | 'cancelled'; result?: string }
type Msg = { role: 'user' | 'model'; text: string; error?: boolean; reminder?: Reminder }
type Room = { id: number; name: string }

/** AI menandai draf pengingat dengan blok [[KIRIM_PENGINGAT]]{json}[[/KIRIM_PENGINGAT]]; dipisah dari teks jawaban. */
function extractReminder(answer: string): { text: string; reminder?: Reminder } {
  const m = /`{0,3}\s*\[\[KIRIM_PENGINGAT\]\]([\s\S]*?)\[\[\/KIRIM_PENGINGAT\]\]\s*`{0,3}/.exec(answer)
  if (!m) return { text: answer }
  const text = answer.replace(m[0], '').trim()
  try {
    const raw = JSON.parse(m[1].trim().replace(/^json\s*/i, ''))
    const units = Array.isArray(raw.unit) ? raw.unit.map(String).filter(Boolean) : Array.isArray(raw.units) ? raw.units.map(String).filter(Boolean) : []
    const message = String(raw.pesan ?? raw.message ?? '').trim()
    if (!units.length || !message) return { text }
    return { text, reminder: { units, message, selected: units, status: 'draft' } }
  } catch { return { text } }
}
const norm = (v: string) => v.toLocaleLowerCase('id-ID').replace(/[^a-z0-9]+/g, ' ').trim()

const SUGGESTIONS = [
  'Halo! Hari ini aku sebaiknya fokus ke mana dulu?',
  'Unit mana yang paling banyak risiko Sangat Tinggi?',
  'Unit mana saja yang belum input logbook triwulan ini?',
  'Jelasin dong beda KTD, KNC, KTC, dan KPC',
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
    try { const body = await e.context.json(); if (body?.error) return String(body.error) + (body.detail ? ' (' + String(body.stage || '') + ': ' + String(body.detail) + ')' : '') } catch { /* abaikan */ }
  }
  if (e?.name === 'FunctionsFetchError') return 'Tanya AUREKA belum dapat dihubungi. Periksa koneksi, atau fungsi server belum diaktifkan.'
  return 'Pertanyaan belum dapat dijawab. Coba lagi sebentar lagi.'
}

export default function TanyaAureka({ sb, page, embedded = false }: { sb: SupabaseClient; page?: string; embedded?: boolean }) {
  const [open, setOpen] = useState(embedded)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [rooms, setRooms] = useState<Room[]>([])
  const listRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)
  // Riwayat disimpan per akun di browser ini (sampai logout / dihapus), dan disamakan antar-panel (tombol pojok, pusat komunikasi, Halaman Utama).
  const instanceId = useRef(Math.random().toString(36).slice(2))
  const storeKey = useRef<string | null>(null)
  const applyingRemote = useRef(false)
  const hydrated = useRef(false)

  useEffect(() => {
    if (embedded) setOpen(true)
    setMounted(true)
    let cancelled = false
    void sb.auth.getSession().then(({ data }) => {
      if (cancelled) return
      const uid = data.session?.user?.id
      storeKey.current = uid ? STORE_KEY + ':' + uid : null
      try {
        const raw = (storeKey.current && localStorage.getItem(storeKey.current)) || sessionStorage.getItem(STORE_KEY)
        if (raw) { applyingRemote.current = true; setMsgs(JSON.parse(raw)) }
        sessionStorage.removeItem(STORE_KEY)
      } catch { /* abaikan */ }
      hydrated.current = true
    })
    const onSync = (e: Event) => {
      const d = (e as CustomEvent<{ from: string; msgs: Msg[] }>).detail
      if (!d || d.from === instanceId.current) return
      applyingRemote.current = true
      setMsgs(d.msgs)
    }
    window.addEventListener('aureka-tanya-sync', onSync)
    return () => { cancelled = true; window.removeEventListener('aureka-tanya-sync', onSync) }
  }, [embedded, sb])
  useEffect(() => {
    // Jangan simpan/siarkan sebelum riwayat dimuat (panel baru tidak boleh menghapus riwayat panel lain).
    if (!hydrated.current) { applyingRemote.current = false; return }
    if (applyingRemote.current) { applyingRemote.current = false; return }
    try { if (storeKey.current) { if (msgs.length) localStorage.setItem(storeKey.current, JSON.stringify(msgs.slice(-60))); else localStorage.removeItem(storeKey.current) } } catch { /* abaikan */ }
    window.dispatchEvent(new CustomEvent('aureka-tanya-sync', { detail: { from: instanceId.current, msgs } }))
  }, [msgs])

  const clearChat = async () => {
    if (!msgs.length) return
    if (!(await aurekaConfirm('Hapus seluruh riwayat chat Tanya AUREKA di perangkat ini?', { danger: true }))) return
    setMsgs([])
  }
  const saveChat = () => {
    if (!msgs.length) return
    const stamp = new Date()
    const lines = [
      'Percakapan Tanya AUREKA',
      'Disimpan: ' + stamp.toLocaleString('id-ID'),
      '',
      ...msgs.map(m => (m.role === 'user' ? 'Anda' : 'AUREKA') + ':\n' + m.text.trim() + '\n'),
    ]
    const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'tanya-aureka-' + stamp.toISOString().slice(0, 16).replace(/[T:]/g, '-') + '.txt'
    document.body.appendChild(a)
    a.click()
    a.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
  useEffect(() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' }) }, [msgs, busy])
  useEffect(() => {
    if (!open) return
    // Panel yang ditanam (Welcome Page/pusat komunikasi) tidak merebut fokus: fokus otomatis membuat halaman melompat ke bawah.
    if (!embedded) setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 50)
    // Pemanasan: server menyiapkan ringkasan data selagi pengguna mengetik (paling sering 1x per 4 menit per tab).
    try {
      const lastWarm = Number(sessionStorage.getItem('aureka-tanya-warm') || 0)
      if (Date.now() - lastWarm > 4 * 60 * 1000) {
        sessionStorage.setItem('aureka-tanya-warm', String(Date.now()))
        void sb.functions.invoke('aureka-tanya', { body: { warmup: true } }).catch(() => undefined)
      }
    } catch { /* abaikan */ }
    if (embedded) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, embedded])

  const loadRooms = async () => {
    if (rooms.length) return rooms
    const { data } = await sb.from('master_rooms').select('id,name').eq('is_active', true).order('sort_order', { ascending: true })
    const list = ((data ?? []) as Room[]).map(r => ({ id: Number(r.id), name: String(r.name) }))
    setRooms(list)
    return list
  }
  const updateReminder = (index: number, patch: Partial<Reminder>) =>
    setMsgs(m => m.map((x, i) => i === index && x.reminder ? { ...x, reminder: { ...x.reminder, ...patch } } : x))
  /** Kirim pengingat ke Chat tiap unit terpilih — hanya setelah pengguna menekan Kirim. Hak kirim mengikuti RLS (Super Admin). */
  const sendReminder = async (index: number) => {
    const r = msgs[index]?.reminder
    if (!r || r.status === 'sending' || r.status === 'sent') return
    const chosen = r.selected ?? r.units
    const body = r.message.trim()
    if (!chosen.length || !body) { updateReminder(index, { result: 'Pilih minimal satu unit dan isi pesannya.' }); return }
    updateReminder(index, { status: 'sending', result: '' })
    const list = await loadRooms()
    const { data: auth } = await sb.auth.getUser()
    const uid = auth.user?.id
    let ok = 0
    const failed: string[] = []
    for (const name of chosen) {
      const room = list.find(x => norm(x.name) === norm(name)) ?? list.find(x => norm(x.name).includes(norm(name)) || norm(name).includes(norm(x.name)))
      if (!room || !uid) { failed.push(name); continue }
      const conv = await sb.schema('aureka_system').from('support_conversations').insert({ room_id: room.id, created_by: uid, subject: 'Pengingat Komite PMKP' }).select('id').single()
      if (conv.error || !conv.data) { failed.push(name); continue }
      const msg = await sb.schema('aureka_system').from('support_messages').insert({ conversation_id: conv.data.id, sender_id: uid, body: body.slice(0, 4000) })
      if (msg.error) failed.push(name); else ok++
    }
    updateReminder(index, {
      status: ok ? 'sent' : 'draft',
      result: ok
        ? `Terkirim ke ${ok} unit lewat Chat (Pusat Komunikasi).` + (failed.length ? ` Gagal: ${failed.join(', ')}.` : '')
        : 'Belum terkirim. Pastikan akun Anda Super Admin dan nama unit sesuai.' + (failed.length ? ` (${failed.join(', ')})` : ''),
    })
  }

  const ask = async (q: string) => {
    const question = q.trim()
    if (!question || busy) return
    const history = msgs.filter(m => !m.error).slice(-10).map(m => ({ role: m.role, text: m.text + (m.reminder ? `\n(Draf pengingat untuk: ${(m.reminder.selected ?? m.reminder.units).join(', ')} — status: ${m.reminder.status === 'sent' ? 'sudah dikirim' : m.reminder.status === 'cancelled' ? 'dibatalkan' : 'belum dikirim'})` : '') }))
    setMsgs(m => [...m, { role: 'user', text: question }])
    setDraft('')
    setBusy(true)
    const { data, error } = await sb.functions.invoke('aureka-tanya', { body: { question, history, page } })
    setBusy(false)
    if (error || !data?.answer) {
      const text = error ? await errorText(error) : 'AI tidak memberikan jawaban.'
      setMsgs(m => [...m, { role: 'model', text, error: true }])
      return
    }
    const { text, reminder } = extractReminder(String(data.answer))
    if (reminder) void loadRooms()
    setMsgs(m => [...m, { role: 'model', text: text || 'Berikut draf pengingatnya.', reminder }])
  }

  const panel = open && <section className={embedded?"tanyaPanel tanyaPanelEmbedded":"tanyaPanel"} role="dialog" aria-label="Tanya AUREKA">
    <header className="tanyaHead">
      <span className="tanyaMark" aria-hidden="true">✦</span>
      <div><strong>Tanya AUREKA</strong><span>Asisten AI · membaca data sesuai hak akses Anda</span></div>
      {msgs.length > 0 && <>
        <button type="button" className="tanyaGhost" onClick={saveChat} title="Unduh percakapan sebagai file teks">Simpan</button>
        <button type="button" className="tanyaGhost danger" onClick={clearChat} title="Hapus riwayat chat di perangkat ini">Hapus</button>
      </>}
      <button type="button" className="tanyaClose" aria-label="Tutup Tanya AUREKA" onClick={() => setOpen(false)}>×</button>
    </header>
    <div className="tanyaList" ref={listRef} aria-live="polite">
      {msgs.length === 0 && <div className="tanyaWelcome">
        <p>Halo! 👋 Aku AUREKA, rekan kerjamu untuk urusan mutu, keselamatan pasien, dan risiko. Mau ngobrol, tanya istilah, atau cek data unit, langsung tulis aja ya.</p>
        <div className="tanyaChips">{SUGGESTIONS.map(s => <button type="button" key={s} onClick={() => void ask(s)}>{s}</button>)}</div>
      </div>}
      {msgs.map((m, i) => <div key={i} className={'tanyaMsg ' + m.role + (m.error ? ' error' : '')}>
        {m.role === 'model' && !m.error ? renderAnswer(m.text) : <p>{m.text}</p>}
        {m.reminder && <div className="tanyaReminder">
          <b>Draf pengingat ke PIC unit</b>
          <div className="tanyaReminderUnits">{m.reminder.units.map(u => {
            const on = (m.reminder!.selected ?? m.reminder!.units).includes(u)
            return <label key={u} className={on ? 'on' : ''}><input type="checkbox" checked={on} disabled={m.reminder!.status === 'sent' || m.reminder!.status === 'sending'}
              onChange={() => updateReminder(i, { selected: on ? (m.reminder!.selected ?? m.reminder!.units).filter(x => x !== u) : [...(m.reminder!.selected ?? m.reminder!.units), u] })} />{u}</label>
          })}</div>
          <textarea value={m.reminder.message} rows={4} maxLength={4000} disabled={m.reminder.status === 'sent' || m.reminder.status === 'sending'} aria-label="Isi pesan pengingat"
            onChange={e => updateReminder(i, { message: e.target.value })} />
          {m.reminder.status === 'cancelled' ? <small>Dibatalkan.</small>
            : m.reminder.status === 'sent' ? null
            : <div className="tanyaReminderActions">
              <button type="button" className="primary" disabled={m.reminder.status === 'sending'} onClick={() => void sendReminder(i)}>{m.reminder.status === 'sending' ? 'Mengirim…' : `Kirim ke ${(m.reminder.selected ?? m.reminder.units).length} unit`}</button>
              <button type="button" disabled={m.reminder.status === 'sending'} onClick={() => updateReminder(i, { status: 'cancelled' })}>Batal</button>
            </div>}
          {m.reminder.result && <small className={m.reminder.status === 'sent' ? 'ok' : 'err'}>{m.reminder.result}</small>}
        </div>}
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

  const fab = <button type="button" className={'tanyaFab' + (open ? ' on' : '')} title="Tanya AUREKA" aria-label={open ? 'Tutup Tanya AUREKA' : 'Tanya AUREKA'} aria-expanded={open} onClick={() => setOpen(v => !v)}>
    {open
      ? <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
      : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>}
    {!open && <span className="tanyaFabLabel">Tanya AUREKA</span>}
  </button>

  if (embedded) return panel
  return mounted ? createPortal(<>{panel}{fab}</>, document.body) : null
}
