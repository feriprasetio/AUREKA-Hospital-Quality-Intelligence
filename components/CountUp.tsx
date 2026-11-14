'use client'
import { useEffect, useRef, useState } from 'react'

/** Angka naik cepat dari 0 ke nilai akhir (sekali, 700ms, ease-out). Menghormati reduced-motion. */
export default function CountUp({ value, format = (n: number) => n.toLocaleString('id-ID') }: { value: number; format?: (n: number) => string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(0)
  useEffect(() => {
    if (typeof window === 'undefined' || window.matchMedia('(prefers-reduced-motion: reduce)').matches || value === 0) { setShown(value); from.current = value; return }
    const start = performance.now(); const a = from.current; const d = 700; let raf = 0
    const tick = (t: number) => { const p = Math.min(1, (t - start) / d); const e = 1 - Math.pow(1 - p, 3); setShown(Math.round(a + (value - a) * e)); if (p < 1) raf = requestAnimationFrame(tick); else from.current = value }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value])
  return <span className="countUp">{format(shown)}</span>
}
