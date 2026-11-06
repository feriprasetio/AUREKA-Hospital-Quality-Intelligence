'use client'

import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react'

type WorkspaceTableViewportProps = {
  children: ReactNode
  className?: string
  label: string
  style?: CSSProperties
}

/** A keyboard-scrollable data region; controls appear only when columns overflow. */
export default function WorkspaceTableViewport({
  children,
  className = '',
  label,
  style,
}: WorkspaceTableViewportProps) {
  const viewportRef = useRef<HTMLDivElement>(null)
  const hintId = useId()
  const [edges, setEdges] = useState({ left: false, right: false })

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const measure = () => setEdges({
      left: viewport.scrollLeft > 1,
      right: viewport.scrollLeft + viewport.clientWidth < viewport.scrollWidth - 1,
    })
    const observer = new ResizeObserver(measure)
    observer.observe(viewport)
    if (viewport.firstElementChild) observer.observe(viewport.firstElementChild)
    viewport.addEventListener('scroll', measure, { passive: true })
    measure()
    return () => {
      observer.disconnect()
      viewport.removeEventListener('scroll', measure)
    }
  }, [children])

  const scrollColumns = (direction: number) => {
    const viewport = viewportRef.current
    if (!viewport) return
    viewport.scrollBy({
      left: direction * Math.max(180, viewport.clientWidth * .65),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    })
  }

  const overflows = edges.left || edges.right
  return (
    <div className="workspaceTableFrame">
      {overflows && (
        <div className="workspaceTableHint" id={hintId}>
          <span>Kolom lainnya tersedia di samping</span>
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
        aria-describedby={overflows ? hintId : undefined}
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  )
}
