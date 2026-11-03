'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

/**
 * Accessible controller for the existing AUREKA mobile navigation drawer.
 * Navigation contents and authorization-aware menu construction remain in HomeClient.
 */
export function useAccessibleSidebar() {
  const [isOpen, setIsOpen] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)

  const open = useCallback(() => setIsOpen(true), [])
  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    if (!isOpen) return

    const panel = panelRef.current
    const trigger = triggerRef.current
    const previousBodyOverflow = document.body.style.overflow

    document.body.style.overflow = 'hidden'

    const getFocusableElements = (): HTMLElement[] => {
      if (!panel) return []
      return Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (element) =>
          !element.hasAttribute('hidden') &&
          element.getAttribute('aria-hidden') !== 'true' &&
          element.getClientRects().length > 0,
      )
    }

    const initialFocus =
      panel?.querySelector<HTMLElement>('[data-sidebar-autofocus]') ??
      getFocusableElements()[0] ??
      panel

    initialFocus?.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        close()
        return
      }

      if (event.key !== 'Tab' || !panel) return

      const focusableElements = getFocusableElements()
      if (focusableElements.length === 0) {
        event.preventDefault()
        panel.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey && (activeElement === firstElement || activeElement === panel)) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    const handleResize = () => {
      if (window.innerWidth > 760) close()
    }

    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
      document.body.style.overflow = previousBodyOverflow

      if (trigger?.isConnected) trigger.focus()
    }
  }, [close, isOpen])

  return { isOpen, open, close, triggerRef, panelRef }
}
