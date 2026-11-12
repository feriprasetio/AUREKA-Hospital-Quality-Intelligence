'use client'

import { useEffect } from 'react'

/**
 * Pengisian "sat-set" untuk SEMUA formulir popup tanpa mengubah tiap modul:
 * - Enter pada kolom isian → pindah ke kolom berikutnya (bukan mengirim formulir).
 * - Ctrl/⌘ + S atau Ctrl/⌘ + Enter → menekan tombol Simpan/Kirim/Ajukan utama di popup.
 * - Saat popup formulir terbuka, kursor langsung berada di kolom pertama yang masih kosong.
 * Hanya bekerja di dalam popup (aria-modal) sehingga pencarian & halaman lain tidak terpengaruh.
 */

const FIELD = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=submit]):not([disabled]):not([readonly]), select:not([disabled]), textarea:not([disabled]):not([readonly])'
const SAVE_TEXT = /^(\+\s*|＋\s*)?(simpan|kirim|ajukan|tambahkan|aktifkan|terbitkan|setujui|perbarui)\b/i
const NAV_TYPES = new Set(['text', 'number', 'date', 'time', 'datetime-local', 'month', 'email', 'tel', 'url', ''])

const visible = (el: Element) => {
  const r = (el as HTMLElement).getBoundingClientRect()
  return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'
}
const dialogOf = (el: Element | null) => el?.closest('[aria-modal="true"]') as HTMLElement | null
const topDialog = () => {
  const all = Array.from(document.querySelectorAll<HTMLElement>('[aria-modal="true"]')).filter(visible)
  return all[all.length - 1] || null
}
const fieldsIn = (root: Element) => Array.from(root.querySelectorAll<HTMLElement>(FIELD)).filter(visible)

function saveButton(root: Element): HTMLButtonElement | null {
  const buttons = Array.from(root.querySelectorAll<HTMLButtonElement>('button:not([disabled])')).filter(visible)
  const matches = buttons.filter((b) => SAVE_TEXT.test((b.textContent || '').trim()))
  if (!matches.length) return null
  // Utamakan tombol bergaya "primary", lalu yang paling bawah (footer).
  return matches.find((b) => /primary/i.test(b.className)) || matches[matches.length - 1]
}

const FOCUSED = new WeakSet<Element>()

export default function FormSpeedEnhancer() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.isComposing || e.defaultPrevented) return
      const target = e.target as HTMLElement | null
      const dialog = dialogOf(target) || ((e.ctrlKey || e.metaKey) ? topDialog() : null)
      if (!dialog) return

      if ((e.ctrlKey || e.metaKey) && !e.altKey && (e.key === 's' || e.key === 'S' || e.key === 'Enter')) {
        const btn = saveButton(dialog)
        if (btn) { e.preventDefault(); btn.click() }
        return
      }

      if (e.key !== 'Enter' || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || !target) return
      const isInput = target.tagName === 'INPUT' && NAV_TYPES.has(((target as HTMLInputElement).getAttribute('type') || '').toLowerCase())
      const isSelect = target.tagName === 'SELECT'
      if (!isInput && !isSelect) return
      if (target.getAttribute('role') === 'combobox' || target.hasAttribute('list') || target.dataset.enterSubmit !== undefined) return
      const list = fieldsIn(dialog)
      const i = list.indexOf(target)
      if (i < 0) return
      e.preventDefault()
      const next = list[i + 1]
      if (next) { next.focus(); if (next instanceof HTMLInputElement && /text|number|email|tel|url/.test(next.type)) next.select() }
      else saveButton(dialog)?.focus()
    }

    // Saat popup baru terbuka, pindahkan fokus dari tombol "Tutup" ke kolom pertama yang kosong.
    const onFocusIn = (e: FocusEvent) => {
      const el = e.target as HTMLElement | null
      const dialog = dialogOf(el)
      if (!dialog || FOCUSED.has(dialog)) return
      // Di HP/tablet tidak memindah fokus otomatis agar keyboard layar tidak tiba-tiba muncul.
      if (window.matchMedia?.('(pointer: coarse)').matches) { FOCUSED.add(dialog); return }
      FOCUSED.add(dialog)
      if (dialog.getAttribute('role') === 'alertdialog') return
      if (el && el.matches(FIELD)) return
      window.setTimeout(() => {
        if (!dialog.isConnected) return
        const list = fieldsIn(dialog)
        if (list.length < 2) return
        const firstEmpty = list.find((f) => !(f as HTMLInputElement).value) || list[0]
        const active = document.activeElement as HTMLElement | null
        if (active && dialog.contains(active) && active.matches(FIELD)) return
        firstEmpty.focus({ preventScroll: false })
      }, 60)
    }

    document.addEventListener('keydown', onKey, true)
    document.addEventListener('focusin', onFocusIn, true)
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('focusin', onFocusIn, true)
    }
  }, [])
  return null
}
