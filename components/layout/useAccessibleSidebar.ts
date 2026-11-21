'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { PHONE_DRAWER_MEDIA_QUERY } from '@/lib/ui/device-navigation'

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
  const [isMobile, setIsMobile] = useState(false)
  const triggerRef = useRef<HTMLButtonElement | null>(null)
  const requestedTriggerRef = useRef<HTMLElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)

  // Preserve the control that actually opened the drawer (header or phone menu).
  const open = useCallback((trigger?: HTMLElement | null) => {
    // Defend against an accidental desktop/tablet caller, not just CSS.
    if (typeof window === 'undefined' || !window.matchMedia(PHONE_DRAWER_MEDIA_QUERY).matches) return
    if (trigger) requestedTriggerRef.current = trigger
    setIsOpen(true)
  }, [])
  const close = useCallback(() => setIsOpen(false), [])

  useEffect(() => {
    const width = window.matchMedia(PHONE_DRAWER_MEDIA_QUERY)
    const update = () => {
      const nowMobile = width.matches
      setIsMobile(nowMobile)
      // Pointer/desktop-site changes can occur without a resize event. Never
      // retain an open modal drawer when returning to the desktop sidebar.
      if (!nowMobile) setIsOpen(false)
    }
    update()
    width.addEventListener('change', update)
    return () => width.removeEventListener('change', update)
  }, [])

  useEffect(() => {
    if (!isOpen) return

    const panel = panelRef.current
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
      const focusOutsidePanel = !panel.contains(activeElement)

      if (event.shiftKey && (activeElement === firstElement || activeElement === panel || focusOutsidePanel)) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && (activeElement === lastElement || focusOutsidePanel)) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    const handleResize = () => {
      if (!window.matchMedia(PHONE_DRAWER_MEDIA_QUERY).matches) close()
    }

    document.addEventListener('keydown', handleKeyDown)
    window.addEventListener('resize', handleResize)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('resize', handleResize)
      document.body.style.overflow = previousBodyOverflow

      // After a resize, restore focus to whichever trigger remains visible.
      const candidates = [requestedTriggerRef.current, triggerRef.current]
      const restoreTarget = candidates.find((element) => {
        if (!element?.isConnected || element.getClientRects().length === 0) return false
        const style = window.getComputedStyle(element)
        return style.display !== 'none' && style.visibility !== 'hidden'
      })
      restoreTarget?.focus()
      requestedTriggerRef.current = null
    }
  }, [close, isOpen])

  return { isOpen, isMobile, open, close, triggerRef, panelRef }
}
