'use client'

import { setAurekaMode, useAurekaMode } from '@/lib/ui/aureka-mode'

type LandingProps = {
  logoSrc: string
  onLogin: () => void
}

const basePath = process.env.NEXT_PUBLIC_BASE_PATH || ''

export default function PublicLandingPage({ logoSrc, onLogin }: LandingProps) {
  const mode = useAurekaMode()
  return (
    <main className="aurekaEntry">
      <div className="aurekaEntryCard">
        <div className="aurekaEntryIdentity">
          <button
            type="button"
            className="aurekaEntryTheme"
            aria-label={mode === 'gelap' ? 'Ganti ke tema terang' : 'Ganti ke tema gelap'}
            onClick={() => setAurekaMode(mode === 'gelap' ? 'terang' : 'gelap')}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">{mode === 'gelap'
              ? <><circle cx="12" cy="12" r="4" /><path d="M12 2v3m0 14v3M2 12h3m14 0h3M5 5l2 2m10 10 2 2m0-14-2 2M7 17l-2 2" /></>
              : <path d="M20 15A8.5 8.5 0 0 1 9 4a8.5 8.5 0 1 0 11 11Z" />}</svg>
          </button>
          <img src={logoSrc} width={160} height={136} alt="" fetchPriority="high" />
          <div>
            <h1>AUREKA</h1>
            <p>Hospital Quality Intelligence</p>
          </div>
          <button type="button" className="aurekaEntryAction" onClick={onLogin}>
            Masuk
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12h15m-6-6 6 6-6 6" /></svg>
          </button>
          <p className="aurekaEntryInstitution">RSUD Sultan Syarif Mohamad Alkadrie<br />Kota Pontianak</p>
        </div>
        <div className="aurekaEntryImage" aria-hidden="true">
          <img src={basePath + '/images/architecture-joel-filipe.jpg'} alt="" width={640} height={800} />
        </div>
      </div>
    </main>
  )
}
