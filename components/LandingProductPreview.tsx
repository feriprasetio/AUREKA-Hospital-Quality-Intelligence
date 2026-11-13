'use client'

import { useState, type KeyboardEvent } from 'react'

const previews = [
  {
    id: 'quality',
    label: 'Mutu klinis',
    heading: 'Dari pencatatan, menjadi perbaikan.',
    subtitle: 'Satu alur yang jelas untuk setiap audit pelayanan.',
    columns: ['Pencatatan', 'Review & validasi', 'Evaluasi'],
    items: [
      { title: 'Audit indikator mutu', description: 'Logbook, periode, dan sumber data', badge: 'Terstruktur' },
      { title: 'Clinical Pathway', description: 'Kelengkapan dan kepatuhan episode', badge: 'Tertelusur' },
      { title: 'Hasil capaian', description: 'Numerator, denominator, dan target', badge: 'Terukur' },
    ],
    foot: 'Setiap hasil mengikuti definisi indikator dan status validasi.',
  },
  {
    id: 'safety',
    label: 'Keselamatan',
    heading: 'Setiap laporan, peluang untuk belajar.',
    subtitle: 'Hubungkan pelaporan insiden dengan tindak lanjut.',
    columns: ['Pelaporan', 'Investigasi', 'Pembelajaran'],
    items: [
      { title: 'Laporan insiden', description: 'Kronologi dan klasifikasi kejadian', badge: 'Terdokumentasi' },
      { title: 'Investigasi / RCA', description: 'Analisis penyebab dan rekomendasi', badge: 'Sistematis' },
      { title: 'Tindak lanjut', description: 'Penanggung jawab dan evaluasi', badge: 'Akuntabel' },
    ],
    foot: 'Identitas pasien dan narasi insiden tidak ditampilkan di halaman publik.',
  },
  {
    id: 'risk',
    label: 'Risiko',
    heading: 'Kenali prioritas. Kendalikan risikonya.',
    subtitle: 'Pantau risiko dan rencana pengendalian dalam konteks.',
    columns: ['Identifikasi', 'Penilaian', 'Pengendalian'],
    items: [
      { title: 'Risk Register', description: 'Kejadian, penyebab, dan dampak', badge: 'Terpetakan' },
      { title: 'Penilaian risiko', description: 'Kemungkinan dan tingkat dampak', badge: 'Terarah' },
      { title: 'Rencana pengendalian', description: 'PIC, target waktu, dan bukti', badge: 'Terpantau' },
    ],
    foot: 'Penilaian dan pengendalian tetap mengikuti kewenangan unit.',
  },
] as const

export default function LandingProductPreview() {
  const [selected, setSelected] = useState(0)

  const navigateTabs = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % previews.length
      : event.key === 'ArrowLeft' ? (index + previews.length - 1) % previews.length
        : event.key === 'Home' ? 0 : event.key === 'End' ? previews.length - 1 : null
    if (next === null) return
    event.preventDefault()
    setSelected(next)
    document.getElementById(`product-tab-${previews[next].id}`)?.focus()
  }

  return (
    <div className="ap-preview">
      <div className="ap-window-head">
        <span className="ap-window-dots" aria-hidden="true"><i /><i /><i /></span>
        <span>aureka / workspace</span>
        <span className="ap-window-label">Tur produk</span>
      </div>
      <div className="ap-app">
        <div className="ap-rail" aria-hidden="true">
          <span className="ap-rail-brand">a.</span>
          <svg viewBox="0 0 24 24"><path d="m4 10 8-6 8 6v10H4zM9 20v-7h6v7" /></svg>
          <span className="ap-rail-active"><svg viewBox="0 0 24 24"><path d="M5 19V9m7 10V5m7 14v-7M3 20h18" /></svg></span>
          <svg viewBox="0 0 24 24"><path d="m12 3 8 3v5c0 5-4 8-8 10-4-2-8-5-8-10V6zM8 12l3 3 5-6" /></svg>
          <svg viewBox="0 0 24 24"><path d="m12 3 9 17H3zM12 9v5m0 3v1" /></svg>
          <span className="ap-rail-avatar">A</span>
        </div>
        <div className="ap-main">
          <div className="ap-context"><span>Hospital Quality Intelligence</span><span className="ap-context-lock"><svg viewBox="0 0 20 20" aria-hidden="true"><rect x="4" y="9" width="12" height="9" rx="2" /><path d="M6 9V6a4 4 0 0 1 8 0v3" /></svg> Akses berbasis peran</span></div>
          <div className="ap-tabs" role="tablist" aria-label="Jelajahi alur AUREKA">
            {previews.map((item, index) => (
              <button type="button" role="tab" id={`product-tab-${item.id}`} key={item.id}
                aria-selected={selected === index} aria-controls={`product-panel-${item.id}`}
                tabIndex={selected === index ? 0 : -1} onClick={() => setSelected(index)}
                onKeyDown={(event) => navigateTabs(event, index)}>{item.label}</button>
            ))}
          </div>
          {previews.map((preview, index) => <div className="ap-panel" role="tabpanel" key={preview.id} id={`product-panel-${preview.id}`} aria-labelledby={`product-tab-${preview.id}`} hidden={selected !== index}>
            <div className="ap-heading"><span>Ruang kerja terintegrasi</span><h2>{preview.heading}</h2><p>{preview.subtitle}</p></div>
            <div className="ap-process" aria-label="Tahapan proses">
              {preview.columns.map((column, index) => <div key={column}><span>{String(index + 1).padStart(2, '0')}</span><b>{column}</b>{index < 2 && <i aria-hidden="true">→</i>}</div>)}
            </div>
            <div className="ap-records">
              <div className="ap-records-head"><span>Fokus pengelolaan</span><span>Pendekatan</span></div>
              {preview.items.map((item, index) => <div className="ap-record" key={item.title}><span className="ap-record-icon" aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><div><strong>{item.title}</strong><small>{item.description}</small></div><span className="ap-record-badge">{item.badge}</span></div>)}
            </div>
            <p className="ap-footnote"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="m10 2 7 3v5c0 4-4 6-7 8-3-2-7-4-7-8V5zM7 10l2 2 4-4" /></svg>{preview.foot}</p>
          </div>)}
        </div>
      </div>
      <div className="ap-caption"><span className="ap-caption-dot" /> Ilustrasi alur kerja · Bukan data operasional</div>
    </div>
  )
}
