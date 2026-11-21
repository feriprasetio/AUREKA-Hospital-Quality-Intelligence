'use client'

import { useEffect, useRef } from 'react'

export type UnifiedNavigationItem = { id: string; label: string; hint?: string; disabled?: boolean }

type UnifiedModuleNavigationProps = {
  ariaLabel: string; title: string; items: UnifiedNavigationItem[]; activeId: string; onSelect: (id: string) => void
  secondaryActiveId?: string; onSubSelect?: (id: string) => void; subTitle?: string; subItems?: UnifiedNavigationItem[]
}

function NavigationStrip({ label, items, activeId, onSelect, secondary = false }: {
  label: string
  items: UnifiedNavigationItem[]
  activeId: string
  onSelect: (id: string) => void
  secondary?: boolean
}) {
  const strip = useRef<HTMLDivElement>(null)
  const selectedId = items.some(item => item.id === activeId) ? activeId : items[0]?.id
  const layoutKey = JSON.stringify(items.map(({ id, label }) => [id, label]))

  useEffect(() => {
    const scroller = strip.current
    const active = scroller?.querySelector<HTMLButtonElement>('[aria-current="page"]')
    if (!scroller || !active) return
    const reveal = () => {
      const viewport = scroller.getBoundingClientRect()
      const button = active.getBoundingClientRect()
      if (button.left < viewport.left + 4) scroller.scrollLeft += button.left - viewport.left - 4
      else if (button.right > viewport.right - 4) scroller.scrollLeft += button.right - viewport.right + 4
    }
    reveal()
    const observer = new ResizeObserver(reveal)
    observer.observe(scroller)
    observer.observe(active)
    return () => observer.disconnect()
  }, [selectedId, layoutKey])

  return (
    <div ref={strip} className="workspacePillStrip" data-secondary={secondary || undefined} role="group" aria-label={label}>
      {items.map(item => (
        <button
          key={item.id} type="button" disabled={item.disabled} title={item.hint}
          aria-current={item.id === selectedId ? 'page' : undefined}
          onClick={() => onSelect(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  )
}

export default function UnifiedModuleNavigation({
  ariaLabel, title, items, activeId, onSelect, secondaryActiveId = '', onSubSelect, subTitle, subItems = [],
}: UnifiedModuleNavigationProps) {
  return (
    <nav className="workspacePillNavigation" aria-label={ariaLabel}>
      {items.length > 0 && <NavigationStrip label={title} items={items} activeId={activeId} onSelect={onSelect} />}
      {subItems.length > 0 && (
        <NavigationStrip
          label={subTitle || 'Bagian ' + title} items={subItems} activeId={secondaryActiveId}
          onSelect={onSubSelect ?? onSelect} secondary
        />
      )}
    </nav>
  )
}
