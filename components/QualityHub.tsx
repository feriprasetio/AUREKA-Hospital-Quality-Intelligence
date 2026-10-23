'use client'

import { useState } from 'react'

type Item = {
  id: string
  title: string
  ready: boolean
  icon: string
  summary: string
  detail: string[]
  needs?: string
}

const ITEMS: Item[] = [
  {
    id: 'imut',
    title: 'Audit Indikator Mutu',
    ready: true,
    icon: '📊',
    summary: 'Input dan pantau capaian indikator mutu (INM, IMP-RS, IMP-Unit) per unit dan periode.',
    detail: [],
  },
  {
    id: 'cp',
    title: 'Audit Clinical Pathway',
    ready: true,
    icon: '🧭',
    summary: 'Checklist CP lintas PPA per pasien, kalkulasi otomatis Bagian D, dan bukti kinerja OPPE.',
    detail: [],
  },
  {
    id: 'akk',
    title: 'Audit Klinis dan Kematian',
    ready: true,
    icon: '🩺',
    summary: 'Pemilihan kandidat otomatis dari episode pasien, telaah mutu pelayanan per fase, dan tindak lanjut.',
    detail: [
      'Menyeleksi kandidat audit dari episode pasien yang tersedia serta status akhir kematian yang tercatat.',
      'Menilai mutu pelayanan terstruktur per fase dengan komentar berbasis rekam medis.',
      'Mencatat kesimpulan, pelajaran, rekomendasi, dan status telaah untuk perbaikan mutu.',
    ],
  },
  {
    id: 'oppe',
    title: 'Audit OPPE',
    ready: false,
    icon: '👩‍⚕️',
    summary: 'Ongoing Professional Practice Evaluation: evaluasi praktik profesional berkelanjutan.',
    detail: [
      'Menilai kinerja tenaga medis/keperawatan secara berkala (perilaku, kepatuhan, capaian klinis).',
      'Dipakai komite medik/keperawatan sebagai dasar rekredensial dan penetapan kewenangan klinis.',
      'Hasil: rekap nilai OPPE per tenaga dan per periode penilaian.',
    ],
    needs: 'Indikator/instrumen OPPE per profesi dan periode penilaian yang dipakai rumah sakit.',
  },
]

export default function QualityHub({ onOpen, onOpenClinicalPathway, onOpenClinicalDeathReview }: { onOpen: () => void; onOpenClinicalPathway: () => void; onOpenClinicalDeathReview: () => void }) {
  const [info, setInfo] = useState<string | null>(null)
  const sel = ITEMS.find((i) => i.id === info) || null
  return (
    <div className="qhWrap">
      <div className="qhGrid">
        {ITEMS.map((it) => (
          <button
            key={it.id}
            type="button"
            className={`qhCard glassPanel ${it.ready ? 'ready' : 'soon'} ${info === it.id ? 'selected' : ''}`}
            onClick={() => (it.id === 'cp' ? onOpenClinicalPathway() : it.id === 'akk' ? onOpenClinicalDeathReview() : it.ready ? onOpen() : setInfo(info === it.id ? null : it.id))}
            aria-expanded={it.ready ? undefined : info === it.id}
          >
            <span className="qhTop">
              <span className="qhIcon" aria-hidden="true">{it.icon}</span>
              <span className={`qhBadge ${it.ready ? 'ok' : 'soon'}`}>{it.ready ? 'Siap dipakai' : 'Dalam pengembangan'}</span>
            </span>
            <b>{it.title}</b>
            <span className="qhSummary">{it.summary}</span>
            <span className="qhCta">{it.ready ? 'Buka modul →' : info === it.id ? 'Tutup penjelasan' : 'Lihat fungsi modul'}</span>
          </button>
        ))}
      </div>
      {sel && (
        <div className="qhInfo glassPanel" role="region" aria-label={`Penjelasan ${sel.title}`}>
          <div className="qhInfoHead">
            <div>
              <div className="eyebrow">MODUL DALAM PENGEMBANGAN</div>
              <h3>{sel.icon} {sel.title}</h3>
            </div>
            <button type="button" className="uBtn ghost" onClick={() => setInfo(null)}>Tutup ×</button>
          </div>
          <p className="qhInfoLead">Modul ini belum bisa dipakai untuk input data. Fungsinya nanti:</p>
          <ul>{sel.detail.map((d) => <li key={d}>{d}</li>)}</ul>
          {sel.needs && (
            <div className="qhNeeds">
              <b>Agar modul ini bisa dibuat, Komite PMKP perlu menyiapkan:</b>
              <span>{sel.needs}</span>
            </div>
          )}
          <p className="qhInfoFoot">Sementara ini, gunakan <b>Audit Indikator Mutu</b> untuk input indikator mutu unit.</p>
        </div>
      )}
    </div>
  )
}
