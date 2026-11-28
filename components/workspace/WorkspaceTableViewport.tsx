'use client'

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'

type WorkspaceTableViewportProps = {
  children: ReactNode
  className?: string
  label: string
  style?: CSSProperties
  dataFirst?: boolean
}

/** A keyboard-scrollable data region; controls appear only when columns overflow. */
export default function WorkspaceTableViewport({
  children,
  className = '',
  label,
  style,
  dataFirst = false,
}: WorkspaceTableViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const [edges, setEdges] = useState({ left: false, right: false })

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const measure = () => {
      const left = viewport.scrollLeft > 1
      const right = viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1
      setEdges(previous => previous.left === left && previous.right === right ? previous : { left, right })
    }
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
    observer?.observe(viewport)
    if (viewport.firstElementChild) observer?.observe(viewport.firstElementChild)
    if (!observer) window.addEventListener('resize', measure)
    viewport.addEventListener('scroll', measure, { passive: true })
    measure()
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', measure)
      viewport.removeEventListener('scroll', measure)
    }
  }, [children])

  // Di ponsel, tabel data dibaca sebagai kartu: tiap sel diberi label kolomnya (data-label).
  // Tabel isian (select/teks/centang di tengah) atau yang ditandai data-ak-cards="off" tetap berupa tabel.
  useEffect(() => {
    const viewport = viewportRef.current
    const table = viewport?.querySelector('table')
    if (!viewport || !table || table.getAttribute('data-ak-cards') === 'off') return
    const label = () => {
      const headerRows = table.tHead?.rows
      const headers = headerRows?.length === 1 ? Array.from(headerRows[0].cells) : []
      const heads = headers.every(cell => cell.colSpan === 1 && cell.rowSpan === 1)
        ? headers.map(cell => (cell.textContent || '').replace(/[↕▲▼]/g, '').trim())
        : []
      const rows = Array.from(table.querySelectorAll('tbody > tr'))
      const editable = rows.some((tr) => tr.querySelector('select, textarea, input:not([type="checkbox"])') || Array.from(tr.children).some((td, i) => i > 0 && td.querySelector('input[type="checkbox"]')))
      if (heads.length < 2 || heads.length > 9 || editable) { if (table.getAttribute('data-ak-cards') === 'on') table.removeAttribute('data-ak-cards'); return }
      if (table.getAttribute('data-ak-cards') !== 'on') table.setAttribute('data-ak-cards', 'on')
      const primary = heads.findIndex((h, i) => h && !table.querySelector(`tbody > tr > td:nth-child(${i + 1}) input`))
      rows.forEach((tr) => Array.from(tr.children).forEach((td, i) => {
        if ((td as HTMLTableCellElement).colSpan > 1) return
        const want = heads[i] || ''
        if (td.getAttribute('data-label') !== want) td.setAttribute('data-label', want)
        if (i === primary) { if (!td.hasAttribute('data-ak-primary')) td.setAttribute('data-ak-primary', '') } else if (td.hasAttribute('data-ak-primary')) td.removeAttribute('data-ak-primary')
      }))
    }
    label()
    const mo = new MutationObserver(() => label())
    mo.observe(table, { childList: true, subtree: true })
    return () => mo.disconnect()
  }, [children])

  const scrollColumns = (direction: number) => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollBy({
      left: direction * Math.max(180, viewport.clientWidth * .65),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.dataset.aurekaMotion==='off' ? 'instant' : 'smooth',
    })
  }

  const overflows = edges.left || edges.right
  return (
    <div className="workspaceTableFrame" data-continuum-table-frame={dataFirst||undefined}>
      {overflows && (
        <div className="workspaceTableHint" role="group" aria-label="Geser kolom">
          <div>
            <button type="button" aria-label={`Geser ${label} ke kiri`} disabled={!edges.left} onClick={() => scrollColumns(-1)}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m11 5-5 5 5 5M6 10h9" /></svg>
            </button>
            <button type="button" aria-label={`Geser ${label} ke kanan`} disabled={!edges.right} onClick={() => scrollColumns(1)}>
              <svg viewBox="0 0 20 20" aria-hidden="true"><path d="m9 5 5 5-5 5M5 10h9" /></svg>
            </button>
          </div>
        </div>
      )}
      <div
        ref={viewportRef}
        className={`${className} workspaceTableViewport`}
        style={style}
        role="region"
        aria-label={label}
        tabIndex={0}
        data-continuum-table={dataFirst||undefined}
        onKeyDown={event=>{if(!dataFirst||event.target!==event.currentTarget||event.altKey||event.ctrlKey||event.metaKey||event.shiftKey)return;if(event.key==='ArrowLeft'&&edges.left){event.preventDefault();scrollColumns(-1)}else if(event.key==='ArrowRight'&&edges.right){event.preventDefault();scrollColumns(1)}}}
      >
        {children}
      </div>
    </div>
  )
}
