'use client'

import { useEffect, useState } from 'react'
import { aurekaSupabase } from '@/lib/aureka/supabase'
import { toUserFacingError } from '@/lib/ui/error-feedback'

const TYPES = ['Kejadian Sentinel', 'Kejadian Tidak Diharapkan (KTD)', 'Kejadian Nyaris Cedera (KNC)', 'Kejadian Tidak Cedera (KTC)', 'Kejadian Potensial Cedera Signifikan (KPCs)']
const TYPE_HINT: Record<string, string> = {
  'Kejadian Sentinel': 'Kematian atau cedera berat yang tidak terduga',
  'Kejadian Tidak Diharapkan (KTD)': 'Pasien cedera',
  'Kejadian Nyaris Cedera (KNC)': 'Hampir terjadi, belum sampai ke pasien',
  'Kejadian Tidak Cedera (KTC)': 'Sudah terjadi ke pasien, tetapi tidak cedera',
  'Kejadian Potensial Cedera Signifikan (KPCs)': 'Kondisi yang berpotensi mencederai, belum ada insiden',
}
const today = () => new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10)

/** Halaman publik lapor IKP dari QR ruangan. Tanpa login, tanpa identitas pasien. */
export default function PublicIncidentReport() {
  const [token, setToken] = useState('')
  const [room, setRoom] = useState<string | null>(null)
  const [state, setState] = useState<'loading' | 'invalid' | 'unavailable' | 'form' | 'sending' | 'done'>('loading')
  const [err, setErr] = useState('')
  const [ref, setRef] = useState('')
  const [f, setF] = useState<Record<string, string>>({ A2: today() })
  const set = (k: string, v: string) => setF((c) => ({ ...c, [k]: v }))

  useEffect(() => {
    let cancelled = false
    document.documentElement.removeAttribute('data-ak-booting')
    const t = new URLSearchParams(window.location.search).get('t') || ''
    setToken(t)
    if (!t) { setState('invalid'); return }
    void (async () => {
      try {
        const { data, error } = await aurekaSupabase.rpc('aureka_public_report_link_info', { p_token: t })
        if (cancelled) return
        if (error) {
          setErr(toUserFacingError(error, { fallback: 'Tautan pelaporan belum dapat diperiksa. Periksa koneksi, lalu muat ulang halaman.' }))
          setState('unavailable')
          return
        }
        if (!data) { setState('invalid'); return }
        setRoom(String((data as any).room_name || 'Ruangan'))
        setState('form')
      } catch (error) {
        if (cancelled) return
        setErr(toUserFacingError(error, { fallback: 'Tautan pelaporan belum dapat diperiksa. Periksa koneksi, lalu muat ulang halaman.' }))
        setState('unavailable')
      }
    })()
    return () => { cancelled = true }
  }, [])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if ((f.website || '').trim()) return // jebakan bot
    setErr('')
    if ((f.A1 || '').trim().length < 10) { setErr('Ceritakan singkat apa yang terjadi (minimal 10 karakter).'); return }
    if (!f.A7) { setErr('Pilih jenis insiden.'); return }
    setState('sending')
    const payload: Record<string, string> = {}
    for (const k of ['A1', 'A2', 'A3', 'A4', 'A7', 'A8', 'B1', 'D3', 'reporter_name', 'reporter_contact']) if ((f[k] || '').trim()) payload[k] = f[k].trim()
    try {
      const { data, error } = await aurekaSupabase.rpc('aureka_public_submit_incident', { p_token: token, p_payload: payload })
      if (error) {
        setErr(toUserFacingError(error, { fallback: 'Laporan belum terkirim. Periksa koneksi, lalu coba lagi.' }))
        setState('form')
        return
      }
      setRef(String((data as any)?.reference || ''))
      setState('done')
    } catch (error) {
      setErr(toUserFacingError(error, { fallback: 'Laporan belum terkirim. Periksa koneksi, lalu coba lagi.' }))
      setState('form')
    }
  }

  return <main className="plRoot">
    <div className="plCard">
      <header className="plHead"><span className="plBrand">AUREKA · Keselamatan Pasien</span><h1>Lapor insiden</h1>{room && <p>Ruangan: <b>{room}</b></p>}</header>
      {state === 'loading' && <p className="plMuted">Memeriksa tautan…</p>}
      {state === 'invalid' && <div className="plNote warn"><b>Tautan tidak berlaku.</b> Pindai ulang kode QR di ruangan, atau laporkan lewat aplikasi AUREKA / Tim Keselamatan Pasien.</div>}
      {state === 'unavailable' && <div className="plNote warn" role="alert">{err || 'Tautan pelaporan belum dapat diperiksa. Periksa koneksi, lalu muat ulang halaman.'}</div>}
      {state === 'done' && <div className="plDone"><div className="plCheck" aria-hidden="true">✓</div><h2>Terima kasih, laporan terkirim</h2><p>Nomor referensi: <b>{ref}</b></p><p className="plMuted">Tim Keselamatan Pasien akan menindaklanjuti. Melapor membantu mencegah kejadian berulang, bukan untuk mencari siapa yang salah.</p><button type="button" className="plBtn ghost" onClick={() => { setF({ A2: today() }); setState('form') }}>Buat laporan lain</button></div>}
      {(state === 'form' || state === 'sending') && <form onSubmit={submit} noValidate>
        <div className="plNote">Rahasia dan tidak untuk mencari kesalahan. <b>Jangan tulis nama atau No. RM pasien</b> di sini; Tim KP akan melengkapinya.</div>
        <label className="plField"><span>Apa yang terjadi? *</span><textarea rows={4} value={f.A1 || ''} onChange={(e) => set('A1', e.target.value)} placeholder="Contoh: pasien hampir diberi obat milik pasien sebelah, diketahui saat cek gelang identitas." required /></label>
        <div className="plGrid">
          <label className="plField"><span>Tanggal *</span><input type="date" value={f.A2 || ''} max={today()} onChange={(e) => set('A2', e.target.value)} required /></label>
          <label className="plField"><span>Jam (perkiraan)</span><input type="time" value={f.A3 || ''} onChange={(e) => set('A3', e.target.value)} /></label>
        </div>
        <label className="plField"><span>Lokasi tepatnya</span><input value={f.A4 || ''} onChange={(e) => set('A4', e.target.value)} placeholder="Mis. bed 3, ruang tindakan" /></label>
        <fieldset className="plField"><legend>Jenis insiden *</legend>
          {TYPES.map((t) => <label key={t} className={'plRadio' + (f.A7 === t ? ' on' : '')}><input type="radio" name="A7" checked={f.A7 === t} onChange={() => set('A7', t)} /><span><b>{t}</b><small>{TYPE_HINT[t]}</small></span></label>)}
        </fieldset>
        <label className="plField"><span>Akibat pada pasien</span><textarea rows={2} value={f.A8 || ''} onChange={(e) => set('A8', e.target.value)} /></label>
        <label className="plField"><span>Kronologi singkat</span><textarea rows={3} value={f.B1 || ''} onChange={(e) => set('B1', e.target.value)} placeholder="Sebelum, saat, dan sesudah kejadian" /></label>
        <label className="plField"><span>Tindakan yang sudah dilakukan</span><textarea rows={2} value={f.D3 || ''} onChange={(e) => set('D3', e.target.value)} /></label>
        <div className="plGrid">
          <label className="plField"><span>Nama Anda (boleh dikosongkan)</span><input value={f.reporter_name || ''} onChange={(e) => set('reporter_name', e.target.value)} autoComplete="name" /></label>
          <label className="plField"><span>Kontak (opsional)</span><input value={f.reporter_contact || ''} onChange={(e) => set('reporter_contact', e.target.value)} placeholder="No. HP / ekstensi" /></label>
        </div>
        <input className="plTrap" tabIndex={-1} autoComplete="off" aria-hidden="true" value={f.website || ''} onChange={(e) => set('website', e.target.value)} />
        {err && <p className="plErr" role="alert">{err}</p>}
        <button type="submit" className="plBtn" disabled={state === 'sending'}>{state === 'sending' ? 'Mengirim…' : 'Kirim laporan'}</button>
      </form>}
    </div>
  </main>
}
