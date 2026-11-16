'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type UnifiedNavigationItem = {
  id: string
  label: string
  /** Penjelasan singkat (tooltip). */
  hint?: string
}

type UnifiedModuleNavigationProps = {
  ariaLabel: string
  title: string
  items: UnifiedNavigationItem[]
  activeId: string
  onSelect: (id: string) => void
  /** Anak dari grup aktif (mis. Budaya → Form Survei, Register Survei), tampil di baris kedua. */
  subTitle?: string
  subItems?: UnifiedNavigationItem[]
  /** Satu kalimat bahasa awam tentang halaman aktif; tampil di bawah navigasi. */
  pageHint?: string
}

/**
 * Shared, one-line module navigation.
 * The selected item is always retained in the visible group; remaining items
 * are moved to the native, keyboard-accessible "Lainnya" disclosure as space
 * becomes constrained. The source order is never changed.
 */
export default function UnifiedModuleNavigation({
  ariaLabel,
  title,
  items,
  activeId,
  onSelect,
  subTitle,
  subItems = [],
  pageHint,
}: UnifiedModuleNavigationProps) {
  const [hintsHidden, setHintsHidden] = useState(false)
  useEffect(() => { try { setHintsHidden(localStorage.getItem('aureka-hide-hints') === '1') } catch { /* abaikan */ } }, [])
  const toggleHints = (hide: boolean) => { setHintsHidden(hide); try { if (hide) localStorage.setItem('aureka-hide-hints', '1'); else localStorage.removeItem('aureka-hide-hints') } catch { /* abaikan */ } }
  const railRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLSpanElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const overflowRef = useRef<HTMLDetailsElement>(null)
  const itemsRef = useRef<HTMLDivElement>(null)
  // Simpan yang DISEMBUNYIKAN, bukan yang tampil: id baru (mis. grup yang berganti anak aktif) otomatis tampil.
  const [hiddenIds, setHiddenIds] = useState<string[]>([])

  const itemsSignature = items.map((item) => item.id + ':' + item.label).join('|')

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return

    const calculate = () => {
      // Rail selebar isinya; ukur dari lebar induk supaya tidak terkunci di mode "Lainnya" setelah menyusut.
      const parent = rail.parentElement
      const style = getComputedStyle(rail)
      const margins = (parseFloat(style.marginLeft) || 0) + (parseFloat(style.marginRight) || 0)
      const availableWidth = parent ? Math.max(rail.clientWidth, parent.clientWidth - margins) : rail.clientWidth
      const titleWidth = titleRef.current?.getBoundingClientRect().width ?? 0
      const dividerWidth = items.length ? 18 : 0
      const measured = new Map<string, number>()
      measureRef.current?.querySelectorAll<HTMLElement>('[data-nav-measure]').forEach((node) => {
        const id = node.dataset.navMeasure
        if (id) measured.set(id, node.getBoundingClientRect().width)
      })

      const gapBudget = items.length ? 24 : 0
      const allItemsWidth = items.reduce((sum, item) => sum + (measured.get(item.id) ?? 92), 0)
      const allGaps = Math.max(0, items.length - 1) * 5
      const fullBudget = availableWidth - titleWidth - dividerWidth - gapBudget

      if (allItemsWidth + allGaps <= fullBudget) {
        setHiddenIds((previous) => previous.length === 0 ? previous : [])
        return
      }

      const overflowWidth = 82
      const itemBudget = Math.max(0, fullBudget - overflowWidth - 6)
      const activeWidth = measured.get(activeId) ?? 92
      const chosen = new Set<string>(items.some((item) => item.id === activeId) ? [activeId] : [])
      let used = chosen.size ? activeWidth : 0

      for (const item of items) {
        if (chosen.has(item.id)) continue
        const width = measured.get(item.id) ?? 92
        const next = used + (chosen.size ? 5 : 0) + width
        if (next <= itemBudget) {
          chosen.add(item.id)
          used = next
        }
      }

      const next = items.filter((item) => !chosen.has(item.id)).map((item) => item.id)
      setHiddenIds((previous) => previous.length === next.length && previous.every((id, index) => id === next[index]) ? previous : next)
    }

    calculate()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calculate) : null
    observer?.observe(rail)
    window.addEventListener('resize', calculate)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', calculate)
    }
  }, [activeId, itemsSignature, title])

  // Pil aktif yang meluncur: ukur tombol aktif lalu geser satu latar bersama (CSS variables).
  useLayoutEffect(() => {
    const box = itemsRef.current
    if (!box) return
    const place = () => {
      const active = box.querySelector<HTMLElement>('.workspaceNavigationRailItem.active')
      if (!active) { box.classList.remove('hasPill'); return }
      box.style.setProperty('--pill-x', active.offsetLeft + 'px')
      box.style.setProperty('--pill-y', active.offsetTop + 'px')
      box.style.setProperty('--pill-w', active.offsetWidth + 'px')
      box.style.setProperty('--pill-h', active.offsetHeight + 'px')
      if (!box.classList.contains('hasPill')) {
        box.classList.add('hasPill')
        requestAnimationFrame(() => box.classList.add('pillReady'))
      }
    }
    place()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null
    observer?.observe(box)
    return () => observer?.disconnect()
  }, [activeId, hiddenIds, itemsSignature])

  const visibleItems = items.filter((item) => item.id === activeId || !hiddenIds.includes(item.id))
  const overflowItems = items.filter((item) => item.id !== activeId && hiddenIds.includes(item.id))

  const select = (id: string) => {
    onSelect(id)
    if (overflowRef.current) overflowRef.current.open = false
  }

  return (
    <>
    <nav ref={railRef} className="workspaceNavigationRail" aria-label={ariaLabel}>
      <span ref={titleRef} className="workspaceNavigationRailTitle">{title}</span>
      {items.length > 0 && <span className="workspaceNavigationRailDivider" aria-hidden="true" />}
      <div ref={itemsRef} className="workspaceNavigationRailItems">
        {visibleItems.map((item) => {
          const selected = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              className={'workspaceNavigationRailItem' + (selected ? ' active' : '')}
              title={item.hint}
              aria-current={selected ? 'page' : undefined}
              onClick={() => select(item.id)}
            >
              {item.label}
            </button>
          )
        })}
      </div>
      {overflowItems.length > 0 && (
        <details ref={overflowRef} className="workspaceNavigationOverflow">
          <summary aria-label={'Navigasi lainnya untuk ' + title}>Lainnya</summary>
          <div className="workspaceNavigationOverflowMenu" role="group" aria-label="Tab lainnya">
            {overflowItems.map((item) => {
              const selected = item.id === activeId
              return (
                <button
                  key={item.id}
                  type="button"
                  className={'workspaceNavigationOverflowItem' + (selected ? ' active' : '')}
                  title={item.hint}
                  aria-current={selected ? 'page' : undefined}
                  onClick={() => select(item.id)}
                >
                  {item.label}
                </button>
              )
            })}
          </div>
        </details>
      )}
      <div ref={measureRef} className="workspaceNavigationMeasure" aria-hidden="true">
        {items.map((item) => <span key={item.id} data-nav-measure={item.id}>{item.label}</span>)}
      </div>
    </nav>
    {subItems.length > 0 && (
      <div className="workspaceNavigationSubRail" role="group" aria-label={'Submenu ' + (subTitle || title)}>
        {subItems.map((item) => {
          const selected = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              className={'workspaceNavigationSubItem' + (selected ? ' active' : '')}
              title={item.hint}
              aria-current={selected ? 'page' : undefined}
              onClick={() => onSelect(item.id)}
            >
              {item.label}
            </button>
          )
        })}
      </div>
    )}
    {pageHint && (hintsHidden
      ? <button type="button" className="workspacePageHintShow" onClick={() => toggleHints(false)} aria-label="Tampilkan penjelasan halaman">ⓘ</button>
      : <p className="workspacePageHint" role="note">
          <svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><path d="M10 9v5M10 6.2v.3" /></svg>
          <span>{pageHint}</span>
          <button type="button" onClick={() => toggleHints(true)} aria-label="Sembunyikan penjelasan halaman" title="Sembunyikan penjelasan">×</button>
        </p>)}
    </>
  )
}
