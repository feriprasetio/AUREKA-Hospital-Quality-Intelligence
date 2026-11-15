'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const KEY = 'aureka-last-active'
const EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

/**
 * Keluar otomatis bila workspace tidak dipakai. Aktivitas dicatat di localStorage
 * agar beberapa tab AUREKA saling berbagi waktu aktif terakhir.
 * Peringatan muncul `warnMs` sebelum batas; menekan "Tetap masuk" atau beraktivitas mereset waktu.
 */
export function useIdleLogout({ enabled, timeoutMs, warnMs, onTimeout }: { enabled: boolean; timeoutMs: number; warnMs: number; onTimeout: () => void }) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null)
  const lastWrite = useRef(0)
  const timeoutRef = useRef(onTimeout)
  timeoutRef.current = onTimeout

  const read = () => {
    try { return Number(localStorage.getItem(KEY)) || Date.now() } catch { return lastWrite.current || Date.now() }
  }
  const mark = useCallback((force = false) => {
    const now = Date.now()
    if (!force && now - lastWrite.current < 10_000) return
    lastWrite.current = now
    try { localStorage.setItem(KEY, String(now)) } catch { /* penyimpanan tidak tersedia */ }
  }, [])

  useEffect(() => {
    if (!enabled) { setSecondsLeft(null); return }
    mark(true)
    const onActivity = () => { if (document.visibilityState === 'visible') mark() }
    EVENTS.forEach((name) => window.addEventListener(name, onActivity, { passive: true, capture: true }))
    const tick = () => {
      const idle = Date.now() - read()
      if (idle >= timeoutMs) { setSecondsLeft(null); timeoutRef.current(); return }
      const remaining = timeoutMs - idle
      setSecondsLeft(remaining <= warnMs ? Math.ceil(remaining / 1000) : null)
    }
    const timer = window.setInterval(tick, 1000)
    document.addEventListener('visibilitychange', tick)
    return () => {
      EVENTS.forEach((name) => window.removeEventListener(name, onActivity, { capture: true }))
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [enabled, timeoutMs, warnMs, mark])

  const stay = useCallback(() => { mark(true); setSecondsLeft(null) }, [mark])
  return { secondsLeft, stay }
}
