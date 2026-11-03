'use client'

import { useEffect, useRef } from 'react'

const DIALOG_FOCUSABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',')

type AccessibleDialogOptions = {
  open: boolean
  onClose?: () => void
  closeOnEscape?: boolean
}

/**
 * Adds keyboard focus management to an existing dialog without changing
 * its data flow, visual structure, or business logic.
 *
 * The caller remains responsible for rendering role="dialog",
 * aria-modal, and an accessible name.
 */
export function useAccessibleDialog<T extends HTMLElement = HTMLElement>({
  open,
  onClose,
  closeOnEscape = true,
}: AccessibleDialogOptions) {
  const dialogRef = useRef<T | null>(null)
  const onCloseRef = useRef(onClose)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!open || typeof document === 'undefined') return

    const dialog = dialogRef.current
    if (!dialog) return

    const previousFocus = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null

    const getFocusableElements = (): HTMLElement[] =>
      Array.from(dialog.querySelectorAll<HTMLElement>(DIALOG_FOCUSABLE_SELECTOR)).filter(
        (element) =>
          !element.hasAttribute('hidden') &&
          element.getAttribute('aria-hidden') !== 'true' &&
          element.getAttribute('disabled') === null &&
          element.getClientRects().length > 0,
      )

    const initialFocus =
      dialog.querySelector<HTMLElement>('[data-dialog-autofocus]') ??
      getFocusableElements()[0] ??
      dialog

    initialFocus.focus()

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && closeOnEscape && onCloseRef.current) {
        event.preventDefault()
        event.stopPropagation()
        onCloseRef.current()
        return
      }

      if (event.key !== 'Tab') return

      const focusableElements = getFocusableElements()
      if (focusableElements.length === 0) {
        event.preventDefault()
        dialog.focus()
        return
      }

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]
      const activeElement = document.activeElement

      if (event.shiftKey && (activeElement === firstElement || activeElement === dialog)) {
        event.preventDefault()
        lastElement.focus()
      } else if (!event.shiftKey && activeElement === lastElement) {
        event.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      if (previousFocus?.isConnected) previousFocus.focus()
    }
  }, [closeOnEscape, open])

  return dialogRef
}
