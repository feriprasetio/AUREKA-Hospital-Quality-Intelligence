'use client'

import { useEffect, useState } from 'react'

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || ''

// Tanda versi = <meta name="aureka-build"> yang ditulis saat build. Bila di server berbeda, ada versi baru.
const currentSignature = () => document.querySelector<HTMLMetaElement>('meta[name="aureka-build"]')?.content || ''
const remoteSignature = async () => {
  const html = await fetch(BASE + '/?__v=' + Date.now(), { cache: 'no-store' }).then((r) => (r.ok ? r.text() : ''))
  return html.match(/<meta name="aureka-build" content="([^"]+)"/)?.[1] || ''
}
const reloadFresh = () => { const u = new URL(window.location.href); u.searchParams.set('v', Date.now().toString()); window.location.replace(u.toString()) }

/**
 * Memastikan browser & aplikasi terpasang (PWA) ikut versi terbaru tanpa harus hapus cache:
 * cek saat aplikasi dibuka/kembali aktif dan tiap 5 menit. Di halaman depan/masuk langsung dimuat ulang;
 * di dalam workspace muncul tombol "Muat ulang" agar isian yang belum disimpan tidak hilang.
 */
export default function UpdateNotifier() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    let local = ''
    let busy = false
    const check = async () => {
      if (busy || document.visibilityState !== 'visible') return
      busy = true
      try {
        local = local || currentSignature()
        const remote = await remoteSignature()
        if (!remote || !local || remote === local) return
        // Belum masuk workspace (halaman depan/masuk/daftar): aman langsung dimuat ulang.
        const inWorkspace = !!document.querySelector('.workspaceRoot, .plRoot')
        const typing = !!document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName)
        if (!inWorkspace && !typing) reloadFresh()
        else setReady(true)
      } catch { /* abaikan: offline atau server sibuk */ } finally { busy = false }
    }
    const first = window.setTimeout(check, 4000)
    const timer = window.setInterval(check, 5 * 60 * 1000)
    const onVisible = () => { if (document.visibilityState === 'visible') void check() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => { window.clearTimeout(first); window.clearInterval(timer); document.removeEventListener('visibilitychange', onVisible); window.removeEventListener('focus', onVisible) }
  }, [])
  if (!ready) return null
  return (
    <div className="akUpdateBar" role="status">
      <span>AUREKA versi baru tersedia.</span>
      <button type="button" onClick={reloadFresh}>Muat ulang</button>
      <button type="button" className="ghost" onClick={() => setReady(false)} aria-label="Nanti saja">Nanti</button>
    </div>
  )
}
