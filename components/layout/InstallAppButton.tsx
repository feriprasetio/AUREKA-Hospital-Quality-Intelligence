'use client'

import { useEffect, useState } from 'react'

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }

/** Tombol "Pasang AUREKA" (PWA). Android/Chrome/Edge: dialog pasang bawaan; iPhone: petunjuk Bagikan → Tambah ke Layar Utama. */
export default function InstallAppButton() {
  const [evt, setEvt] = useState<PromptEvent | null>(null)
  const [installed, setInstalled] = useState(false)
  const [ios, setIos] = useState(false)
  const [msg, setMsg] = useState('')
  useEffect(() => {
    const standalone = window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
    setInstalled(standalone)
    setIos(/iphone|ipad|ipod/i.test(navigator.userAgent))
    const w = window as unknown as { __akInstall?: PromptEvent }
    if (w.__akInstall) setEvt(w.__akInstall)
    const onPrompt = (e: Event) => { e.preventDefault(); w.__akInstall = e as PromptEvent; setEvt(e as PromptEvent) }
    const onInstalled = () => { setInstalled(true); setEvt(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => { window.removeEventListener('beforeinstallprompt', onPrompt); window.removeEventListener('appinstalled', onInstalled) }
  }, [])
  if (installed) return <p className="stPanelHint">AUREKA sudah terpasang di perangkat ini.</p>
  return (
    <div className="akInstall">
      <button type="button" className="akInstallBtn" onClick={async () => {
        if (evt) { await evt.prompt(); const r = await evt.userChoice; setMsg(r.outcome === 'accepted' ? 'Terpasang. Buka AUREKA dari layar utama.' : 'Dibatalkan.'); setEvt(null); return }
        setMsg(ios ? 'Di iPhone/iPad: ketuk tombol Bagikan (kotak dengan panah) di Safari, lalu pilih "Tambah ke Layar Utama".' : 'Buka menu browser (⋮) lalu pilih "Pasang aplikasi" atau "Tambahkan ke layar utama".')
      }}>Pasang AUREKA di perangkat ini</button>
      {msg && <p className="stPanelHint" role="status">{msg}</p>}
    </div>
  )
}
