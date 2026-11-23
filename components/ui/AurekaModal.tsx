'use client'

import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
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
  closeOnBackdrop = true,
  role = 'dialog',
}: {
  open: boolean
  title: ReactNode
  subtitle?: ReactNode
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  size?: 'md' | 'lg' | 'xl'
  closeDisabled?: boolean
  closeOnBackdrop?: boolean
  role?: 'dialog' | 'alertdialog'
}) {
  const [mounted, setMounted] = useState(false)
  const backdropPressed = useRef(false)
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
    <div className="akModalRoot" role="presentation"
      onPointerDown={event => { backdropPressed.current = event.isPrimary && event.button === 0 && event.target === event.currentTarget }}
      onPointerCancel={() => { backdropPressed.current = false }}
      onClick={event => {
        const dismiss = backdropPressed.current && event.target === event.currentTarget
        backdropPressed.current = false
        if (dismiss && closeOnBackdrop && !closeDisabled) onClose()
      }}>
      <div ref={panelRef} className={`akModal akModal-${size}`} role={role} aria-modal="true" aria-labelledby={titleId} aria-describedby={subtitle ? descriptionId : undefined} tabIndex={-1}>
        <header className="akModalHead">
          <div>
            <h3 id={titleId}>{title}</h3>
            {subtitle && <p id={descriptionId}>{subtitle}</p>}
          </div>
          <button type="button" className="akModalClose" aria-label="Tutup" disabled={closeDisabled} onClick={onClose}>
            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
          </button>
        </header>
        {children != null && <div className="akModalBody">{children}</div>}
        {footer && <footer className="akModalFoot">{footer}</footer>}
      </div>
    </div>,
    document.body,
  )
}
