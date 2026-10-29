'use client'

type Item = {
  id: 'imut' | 'cp' | 'akk'
  title: string
  icon: string
  summary: string
}

const ITEMS: Item[] = [
  {
    id: 'imut',
    title: 'Audit Indikator Mutu',
    icon: '▥',
    summary: 'Input, review, dan pantau indikator mutu nasional, rumah sakit, dan unit kerja.',
  },
  {
    id: 'cp',
    title: 'Audit Clinical Pathway',
    icon: '↗',
    summary: 'Audit per episode pasien, checklist lintas PPA, dan penghitungan kepatuhan.',
  },
  {
    id: 'akk',
    title: 'Audit Klinis dan Kematian',
    icon: '＋',
    summary: 'Telaah klinis terstruktur, pembelajaran, rekomendasi, dan tindak lanjut.',
  },
]

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
        {ITEMS.map((item, index) => (
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
