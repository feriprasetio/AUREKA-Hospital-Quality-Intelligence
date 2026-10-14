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
    ready: false,
    icon: '🧭',
    summary: 'Audit kepatuhan pelaksanaan clinical pathway pada diagnosis prioritas.',
    detail: [
      'Memeriksa apakah tata laksana pasien sesuai langkah clinical pathway (PPK) yang ditetapkan.',
      'Mencatat variasi/penyimpangan, lama rawat (LOS), dan alasan ketidakpatuhan.',
      'Hasil: persentase kepatuhan per clinical pathway dan per DPJP sebagai bahan evaluasi KSM.',
    ],
    needs: 'Daftar clinical pathway yang diaudit dan formulir/ceklis audit yang dipakai rumah sakit.',
  },
  {
    id: 'akk',
    title: 'Audit Klinis dan Kematian',
    ready: false,
    icon: '🩺',
    summary: 'Telaah kasus klinis dan kasus kematian untuk menemukan masalah pelayanan.',
    detail: [
      'Mendata kasus kematian/kasus klinis terpilih beserta kronologi pelayanan.',
      'Telaah oleh tim (komite medik/PMKP): kategori kematian, ada tidaknya masalah pelayanan.',
      'Hasil: rekomendasi dan tindak lanjut perbaikan, serta angka kematian (mis. GDR/NDR) per periode.',
    ],
    needs: 'Formulir audit kematian/audit klinis yang berlaku dan siapa yang berwenang mengisi.',
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

export default function QualityHub({ onOpen }: { onOpen: () => void }) {
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
            onClick={() => (it.ready ? onOpen() : setInfo(info === it.id ? null : it.id))}
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
