'use client'

import { useEffect } from 'react'

const safeActions = new Set(['saveDraft', 'save'])

export default function FormSpeedEnhancer() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229 ||
          event.repeat || event.altKey || event.shiftKey || !(event.ctrlKey || event.metaKey)) return
      if (event.key.toLowerCase() !== 's' && event.key !== 'Enter') return
      if (!(event.target instanceof HTMLElement)) return

      const dialog = event.target.closest('[aria-modal="true"]')
      if (!dialog || dialog.getAttribute('role') === 'alertdialog') return
      const form = event.target.closest('form')
      if (!form || !dialog.contains(form)) return
      const candidates = Array.from(dialog.querySelectorAll<HTMLButtonElement>('button[data-form-action]'))
        .filter(button => button.form === form && safeActions.has(button.dataset.formAction ?? '') &&
          !button.matches(':disabled') && !button.closest('[inert], [aria-hidden="true"]') &&
          button.getClientRects().length > 0 && getComputedStyle(button).visibility === 'visible' &&
          (event.key !== 'Enter' || button.dataset.shortcutEnter === 'true'))
      if (candidates.length !== 1) return
      event.preventDefault()
      candidates[0].click()
    }

    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return null
}
