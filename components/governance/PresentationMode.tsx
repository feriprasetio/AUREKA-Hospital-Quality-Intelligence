'use client'

import { useCallback, useEffect, useState } from 'react'
import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'
import { createPortal } from 'react-dom'

type CountItem = { label: string; count: number }
type MonthItem = { month: number; total: number; validated?: number }
export type PresentationSummary = {
  quality: { active_indicators: number; records: number; validated: number; validation_rate: number; monthly: MonthItem[] }
  clinical: { episodes: number; clinical_pathway_audits: number; clinical_death_audits: number }
  incidents: { total: number; open: number; closed: number; monthly: MonthItem[] }
  risk: { total: number; very_high: number; open: number; levels: CountItem[] }
  program: { recommendations: number; actions: number; open_actions: number; overdue_actions: number; completed_actions: number }
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des']
const n = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const f = (v: unknown) => n(v).toLocaleString('id-ID')

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'danger' | 'ok' }) {
  return <div className={'pmStat' + (tone ? ' ' + tone : '')}><span>{label}</span><b>{value}</b></div>
}

function MonthBars({ rows, upTo, label }: { rows: MonthItem[]; upTo: number; label: string }) {
  const vals = MONTHS.map((_, i) => n(rows.find((r) => Number(r.month) === i + 1)?.total))
  const max = Math.max(1, ...vals)
  return <figure className="pmBars" aria-label={label}>
    {vals.map((v, i) => <div key={i} className={'pmBar' + (i + 1 > upTo ? ' future' : '')}>
      <em>{i + 1 <= upTo && v ? f(v) : ''}</em>
      <i style={{ height: (v / max) * 100 + '%' }} />
      <span>{MONTHS[i]}</span>
    </div>)}
    <figcaption>{label}</figcaption>
  </figure>
}

function Levels({ items }: { items: CountItem[] }) {
  const max = Math.max(1, ...items.map((i) => n(i.count)))
  if (!items.length) return <p className="pmMuted">Belum ada data level risiko.</p>
  return <ul className="pmLevels">{items.map((i) => <li key={i.label}><span>{i.label}</span><i><b style={{ width: (n(i.count) / max) * 100 + '%' }} /></i><strong>{f(i.count)}</strong></li>)}</ul>
}

/** Mode presentasi rapat komite: slide layar penuh dari ringkasan infografis. ← → untuk pindah, Esc untuk keluar. */
export default function PresentationMode({ open, onClose, summary, year, scope, reported }: {
  open: boolean; onClose: () => void; summary: PresentationSummary; year: number; scope: string
  reported: { done: number; total: number; missing: string[] } | null
}) {
  const [i, setI] = useState(0)
  const root = useAccessibleDialog<HTMLDivElement>({ open, onClose })
  const isThisYear = year === new Date().getFullYear()
  const upTo = isThisYear ? new Date().getMonth() + 1 : 12
  const monthName = new Intl.DateTimeFormat('id-ID', { month: 'long' }).format(new Date())
  const today = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Pontianak' }).format(new Date())
  const s = summary

  const slides: Array<{ key: string; title: string; body: React.ReactNode }> = [
    { key: 'cover', title: '', body: <div className="pmCover"><span>Komite Peningkatan Mutu dan Keselamatan Pasien</span><h1>Rapat Evaluasi Mutu {year}</h1><p>{scope} · {today}</p></div> },
    { key: 'mutu', title: 'Indikator mutu', body: <>
      <div className="pmStats"><Stat label="Indikator aktif" value={f(s.quality.active_indicators)} /><Stat label="Catatan logbook" value={f(s.quality.records)} /><Stat label="Tervalidasi" value={f(s.quality.validated)} /><Stat label="Tingkat validasi" value={n(s.quality.validation_rate).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + '%'} tone={n(s.quality.validation_rate) < 50 ? 'danger' : 'ok'} /></div>
      <MonthBars rows={s.quality.monthly || []} upTo={upTo} label="Catatan logbook masuk per bulan" />
    </> },
    ...(reported ? [{ key: 'lapor', title: `Kepatuhan pelaporan ${isThisYear ? monthName : ''}`.trim(), body: <>
      <div className="pmStats"><Stat label="Ruangan sudah melapor" value={`${reported.done}/${reported.total}`} tone={reported.done < reported.total ? 'danger' : 'ok'} /></div>
      {reported.missing.length ? <><p className="pmMuted">Belum mengisi logbook:</p><ul className="pmRooms">{reported.missing.slice(0, 30).map((r) => <li key={r}>{r}</li>)}{reported.missing.length > 30 && <li>+{reported.missing.length - 30} lainnya</li>}</ul></> : <p className="pmBig">Seluruh ruangan sudah melapor.</p>}
    </> }] : []),
    { key: 'ikp', title: 'Keselamatan pasien', body: <>
      <div className="pmStats"><Stat label="Laporan insiden" value={f(s.incidents.total)} /><Stat label="Masih terbuka" value={f(s.incidents.open)} tone={n(s.incidents.open) ? 'danger' : 'ok'} /><Stat label="Selesai" value={f(s.incidents.closed)} /></div>
      <MonthBars rows={s.incidents.monthly || []} upTo={upTo} label="Laporan insiden per bulan (jumlah laporan, bukan tingkat kejadian)" />
    </> },
    { key: 'risiko', title: 'Manajemen risiko', body: <>
      <div className="pmStats"><Stat label="Risiko terdaftar" value={f(s.risk.total)} /><Stat label="Sangat tinggi" value={f(s.risk.very_high)} tone={n(s.risk.very_high) ? 'danger' : undefined} /><Stat label="Masih open" value={f(s.risk.open)} /></div>
      <Levels items={s.risk.levels || []} />
    </> },
    { key: 'rtl', title: 'Rekomendasi & rencana tindak lanjut', body: <>
      <div className="pmStats"><Stat label="Rekomendasi" value={f(s.program.recommendations)} /><Stat label="RTL" value={f(s.program.actions)} /><Stat label="Selesai" value={f(s.program.completed_actions)} tone="ok" /><Stat label="Lewat tenggat" value={f(s.program.overdue_actions)} tone={n(s.program.overdue_actions) ? 'danger' : undefined} /></div>
      {n(s.program.actions) > 0 && <div className="pmProgress" aria-label="Penyelesaian RTL"><i style={{ width: (n(s.program.completed_actions) / n(s.program.actions)) * 100 + '%' }} /><span>{Math.round((n(s.program.completed_actions) / n(s.program.actions)) * 100)}% RTL selesai</span></div>}
    </> },
    { key: 'diskusi', title: 'Poin diskusi & keputusan', body: <div className="pmNotes" contentEditable suppressContentEditableWarning onKeyDown={event => {
      if (event.key !== 'Escape' || event.nativeEvent.isComposing) return
      event.preventDefault()
      event.currentTarget.blur()
    }}>Klik untuk mengetik poin diskusi rapat…</div> },
  ]
  const last = slides.length - 1
  const go = useCallback((d: number) => setI((v) => Math.min(last, Math.max(0, v + d))), [last])

  useEffect(() => {
    if (!open) return
    setI(0)
    const el = root.current
    void el?.requestFullscreen?.().catch(() => {})
    return () => {
      if (el && document.fullscreenElement === el) void document.exitFullscreen().catch(() => {})
    }
  }, [open, root])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || !(e.target instanceof HTMLElement) || !root.current?.contains(e.target)) return
      if (e.target.isContentEditable || e.target.matches('input, select, textarea') || (e.key === ' ' && e.target.closest('button, a[href]'))) return
      if (e.key === 'ArrowRight' || e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); go(1) }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); go(-1) }
    }
    window.addEventListener('keydown', onKey)
    return () => { window.removeEventListener('keydown', onKey)}
  }, [open, go, root])

  if (!open || typeof document === 'undefined') return null
  const slide = slides[i]
  return createPortal(<div ref={root} tabIndex={-1} className="pmRoot" role="dialog" aria-modal="true" aria-label="Mode presentasi rapat">
    <div className="pmTop"><span>AUREKA · {scope} · {year}</span><button type="button" onClick={onClose} aria-label="Keluar dari presentasi">Keluar (Esc)</button></div>
    <section key={slide.key} className="pmSlide" aria-live="polite">
      {slide.title && <h2>{slide.title}</h2>}
      {slide.body}
    </section>
    <div className="pmNav">
      <button type="button" onClick={() => go(-1)} disabled={i === 0} aria-label="Slide sebelumnya">←</button>
      <div className="pmDots">{slides.map((sl, k) => <button key={sl.key} type="button" className={k === i ? 'on' : ''} aria-label={'Slide ' + (k + 1)} aria-current={k === i} onClick={() => setI(k)} />)}</div>
      <button type="button" onClick={() => go(1)} disabled={i === last} aria-label="Slide berikutnya">→</button>
      <span className="pmCount">{i + 1}/{slides.length}</span>
    </div>
  </div>, document.body)
}
