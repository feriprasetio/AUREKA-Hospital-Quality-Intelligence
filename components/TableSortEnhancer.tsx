'use client'

import { useEffect } from 'react'

/**
 * Sortir untuk SEMUA tabel data di workspace, tanpa mengubah tiap modul.
 * Klik judul kolom: urut naik → urut turun → kembali ke urutan asal.
 * - Hanya baris di halaman yang sedang tampil (tabel berhalaman tetap memakai paginasi masing-masing).
 * - Kolom kosong, centang, "No.", dan "Aksi" tidak bisa disortir.
 * - Tabel yang barisnya berpasangan (baris detail ber-colspan) dilewati agar tidak berantakan.
 * - Bila React menambah/mengganti baris, urutan pilihan diterapkan ulang otomatis.
 */

type SortState = { col: number; dir: 1 | -1 }
const STATE = new WeakMap<HTMLTableElement, SortState>()
const ORIGINAL = new WeakMap<HTMLTableSectionElement, HTMLTableRowElement[]>()
const OBSERVED = new WeakSet<HTMLTableSectionElement>()
const SKIP_HEAD = /^(no\.?|#|aksi|tindakan|pilih|opsi)$/i
const MONTHS: Record<string, number> = { jan: 0, feb: 1, mar: 2, apr: 3, mei: 4, may: 4, jun: 5, jul: 6, agu: 7, agt: 7, aug: 7, sep: 8, okt: 9, oct: 9, nov: 10, des: 11, dec: 11 }

function cellText(row: HTMLTableRowElement, col: number) {
  const cell = row.cells[col]
  if (!cell) return ''
  const control = cell.querySelector<HTMLInputElement | HTMLSelectElement>('input:not([type=checkbox]), select')
  return (control ? control.value : cell.innerText || cell.textContent || '').replace(/\s+/g, ' ').trim()
}

function parseValue(raw: string): { n: number | null; s: string } {
  const s = raw.trim()
  if (!s || s === '-' || s === '-') return { n: null, s: '' }
  // Tanggal: 2026-10-30 / 30/10/2026 / 30 Okt 2026
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) return { n: Date.UTC(+m[1], +m[2] - 1, +m[3]), s }
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/)
  if (m) return { n: Date.UTC(+m[3], +m[2] - 1, +m[1]), s }
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3})[a-z]*\.?\s+(\d{4})/)
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) return { n: Date.UTC(+m[3], MONTHS[m[2].toLowerCase()], +m[1]), s }
  // No. RM 22-36-68 → angka
  if (/^\d{2}-\d{2}-\d{2}$/.test(s)) return { n: Number(s.replace(/-/g, '')), s }
  // Angka gaya Indonesia: 1.234,5 / 85,7% / 24
  m = s.match(/^[-+]?[\d.]+(,\d+)?\s*%?$/)
  if (m) {
    const n = Number(s.replace('%', '').replace(/\./g, '').replace(',', '.'))
    if (Number.isFinite(n)) return { n, s }
  }
  m = s.match(/^[-+]?\d+(\.\d+)?/)
  if (m && /^[-+]?\d+(\.\d+)?(\s|$)/.test(s)) return { n: Number(m[0]), s }
  return { n: null, s: s.toLocaleLowerCase('id-ID') }
}

function compare(a: string, b: string) {
  const x = parseValue(a)
  const y = parseValue(b)
  if (!x.s && !y.s) return 0
  if (!x.s) return 1
  if (!y.s) return -1
  if (x.n !== null && y.n !== null) return x.n - y.n
  return x.s.localeCompare(y.s, 'id-ID', { numeric: true, sensitivity: 'base' })
}

function bodyRows(tbody: HTMLTableSectionElement) {
  return Array.from(tbody.rows)
}

function sortable(table: HTMLTableElement) {
  const tbody = table.tBodies[0]
  if (!tbody) return false
  const rows = bodyRows(tbody)
  if (rows.length < 2) return true
  const colCounts = new Set(rows.map((r) => r.cells.length))
  const hasSpan = rows.some((r) => Array.from(r.cells).some((c) => c.colSpan > 1 || c.rowSpan > 1))
  return colCounts.size === 1 && !hasSpan
}

let applying = false
function apply(table: HTMLTableElement) {
  const tbody = table.tBodies[0]
  if (!tbody || !sortable(table)) return
  const state = STATE.get(table)
  const rows = bodyRows(tbody)
  if (!ORIGINAL.has(tbody) || rows.some((r) => !ORIGINAL.get(tbody)!.includes(r)) || ORIGINAL.get(tbody)!.length !== rows.length) {
    // Baris baru dari React: urutan asal = urutan DOM saat ini bila belum disortir
    if (!state) ORIGINAL.set(tbody, rows)
    else {
      const prev = ORIGINAL.get(tbody) || []
      ORIGINAL.set(tbody, [...prev.filter((r) => rows.includes(r)), ...rows.filter((r) => !prev.includes(r))])
    }
  }
  const target = state
    ? [...rows].sort((a, b) => compare(cellText(a, state.col), cellText(b, state.col)) * state.dir)
    : ORIGINAL.get(tbody)!.filter((r) => rows.includes(r))
  if (target.every((r, i) => r === rows[i])) return
  applying = true
  const frag = document.createDocumentFragment()
  target.forEach((r) => frag.appendChild(r))
  tbody.appendChild(frag)
  window.setTimeout(() => { applying = false }, 0)
}

function decorate(table: HTMLTableElement) {
  if (table.dataset.akSort === 'off' || table.closest('[data-ak-sort="off"]')) return
  const head = table.tHead?.rows[table.tHead.rows.length - 1]
  if (!head || !table.tBodies[0]) return
  if (table.dataset.akSortReady !== '1') {
    table.dataset.akSortReady = '1'
    head.addEventListener('click', (ev) => {
      const th = (ev.target as HTMLElement).closest('th') as HTMLTableCellElement | null
      if (!th || th.dataset.akSortable !== '1') return
      if ((ev.target as HTMLElement).closest('button, a, input, select, label')) return
      const col = th.cellIndex
      const cur = STATE.get(table)
      const next: SortState | undefined = !cur || cur.col !== col ? { col, dir: 1 } : cur.dir === 1 ? { col, dir: -1 } : undefined
      if (next) STATE.set(table, next)
      else STATE.delete(table)
      Array.from(head.cells).forEach((c) => c.setAttribute('aria-sort', next && c.cellIndex === next.col ? (next.dir === 1 ? 'ascending' : 'descending') : 'none'))
      apply(table)
    })
    head.addEventListener('keydown', (ev) => {
      const th = (ev.target as HTMLElement).closest('th') as HTMLTableCellElement | null
      if (th?.dataset.akSortable === '1' && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); th.click() }
    })
  }
  const ok = sortable(table)
  Array.from(head.cells).forEach((th) => {
    const label = (th.innerText || th.textContent || '').trim()
    const can = ok && th.colSpan === 1 && !!label && !SKIP_HEAD.test(label) && !th.querySelector('input[type=checkbox]')
    if (can && th.dataset.akSortable !== '1') {
      th.dataset.akSortable = '1'
      th.tabIndex = 0
      th.title = 'Klik untuk mengurutkan'
      if (!th.hasAttribute('aria-sort')) th.setAttribute('aria-sort', 'none')
    } else if (!can && th.dataset.akSortable === '1') {
      delete th.dataset.akSortable
      th.removeAttribute('aria-sort')
      th.removeAttribute('tabindex')
    }
  })
  const tbody = table.tBodies[0]
  if (!OBSERVED.has(tbody)) {
    OBSERVED.add(tbody)
    new MutationObserver(() => {
      if (applying) return
      window.requestAnimationFrame(() => { if (STATE.get(table)) apply(table) })
    }).observe(tbody, { childList: true })
  }
}

export default function TableSortEnhancer() {
  useEffect(() => {
    let raf = 0
    const scan = () => {
      raf = 0
      document.querySelectorAll<HTMLTableElement>('.workspaceRoot .workspaceContent table').forEach(decorate)
    }
    const schedule = () => { if (!raf) raf = window.requestAnimationFrame(scan) }
    scan()
    const mo = new MutationObserver(() => { if (!applying) schedule() })
    const root = document.querySelector('.workspaceRoot') || document.body
    mo.observe(root, { childList: true, subtree: true })
    return () => { mo.disconnect(); if (raf) window.cancelAnimationFrame(raf) }
  }, [])
  return null
}
