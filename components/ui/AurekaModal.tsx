'use client'

import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

/**
 * Jendela pop-up modern untuk formulir (tambah / edit).
 * - Dirender lewat portal ke <body> sehingga tidak terpotong oleh kontainer/animasi modul.
 * - Tutup dengan tombol ×, klik latar, atau tombol Esc. Scroll halaman dikunci saat terbuka.
 * - Di HP tampil sebagai "bottom sheet" penuh lebar; di layar lebar sebagai dialog di tengah.
 */
export default function AurekaModal({
  open,
  title,
  subtitle,
  onClose,
  children,
  footer,
  size = 'lg',
  closeDisabled = false,
}: {
  open: boolean
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl'
  closeDisabled?: boolean
}) {
  const [mounted, setMounted] = useState(false)
  const panelRef = useRef<HTMLDivElement | null>(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!open) return
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const prevFocus = document.activeElement as HTMLElement | null
    const t = window.setTimeout(() => {
      const first = panelRef.current?.querySelector<HTMLElement>('input:not([disabled]), select:not([disabled]), textarea:not([disabled])')
      ;(first || panelRef.current)?.focus({ preventScroll: true })
    }, 60)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !closeDisabled) closeRef.current() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.clearTimeout(t)
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      prevFocus?.focus?.({ preventScroll: true })
    }
  }, [open, closeDisabled])

  if (!mounted || !open) return null
  return createPortal(
    <div className="akModalRoot" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !closeDisabled) onClose() }}>
      <div ref={panelRef} className={`akModal akModal-${size}`} role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : undefined} tabIndex={-1}>
        <span className="akModalGrip" aria-hidden="true" />
        <header className="akModalHead">
          <div>
            <h3>{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="akModalClose" aria-label="Tutup" disabled={closeDisabled} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        <div className="akModalBody">{children}</div>
        {footer && <footer className="akModalFoot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
