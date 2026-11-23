'use client'

import { useEffect, useRef } from 'react'

const FOCUSABLE = [
  'a[href]',
  'area[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'summary',
  '[tabindex]',
  '[contenteditable]:not([contenteditable="false"])',
].join(',')

const dialogStack: HTMLElement[] = []
let scrollLocks = 0
let bodyOverflow = ''

export function lockDocumentScroll() {
  if (scrollLocks === 0) bodyOverflow = document.body.style.overflow
  scrollLocks += 1
  document.body.style.overflow = 'hidden'
  return () => {
    scrollLocks -= 1
    if (scrollLocks === 0) document.body.style.overflow = bodyOverflow
  }
}

export function hasActiveDialog() {
  return dialogStack.length > 0
}

type AccessibleDialogOptions = {
  open: boolean
  onClose?: () => void
  closeOnEscape?: boolean
  lockScroll?: boolean
}

function getFocusableElements(dialog: HTMLElement) {
  return Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((element) =>
    element.tabIndex >= 0 &&
    !element.matches(':disabled') &&
    !element.closest('[inert], [aria-hidden="true"]') &&
    element.getClientRects().length > 0 &&
    getComputedStyle(element).visibility === 'visible',
  )
}

export function useAccessibleDialog<T extends HTMLElement = HTMLElement>({
  open,
  onClose,
  closeOnEscape = true,
  lockScroll = true,
}: AccessibleDialogOptions) {
  const dialogRef = useRef<T | null>(null)
  const closeOptions = useRef({ onClose, closeOnEscape })
  useEffect(() => { closeOptions.current = { onClose, closeOnEscape } }, [onClose, closeOnEscape])

  useEffect(() => {
    if (!open) return
    const dialog = dialogRef.current
    if (!dialog) return

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialogStack.push(dialog)
    const unlockScroll = lockScroll ? lockDocumentScroll() : undefined

    const focusable = getFocusableElements(dialog)
    const initialFocus = focusable.find(element => element.hasAttribute('data-dialog-autofocus')) ?? focusable[0] ?? dialog
    initialFocus.focus({ preventScroll: true })

    let lastFocus = initialFocus
    const handleFocusIn = (event: FocusEvent) => {
      if (dialogStack.at(-1) !== dialog || !dialog.isConnected) return
      if (event.target instanceof HTMLElement && dialog.contains(event.target)) {
        lastFocus = event.target
      } else {
        const candidates = getFocusableElements(dialog)
        const target = candidates.includes(lastFocus) ? lastFocus : candidates[0] ?? dialog
        target.focus({ preventScroll: true })
      }
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (dialogStack.at(-1) !== dialog || event.defaultPrevented) return
      if (event.key === 'Escape') {
        if (event.isComposing) return
        event.preventDefault()
        event.stopPropagation()
        if (closeOptions.current.closeOnEscape) closeOptions.current.onClose?.()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusableElements(dialog)
      const first = focusable[0]
      const last = focusable.at(-1)
      const active = document.activeElement
      if (!first || !last) {
        event.preventDefault()
        dialog.focus()
      } else if (!focusable.includes(active as HTMLElement) || (event.shiftKey ? active === first : active === last)) {
        event.preventDefault()
        const target = event.shiftKey ? last : first
        target.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('focusin', handleFocusIn)
    return () => {
      const index = dialogStack.lastIndexOf(dialog)
      const wasTop = index === dialogStack.length - 1
      if (index >= 0) dialogStack.splice(index, 1)
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('focusin', handleFocusIn)
      unlockScroll?.()
      if (!wasTop) return
      const remaining = dialogStack.at(-1)
      if (previousFocus?.isConnected && (!remaining || remaining.contains(previousFocus))) {
        previousFocus.focus({ preventScroll: true })
      } else if (remaining) {
        const target = getFocusableElements(remaining)[0] ?? remaining
        target.focus({ preventScroll: true })
      }
    }
  }, [lockScroll, open])

  return dialogRef
}
