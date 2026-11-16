'use client'

import { useEffect, useState } from 'react'

type Step = { title: string; body: string; action?: { label: string; module: string } }

/**
 * Panduan singkat untuk pengguna yang pertama kali masuk (sekali per akun per perangkat).
 * Dapat dibuka lagi dari Pengaturan → Preferensi Tampilan (event 'aureka-open-tour').
 */
export default function WelcomeTour({ userId, isAdmin, role, onNavigate }: { userId: string; isAdmin: boolean; role?: string | null; onNavigate: (moduleId: string) => void }) {
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

  const r = String(role || '').toUpperCase()
  const persona: 'admin' | 'validator' | 'leader' | 'unit' = isAdmin || r === 'PMKP' ? 'admin' : r === 'VALIDATOR' ? 'validator' : ['MANAGEMENT', 'DIREKTUR', 'DEWAN_PENGAWAS'].includes(r) ? 'leader' : 'unit'
  const help: Step = { title: 'Bingung? Ada bantuan', body: 'Kalimat di bawah tiap menu menjelaskan isi halaman, atau tanya NARA AI. Panduan ini bisa dibuka lagi di Pengaturan → Preferensi Tampilan.' }
  const STEPS: Record<typeof persona, Step[]> = {
    unit: [
      { title: 'Selamat datang di AUREKA', body: 'Di sini ruangan Anda mencatat mutu pelayanan, melaporkan insiden, dan mencatat risiko. Ada 3 tugas utama, kami tunjukkan satu per satu.' },
      { title: '1 · Isi logbook tiap bulan', body: 'Buka Indikator Mutu → Form Logbook, pilih bulan, lalu isi berapa kasus yang memenuhi standar dari seluruh kasus. Beranda mengingatkan bila bulan ini belum diisi.', action: { label: 'Buka logbook', module: 'quality' } },
      { title: '2 · Lihat hasil ruangan', body: 'Tab Hasil Capaian menunjukkan capaian tiap indikator dibanding target, per bulan. Angka baru dihitung setelah catatan diperiksa validator.', action: { label: 'Lihat hasil', module: 'quality' } },
      { title: '3 · Laporkan insiden ≤ 2×24 jam', body: 'Kejadian yang membahayakan atau hampir membahayakan pasien dilaporkan lewat tombol "Lapor insiden" di Beranda. Isian tersimpan otomatis, dan warna grading muncul sendiri.', action: { label: 'Lapor insiden', module: 'safety' } },
      help,
    ],
    validator: [
      { title: 'Selamat datang, validator', body: 'Tugas Anda memeriksa logbook yang dikirim ruangan sebelum masuk ke hasil capaian.' },
      { title: 'Pilih ruangan & bulan', body: 'Di Indikator Mutu, pilih ruangan lalu periksa daftar logbook bulan tersebut.', action: { label: 'Buka logbook', module: 'quality' } },
      { title: 'Tekan "Sudah Diperiksa"', body: 'Satu klik memvalidasi seluruh logbook ruangan pada bulan itu. Bila ruangan mengubah data setelahnya, tombol akan meminta pemeriksaan ulang.' },
      help,
    ],
    admin: [
      { title: 'Selamat datang di AUREKA', body: 'Panduan singkat untuk Komite PMKP / admin: menyiapkan indikator, memantau kepatuhan, dan menyusun laporan.' },
      { title: 'Siapkan profil indikator', body: 'Ruangan baru bisa mengisi logbook setelah punya profil indikator aktif. Panel "Kelengkapan" menunjukkan unit yang belum, lengkap dengan template Excel untuk impor.', action: { label: 'Buka Indikator Mutu', module: 'quality' } },
      { title: 'Pantau dari Beranda', body: 'Kotak kiri atas memilih cakupan ruangan. Beranda menandai ruangan yang belum lapor, IKP lewat 2×24 jam, dan RTL lewat tenggat.' },
      { title: 'Laporan & rapat', body: 'Infografis punya tombol Laporan PDF (bulanan/triwulan/tahunan) dan Presentasi untuk rapat komite. Cadangan data Excel ada di Pengaturan → Konfigurasi Sistem.', action: { label: 'Buka Beranda', module: 'home' } },
      help,
    ],
    leader: [
      { title: 'Selamat datang di AUREKA', body: 'Ringkasan mutu, keselamatan pasien, dan risiko rumah sakit dalam satu tempat.' },
      { title: 'Infografis', body: 'Beranda → Infografis menampilkan grafik utama. Pilih grafik untuk menelusuri polanya.', action: { label: 'Buka Beranda', module: 'home' } },
      { title: 'Laporan & presentasi', body: 'Tombol Laporan PDF menyusun laporan siap tanda tangan; tombol Presentasi menampilkan ringkasan sebagai slide untuk rapat.' },
      help,
    ],
  }
  const steps = STEPS[persona]
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
