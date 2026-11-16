'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { SupabaseClient } from '@supabase/supabase-js'
import AurekaModal from '@/components/ui/AurekaModal'
import { encodeQr, qrSvgPath } from '@/lib/qr/qr'

type Room = { id: number; name: string }
type Link = { id: number; room_id: number; token: string; is_active: boolean; created_at: string }
export type QrReport = { id: string; room_id: number; payload: Record<string, string>; status: string; created_at: string }

const newToken = () => {
  const a = new Uint8Array(18); crypto.getRandomValues(a)
  return Array.from(a, (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'[b % 57]).join('')
}
const linkUrl = (token: string) => `${window.location.origin}${process.env.NEXT_PUBLIC_BASE_PATH || ''}/lapor/?t=${token}`

function QrImage({ text, size = 180 }: { text: string; size?: number }) {
  const { path, size: n } = useMemo(() => qrSvgPath(encodeQr(text)), [text])
  return <svg className="qrImg" width={size} height={size} viewBox={`0 0 ${n} ${n}`} role="img" aria-label="Kode QR lapor insiden" shapeRendering="crispEdges"><rect width={n} height={n} fill="#fff" /><path d={path} fill="#000" /></svg>
}

/** Antrean laporan IKP yang masuk lewat QR + pengelolaan QR per ruangan (Admin/PMKP). */
export default function QrReportsPanel({ supabase, rooms, onProcess, refreshKey }: { supabase: SupabaseClient; rooms: Room[]; onProcess: (r: QrReport, roomName: string) => void; refreshKey?: number }) {
  const db = useMemo(() => (supabase as any).schema('aureka_patient_safety'), [supabase])
  const [reports, setReports] = useState<QrReport[]>([])
  const [links, setLinks] = useState<Link[]>([])
  const [ready, setReady] = useState<boolean | null>(null)
  const [open, setOpen] = useState(false)
  const [room, setRoom] = useState('')
  const [msg, setMsg] = useState('')
  const roomName = (id: number) => rooms.find((r) => Number(r.id) === Number(id))?.name ?? 'Ruangan ' + id

  const load = useCallback(async () => {
    const [r, l] = await Promise.all([
      db.from('public_incident_reports').select('id,room_id,payload,status,created_at').eq('status', 'baru').order('created_at', { ascending: false }).limit(50),
      db.from('public_report_links').select('id,room_id,token,is_active,created_at').order('created_at', { ascending: false }),
    ])
    // Tabel belum ada (migrasi belum dijalankan) atau tidak berhak: sembunyikan panel.
    if (r.error || l.error) { setReady(false); return }
    setReady(true); setReports((r.data || []) as QrReport[]); setLinks((l.data || []) as Link[])
  }, [db])
  useEffect(() => { void load() }, [load, refreshKey])

  const ignore = async (id: string) => {
    const { data: auth } = await supabase.auth.getUser()
    const { error } = await db.from('public_incident_reports').update({ status: 'diabaikan', processed_by: auth.user?.id, processed_at: new Date().toISOString() }).eq('id', id)
    if (error) setMsg('Gagal: ' + error.message); else void load()
  }
  const createLink = async () => {
    if (!room) return
    const { error } = await db.from('public_report_links').insert({ room_id: Number(room), token: newToken() })
    if (error) setMsg('QR gagal dibuat: ' + error.message); else { setMsg(''); void load() }
  }
  const toggle = async (l: Link) => {
    const { error } = await db.from('public_report_links').update({ is_active: !l.is_active }).eq('id', l.id)
    if (error) setMsg('Gagal: ' + error.message); else void load()
  }
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(linkUrl(t)); setMsg('Tautan disalin.') } catch { setMsg(linkUrl(t)) } }
  const print = (l: Link) => {
    const w = window.open('', '_blank'); if (!w) return
    const { path, size } = qrSvgPath(encodeQr(linkUrl(l.token)))
    w.document.write(`<!doctype html><html lang="id"><head><meta charset="utf-8"><title>QR Lapor IKP · ${roomName(l.room_id)}</title><style>body{font-family:Arial,sans-serif;text-align:center;padding:30px;color:#1f2430}h1{font-size:28px;margin:0 0 6px}p{font-size:16px;margin:6px 0}svg{width:320px;height:320px;margin:18px auto;display:block}small{color:#555}</style></head><body><h1>Lapor Insiden Keselamatan Pasien</h1><p><b>${roomName(l.room_id).replace(/</g, '&lt;')}</b></p><svg viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${path}" fill="#000"/></svg><p>Pindai dengan kamera HP. Tanpa login, rahasia, bukan untuk mencari kesalahan.</p><p><small>Laporkan paling lambat 2×24 jam. Jangan tulis nama/No. RM pasien.</small></p><script>setTimeout(function(){window.print()},300)</script></body></html>`)
    w.document.close()
  }

  if (!ready) return null
  return <section className="qrPanel" aria-label="Laporan masuk lewat QR">
    <div className="qrHead">
      <div><strong>Laporan via QR</strong><span>{reports.length ? `${reports.length} laporan baru menunggu diproses` : 'Belum ada laporan baru dari QR ruangan.'}</span></div>
      <button type="button" className="psBtn" onClick={() => setOpen(true)}>Kelola QR ruangan</button>
    </div>
    {reports.length > 0 && <ul className="qrList">{reports.map((r) => <li key={r.id}>
      <div><b>{r.payload.A1?.slice(0, 140) || '(tanpa uraian)'}</b><small>{roomName(r.room_id)} · {r.payload.A7 || 'jenis belum dipilih'} · {r.payload.A2 || ''} · masuk {new Date(r.created_at).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</small></div>
      <div className="qrActs"><button type="button" className="psBtn" onClick={() => void ignore(r.id)}>Abaikan</button><button type="button" className="psBtn primary" onClick={() => onProcess(r, roomName(r.room_id))}>Proses jadi laporan</button></div>
    </li>)}</ul>}
    {msg && !open && <p className="psHint">{msg}</p>}
    <AurekaModal open={open} size="lg" title="QR lapor insiden per ruangan" subtitle="Tempel QR di ruangan. Staf memindai dan melapor tanpa login; laporan masuk ke antrean di atas." onClose={() => { setOpen(false); setMsg('') }}>
      <div className="qrCreate"><select aria-label="Pilih ruangan" value={room} onChange={(e) => setRoom(e.target.value)}><option value="">Pilih ruangan…</option>{rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select><button type="button" className="psBtn primary" disabled={!room} onClick={() => void createLink()}>Buat QR</button></div>
      {msg && <p className="psHint">{msg}</p>}
      {links.length === 0 ? <p className="psHint">Belum ada QR. Pilih ruangan lalu tekan Buat QR.</p> : <div className="qrGrid">{links.map((l) => <article key={l.id} className={l.is_active ? '' : 'off'}>
        <QrImage text={linkUrl(l.token)} size={150} />
        <b>{roomName(l.room_id)}</b><small>{l.is_active ? 'Aktif' : 'Nonaktif'}</small>
        <div className="qrActs"><button type="button" className="psBtn" onClick={() => void copy(l.token)}>Salin tautan</button><button type="button" className="psBtn" onClick={() => print(l)} disabled={!l.is_active}>Cetak</button><button type="button" className="psBtn" onClick={() => void toggle(l)}>{l.is_active ? 'Nonaktifkan' : 'Aktifkan'}</button></div>
      </article>)}</div>}
    </AurekaModal>
  </section>
}
