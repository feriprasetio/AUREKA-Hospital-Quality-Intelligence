'use client'

import { useEffect, useMemo, useRef, useState } from 'react'

export type UnifiedNavigationItem = {
  id: string
  label: string
}

type UnifiedModuleNavigationProps = {
  ariaLabel: string
  title: string
  items: UnifiedNavigationItem[]
  activeId: string
  onSelect: (id: string) => void
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
}: UnifiedModuleNavigationProps) {
  const railRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLSpanElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const overflowRef = useRef<HTMLDetailsElement>(null)
  const [visibleIds, setVisibleIds] = useState<string[]>(() => items.map((item) => item.id))

  const itemWidths = useMemo(() => items.map((item) => item.id), [items])

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return

    const calculate = () => {
      const availableWidth = rail.clientWidth
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
        setVisibleIds(items.map((item) => item.id))
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

      setVisibleIds(items.filter((item) => chosen.has(item.id)).map((item) => item.id))
    }

    calculate()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calculate) : null
    observer?.observe(rail)
    window.addEventListener('resize', calculate)
    return () => {
      observer?.disconnect()
      window.removeEventListener('resize', calculate)
    }
  }, [activeId, itemWidths, items, title])

  const visibleItems = items.filter((item) => visibleIds.includes(item.id))
  const overflowItems = items.filter((item) => !visibleIds.includes(item.id))

  const select = (id: string) => {
    onSelect(id)
    if (overflowRef.current) overflowRef.current.open = false
  }

  return (
    <nav ref={railRef} className="workspaceNavigationRail" aria-label={ariaLabel}>
      <span ref={titleRef} className="workspaceNavigationRailTitle">{title}</span>
      {items.length > 0 && <span className="workspaceNavigationRailDivider" aria-hidden="true" />}
      <div className="workspaceNavigationRailItems">
        {visibleItems.map((item) => {
          const selected = item.id === activeId
          return (
            <button
              key={item.id}
              type="button"
              className={'workspaceNavigationRailItem' + (selected ? ' active' : '')}
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
  )
}
