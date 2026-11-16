'use client'

import { useEffect, useState } from 'react'

type Step = { title: string; body: string; action?: { label: string; module: string } }

/**
 * Panduan singkat untuk pengguna yang pertama kali masuk (sekali per akun per perangkat).
 * Dapat dibuka lagi dari Pengaturan → Preferensi Tampilan (event 'aureka-open-tour').
 */
export default function WelcomeTour({ userId, isAdmin, onNavigate }: { userId: string; isAdmin: boolean; onNavigate: (moduleId: string) => void }) {
  const [open, setOpen] = useState(false)
  const [i, setI] = useState(0)
  const key = 'aureka-tour-done:' + userId

  useEffect(() => {
    if (!userId) return
    try { if (localStorage.getItem(key) !== '1') { setI(0); setOpen(true) } } catch { /* abaikan */ }
    const reopen = () => { setI(0); setOpen(true) }
    window.addEventListener('aureka-open-tour', reopen)
    return () => window.removeEventListener('aureka-open-tour', reopen)
  }, [userId, key])

  const steps: Step[] = [
    { title: 'Selamat datang di AUREKA', body: 'Tempat mencatat dan memantau mutu pelayanan, keselamatan pasien, dan risiko rumah sakit. Panduan ini hanya beberapa langkah singkat.' },
    isAdmin
      ? { title: 'Pilih cakupan ruangan', body: 'Kotak di kiri atas menentukan data ruangan mana yang tampil. Pilih "Semua ruangan" untuk melihat seluruh rumah sakit.' }
      : { title: 'Data ruangan Anda', body: 'AUREKA otomatis menampilkan data ruangan tempat Anda bertugas. Menu di kiri (atau di bawah pada HP) membawa Anda ke tiap bagian.' },
    { title: 'Isi logbook indikator mutu', body: 'Setiap bulan, isi berapa kasus yang memenuhi standar dari seluruh kasus. Beranda akan mengingatkan bila logbook bulan ini belum diisi.', action: { label: 'Buka logbook', module: 'quality' } },
    { title: 'Laporkan insiden', body: 'Kejadian yang membahayakan atau hampir membahayakan pasien dilaporkan paling lambat 2×24 jam lewat tombol "Lapor insiden" di Beranda.', action: { label: 'Lapor insiden', module: 'safety' } },
    { title: 'Bingung? Ada bantuan', body: 'Kalimat berwarna di bawah tiap menu menjelaskan isi halaman. Arahkan kursor ke menu untuk penjelasan singkat, atau tanya NARA AI. Panduan ini bisa dibuka lagi di Pengaturan → Preferensi Tampilan.' },
  ]
  const step = steps[Math.min(i, steps.length - 1)]
  const last = i >= steps.length - 1
  const close = () => { setOpen(false); try { localStorage.setItem(key, '1') } catch { /* abaikan */ } }

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  if (!open) return null
  return (
    <div className="akTourBackdrop">
      <div className="akTour" role="dialog" aria-modal="true" aria-labelledby="ak-tour-title" aria-describedby="ak-tour-body">
        <div className="akTourDots" aria-label={'Langkah ' + (i + 1) + ' dari ' + steps.length}>
          {steps.map((_, n) => <i key={n} className={n === i ? 'on' : n < i ? 'done' : ''} />)}
        </div>
        <h2 id="ak-tour-title">{step.title}</h2>
        <p id="ak-tour-body">{step.body}</p>
        {step.action && <button type="button" className="akTourLink" onClick={() => { close(); onNavigate(step.action!.module) }}>{step.action.label} →</button>}
        <div className="akTourActions">
          <button type="button" className="akTourSkip" onClick={close}>{last ? 'Tutup' : 'Lewati'}</button>
          <div>
            {i > 0 && <button type="button" onClick={() => setI(i - 1)}>Kembali</button>}
            <button type="button" className="primary" autoFocus onClick={() => (last ? close() : setI(i + 1))}>{last ? 'Mulai pakai' : 'Lanjut'}</button>
          </div>
        </div>
      </div>
    </div>
  )
}
