'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'

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
  const titleId = useId()
  const descriptionId = useId()
  const panelRef = useAccessibleDialog<HTMLDivElement>({
    open: mounted && open,
    onClose,
    closeOnEscape: !closeDisabled,
    lockScroll: true,
  })
  useEffect(() => { setMounted(true) }, [])

  if (!mounted || !open) return null
  return createPortal(
    <div className="akModalRoot" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget && !closeDisabled) onClose() }}>
      <div ref={panelRef} className={`akModal akModal-${size}`} role="dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={subtitle ? descriptionId : undefined} tabIndex={-1}>
        <span className="akModalGrip" aria-hidden="true" />
        <header className="akModalHead">
          <div>
            <h3 id={titleId}>{title}</h3>
            {subtitle && <p id={descriptionId}>{subtitle}</p>}
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
