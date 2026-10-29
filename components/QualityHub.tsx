'use client'

import { AUREKA_QUALITY_FEATURES } from '@/lib/aureka/module-registry'

type Item = (typeof AUREKA_QUALITY_FEATURES)[number]

export default function QualityHub({
  onOpen,
  onOpenClinicalPathway,
  onOpenClinicalDeathReview,
}: {
  onOpen: () => void
  onOpenClinicalPathway: () => void
  onOpenClinicalDeathReview: () => void
}) {
  const open = (id: Item['id']) => {
    if (id === 'cp') onOpenClinicalPathway()
    else if (id === 'akk') onOpenClinicalDeathReview()
    else onOpen()
  }

  return (
    <section className="qhWrap" aria-labelledby="qh-title">
      <header className="qhHeader">
        <div>
          <div className="qhEyebrow">MUTU KLINIS · RUANG KERJA</div>
          <h3 id="qh-title">Pilih modul audit</h3>
          <p>Setiap modul membuka alur kerja khusus dengan sumber data dan aturan validasi yang sesuai.</p>
        </div>
      </header>
      <div className="qhGrid">
        {AUREKA_QUALITY_FEATURES.map((item, index) => (
          <button
            key={item.id}
            type="button"
            className="qhCard glassPanel ready"
            onClick={() => open(item.id)}
          >
            <span className="qhTop">
              <span className="qhIcon" aria-hidden="true">{item.icon}</span>
              <span className="qhIndex">{String(index + 1).padStart(2, '0')}</span>
            </span>
            <b>{item.title}</b>
            <span className="qhSummary">{item.summary}</span>
            <span className="qhCta">Buka modul <span aria-hidden="true">→</span></span>
          </button>
        ))}
      </div>
    </section>
  )
}
