'use client'

import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useAccessibleDialog } from '@/components/layout/useAccessibleDialog'

export type CommandPaletteItem = {
  id: string
  label: string
  description: string
  group: string
  keywords?: readonly string[]
  onSelect: () => void
}

type CommandPaletteProps = {
  items: readonly CommandPaletteItem[]
  searchResults?: readonly CommandPaletteItem[]
  contextLabel: string
  onSearchChange: (query: string) => void
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

export default function CommandPalette({
  items,
  searchResults = [],
  contextLabel,
  onSearchChange,
}: CommandPaletteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listId = useId()
  const dialogRef = useAccessibleDialog<HTMLDivElement>({
    open,
    onClose: () => setOpen(false),
  })

  const openPalette = () => {
    setQuery('')
    setActiveIndex(0)
    onSearchChange('')
    setOpen(true)
  }

  const closePalette = () => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
    onSearchChange('')
  }

  useEffect(() => {
    const handleShortcut = (event: globalThis.KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (open) {
          closePalette()
        } else {
          openPalette()
        }
      }
    }

    window.addEventListener('keydown', handleShortcut)
    return () => window.removeEventListener('keydown', handleShortcut)
  }, [open, onSearchChange])

  const filteredItems = useMemo(() => {
    const term = normalize(query)
    const source = term.length >= 2 ? [...items, ...searchResults] : [...items]
    if (!term) return source

    return source.filter((item) => {
      const searchable = normalize([
        item.label,
        item.description,
        item.group,
        ...(item.keywords ?? []),
      ].join(' '))
      return searchable.includes(term)
    })
  }, [items, searchResults, query])

  const groupedItems = useMemo(() => {
    const groups = new Map<string, { item: CommandPaletteItem; index: number }[]>()
    filteredItems.forEach((item, index) => {
      const current = groups.get(item.group) ?? []
      current.push({ item, index })
      groups.set(item.group, current)
    })
    return Array.from(groups.entries())
  }, [filteredItems])

  useEffect(() => {
    if (activeIndex >= filteredItems.length) setActiveIndex(0)
  }, [activeIndex, filteredItems.length])

  const selectItem = (item: CommandPaletteItem) => {
    item.onSelect()
    closePalette()
  }

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' && filteredItems.length) {
      event.preventDefault()
      setActiveIndex((index) => (index + 1) % filteredItems.length)
    } else if (event.key === 'ArrowUp' && filteredItems.length) {
      event.preventDefault()
      setActiveIndex((index) => (index - 1 + filteredItems.length) % filteredItems.length)
    } else if (event.key === 'Enter' && filteredItems[activeIndex]) {
      event.preventDefault()
      selectItem(filteredItems[activeIndex])
    }
  }

  return (
    <>
      <button
        type="button"
        className="commandPaletteTrigger"
        aria-haspopup="dialog"
        aria-label="Buka Command Palette"
        aria-keyshortcuts="Control+K Meta+K"
        onClick={openPalette}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M9 6 5 12l4 6M15 6l4 6-4 6M13.5 4 10.5 20" />
        </svg>
        <span>Perintah &amp; navigasi</span>
        <kbd>Ctrl K</kbd>
      </button>

      {open ? (
        <div className="commandPaletteBackdrop" onClick={closePalette}>
          <div
            ref={dialogRef}
            className="commandPaletteDialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="aureka-command-title"
            aria-describedby="aureka-command-description"
            tabIndex={-1}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="commandPaletteSearch">
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <circle cx="10.8" cy="10.8" r="6.2" />
                <path d="m15.4 15.4 4.2 4.2" />
              </svg>
              <input
                ref={inputRef}
                data-dialog-autofocus
                type="search"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value)
                  setActiveIndex(0)
                  onSearchChange(event.target.value)
                }}
                onKeyDown={handleInputKeyDown}
                placeholder="Cari modul, tindakan, pasien, dokter, indikator…"
                aria-label="Cari perintah atau data pada modul aktif"
                aria-controls={listId}
                aria-activedescendant={filteredItems.length ? `${listId}-option-${activeIndex}` : undefined}
                autoComplete="off"
                spellCheck={false}
              />
              <kbd>ESC</kbd>
              <button type="button" className="commandPaletteClose" onClick={closePalette} aria-label="Tutup Command Palette">×</button>
            </div>

            <div className="commandPaletteContext" id="aureka-command-description">
              Cari navigasi dan tindakan yang tersedia. Pencarian data dibatasi pada catatan yang sedang dimuat dan dapat Anda akses di <strong>{contextLabel}</strong>.
            </div>

            <div className="commandPaletteResults" id={listId} role="listbox" aria-label="Perintah dan hasil pencarian">
              {groupedItems.length ? groupedItems.map(([group, entries]) => (
                <section className="commandPaletteGroup" key={group} aria-label={group}>
                  <h3>{group}</h3>
                  {entries.map(({ item, index }) => (
                    <button
                      type="button"
                      role="option"
                      id={`${listId}-option-${index}`}
                      aria-selected={activeIndex === index}
                      className={activeIndex === index ? 'commandPaletteOption active' : 'commandPaletteOption'}
                      key={item.id}
                      onMouseEnter={() => setActiveIndex(index)}
                      onClick={() => selectItem(item)}
                    >
                      <span className="commandPaletteOptionIcon" aria-hidden="true">
                        {item.group === 'Data di Modul Aktif' ? '⌕' : item.group === 'Aksi Cepat' ? '↗' : '›'}
                      </span>
                      <span className="commandPaletteOptionCopy">
                        <strong>{item.label}</strong>
                        <small>{item.description}</small>
                      </span>
                      <span className="commandPaletteOptionEnter" aria-hidden="true">↵</span>
                    </button>
                  ))}
                </section>
              )) : (
                <div className="commandPaletteEmpty" role="status" aria-live="polite">
                  <span aria-hidden="true">⌕</span>
                  <strong>Tidak ada hasil yang cocok</strong>
                  <small>Coba kata kunci lain atau pilih modul yang tersedia.</small>
                </div>
              )}
            </div>

            <footer className="commandPaletteFooter">
              <span><kbd>↑</kbd><kbd>↓</kbd> Pilih</span>
              <span><kbd>ENTER</kbd> Jalankan</span>
              <span><kbd>ESC</kbd> Tutup</span>
            </footer>
          </div>
        </div>
      ) : null}

      <style jsx>{`
        .commandPaletteTrigger {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          flex: 0 0 auto;
          min-width: 0;
          min-height: 42px;
          padding: 0 12px;
          border: 1px solid var(--aureka-color-border, #e5e7eb);
          border-radius: 12px;
          background: var(--aureka-color-surface, #fff);
          color: var(--aureka-color-foreground-secondary, #475569);
          font: inherit;
          font-size: 11px;
          font-weight: 750;
          cursor: pointer;
          transition: border-color 140ms ease, background 140ms ease;
        }
        .commandPaletteTrigger:hover {
          border-color: var(--aureka-color-primary, #0f7656);
          background: var(--aureka-color-primary-soft, #ecf7f1);
          color: var(--aureka-color-primary-active, #084f3a);
        }
        .commandPaletteTrigger:focus-visible,
        .commandPaletteClose:focus-visible,
        .commandPaletteOption:focus-visible {
          outline: 3px solid var(--aureka-color-ring, rgba(15,118,86,.32));
          outline-offset: 2px;
        }
        .commandPaletteTrigger svg,
        .commandPaletteSearch svg {
          width: 17px;
          height: 17px;
          flex: 0 0 auto;
          fill: none;
          stroke: currentColor;
          stroke-width: 1.8;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        kbd {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 22px;
          padding: 2px 6px;
          border: 1px solid var(--aureka-color-border, #e5e7eb);
          border-radius: 6px;
          background: var(--aureka-color-surface-muted, #f8faf9);
          color: var(--aureka-color-muted, #64748b);
          font: 650 9px/1.2 inherit;
          white-space: nowrap;
        }
        .commandPaletteBackdrop {
          position: fixed;
          inset: 0;
          z-index: 1600;
          display: flex;
          align-items: flex-start;
          justify-content: center;
          overflow: auto;
          padding: clamp(18px, 10vh, 88px) 14px 24px;
          background: rgba(15, 23, 42, .38);
          backdrop-filter: blur(5px);
        }
        .commandPaletteDialog {
          display: flex;
          flex-direction: column;
          width: min(700px, 100%);
          max-height: min(690px, calc(100vh - 42px));
          min-height: 250px;
          overflow: hidden;
          border: 1px solid rgba(255,255,255,.88);
          border-radius: 18px;
          background: var(--aureka-color-surface, #fff);
          box-shadow: 0 24px 80px rgba(15,23,42,.24);
          color: var(--aureka-color-foreground, #1e293b);
        }
        .commandPaletteSearch {
          display: flex;
          align-items: center;
          gap: 12px;
          min-height: 66px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--aureka-color-border, #e5e7eb);
          color: var(--aureka-color-muted, #64748b);
        }
        .commandPaletteSearch input {
          flex: 1 1 auto;
          width: 0;
          min-width: 0;
          border: 0;
          outline: 0;
          background: transparent;
          color: var(--aureka-color-foreground, #1e293b);
          font: inherit;
          font-size: 14px;
        }
        .commandPaletteSearch input::placeholder { color: #94a3b8; }
        .commandPaletteClose {
          display: grid;
          place-items: center;
          flex: 0 0 36px;
          width: 36px;
          height: 36px;
          border: 0;
          border-radius: 9px;
          background: var(--aureka-color-surface-muted, #f8faf9);
          color: var(--aureka-color-foreground-secondary, #475569);
          font-size: 22px;
          cursor: pointer;
        }
        .commandPaletteContext {
          padding: 10px 17px;
          border-bottom: 1px solid var(--aureka-color-border, #e5e7eb);
          color: var(--aureka-color-muted, #64748b);
          font-size: 10px;
          line-height: 1.55;
        }
        .commandPaletteContext strong { color: var(--aureka-color-foreground-secondary, #475569); }
        .commandPaletteResults {
          flex: 1 1 auto;
          min-height: 0;
          overflow: auto;
          overscroll-behavior: contain;
          padding: 9px 10px 13px;
        }
        .commandPaletteGroup + .commandPaletteGroup { margin-top: 10px; }
        .commandPaletteGroup h3 {
          margin: 7px 9px 5px;
          color: var(--aureka-color-muted, #64748b);
          font-size: 9px;
          font-weight: 850;
          letter-spacing: .09em;
          text-transform: uppercase;
        }
        .commandPaletteOption {
          display: flex;
          align-items: center;
          gap: 11px;
          width: 100%;
          min-height: 52px;
          padding: 8px 10px;
          border: 1px solid transparent;
          border-radius: 11px;
          background: transparent;
          color: inherit;
          text-align: left;
          cursor: pointer;
        }
        .commandPaletteOption:hover,
        .commandPaletteOption.active {
          border-color: rgba(15,118,86,.14);
          background: var(--aureka-color-primary-soft, #ecf7f1);
        }
        .commandPaletteOptionIcon {
          display: grid;
          place-items: center;
          flex: 0 0 32px;
          width: 32px;
          height: 32px;
          border: 1px solid var(--aureka-color-border, #e5e7eb);
          border-radius: 9px;
          background: var(--aureka-color-surface, #fff);
          color: var(--aureka-color-primary, #0f7656);
          font-size: 17px;
          font-weight: 800;
        }
        .commandPaletteOptionCopy {
          display: grid;
          flex: 1 1 auto;
          min-width: 0;
          gap: 3px;
        }
        .commandPaletteOptionCopy strong {
          overflow: hidden;
          color: var(--aureka-color-foreground, #1e293b);
          font-size: 11px;
          font-weight: 800;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .commandPaletteOptionCopy small {
          overflow: hidden;
          color: var(--aureka-color-muted, #64748b);
          font-size: 10px;
          line-height: 1.4;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .commandPaletteOptionEnter { color: var(--aureka-color-muted, #64748b); font-size: 13px; }
        .commandPaletteEmpty {
          display: grid;
          justify-items: center;
          gap: 7px;
          padding: 42px 16px;
          color: var(--aureka-color-muted, #64748b);
          text-align: center;
        }
        .commandPaletteEmpty > span { font-size: 26px; }
        .commandPaletteEmpty strong { color: var(--aureka-color-foreground-secondary, #475569); font-size: 12px; }
        .commandPaletteEmpty small { font-size: 10px; line-height: 1.5; }
        .commandPaletteFooter {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 16px;
          min-height: 43px;
          padding: 7px 15px;
          border-top: 1px solid var(--aureka-color-border, #e5e7eb);
          color: var(--aureka-color-muted, #64748b);
          font-size: 9px;
        }
        .commandPaletteFooter span { display: inline-flex; align-items: center; gap: 5px; }
        @media (max-width: 640px) {
          .commandPaletteTrigger { width: 42px; min-width: 42px; padding: 0; }
          .commandPaletteTrigger > span,
          .commandPaletteTrigger > kbd { display: none; }
          .commandPaletteBackdrop { align-items: flex-start; padding: 12px 8px; }
          .commandPaletteDialog { max-height: calc(100dvh - 24px); border-radius: 15px; }
          .commandPaletteSearch { gap: 8px; min-height: 58px; padding: 9px 10px; }
          .commandPaletteSearch input { font-size: 12px; }
          .commandPaletteContext { padding: 9px 12px; }
          .commandPaletteFooter { gap: 8px 12px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .commandPaletteTrigger { transition: none; }
        }
      `}</style>
    </>
  )
}
