'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'

export type UnifiedNavigationItem = { id: string; label: string; hint?: string }

type UnifiedModuleNavigationProps = {
  ariaLabel: string; title: string; items: UnifiedNavigationItem[]; activeId: string; onSelect: (id: string) => void
  secondaryActiveId?: string; onSubSelect?: (id: string) => void; subTitle?: string; subItems?: UnifiedNavigationItem[]; pageHint?: string
  mobileWorkspaceTabs?: boolean
}

const OVERFLOW_WIDTH = 82
const ITEM_GAP = 5
function naturalWidth(items: UnifiedNavigationItem[], widths: Map<string, number>, prefix: string) {
  return items.reduce((sum, item) => sum + (widths.get(prefix + ':' + item.id) ?? 92), 0) + Math.max(0, items.length - 1) * ITEM_GAP
}
function overflowFor(items: UnifiedNavigationItem[], activeId: string, budget: number, widths: Map<string, number>, prefix: string) {
  if (items.length <= 1 || naturalWidth(items, widths, prefix) <= budget) return []
  const active = items.find(item => item.id === activeId) ?? items[0]
  const itemBudget = Math.max(0, budget - OVERFLOW_WIDTH - ITEM_GAP)
  let used = widths.get(prefix + ':' + active.id) ?? 92
  const visible = new Set<string>([active.id])
  for (const item of items) {
    if (visible.has(item.id)) continue
    const width = widths.get(prefix + ':' + item.id) ?? 92
    if (used + ITEM_GAP + width <= itemBudget) { visible.add(item.id); used += ITEM_GAP + width }
  }
  return items.filter(item => !visible.has(item.id)).map(item => item.id)
}
function sameIds(a: string[], b: string[]) { return a.length === b.length && a.every((id, index) => id === b[index]) }

/** One shared two-group navigation for every authenticated AUREKA workspace. */
export default function UnifiedModuleNavigation({
  ariaLabel, title, items, activeId, onSelect, secondaryActiveId = '', onSubSelect, subTitle, subItems = [], pageHint,
  mobileWorkspaceTabs = true,
}: UnifiedModuleNavigationProps) {
  const [hintsHidden, setHintsHidden] = useState(false)
  const [showTransitionNotice, setShowTransitionNotice] = useState(false)
  const [hiddenIds, setHiddenIds] = useState<string[]>([])
  const [hiddenSubIds, setHiddenSubIds] = useState<string[]>([])
  const railRef = useRef<HTMLElement>(null)
  const titleRef = useRef<HTMLSpanElement>(null)
  const measureRef = useRef<HTMLDivElement>(null)
  const itemsRef = useRef<HTMLDivElement>(null)
  const subItemsRef = useRef<HTMLDivElement>(null)
  const overflowRef = useRef<HTMLDetailsElement>(null)
  const subOverflowRef = useRef<HTMLDetailsElement>(null)
  const mobileGroupRef = useRef<HTMLDetailsElement>(null)
  const itemsSignature = items.map(item => item.id + ':' + item.label).join('|')
  const subItemsSignature = subItems.map(item => item.id + ':' + item.label).join('|')
  const resolvedActiveId = items.some(item => item.id === activeId) ? activeId : (items[0]?.id ?? '')
  const resolvedSecondaryActiveId = subItems.some(item => item.id === secondaryActiveId) ? secondaryActiveId : (subItems[0]?.id ?? '')
  const activePrimaryItem = items.find(item => item.id === resolvedActiveId)
  const mobileTabItems = subItems.length ? subItems : items
  const activeMobileTabId = subItems.length ? resolvedSecondaryActiveId : resolvedActiveId

  useEffect(() => {
    if (!mobileWorkspaceTabs) { setShowTransitionNotice(false); return }
    const startKey = 'aureka-mobile-workspace-tabs-started-at'
    const dismissKey = 'aureka-mobile-workspace-tabs-notice-dismissed'
    try {
      const now = Date.now()
      let startedAt = Number(localStorage.getItem(startKey))
      if (!Number.isFinite(startedAt) || startedAt <= 0) {
        startedAt = now
        localStorage.setItem(startKey, String(startedAt))
      }
      const withinTransition = now >= startedAt && now - startedAt < 14 * 24 * 60 * 60 * 1000
      setShowTransitionNotice(withinTransition && localStorage.getItem(dismissKey) !== '1')
    } catch {
      setShowTransitionNotice(false)
    }
  }, [mobileWorkspaceTabs])

  const dismissTransitionNotice = () => {
    setShowTransitionNotice(false)
    try { localStorage.setItem('aureka-mobile-workspace-tabs-notice-dismissed', '1') } catch { /* ignore */ }
  }

  useEffect(() => {
    const read = () => { try { setHintsHidden(localStorage.getItem('aureka-hide-hints') === '1') } catch { /* ignore */ } }
    read(); window.addEventListener('aureka-hints-change', read)
    return () => window.removeEventListener('aureka-hints-change', read)
  }, [])
  const toggleHints = (hide: boolean) => {
    setHintsHidden(hide)
    try { if (hide) localStorage.setItem('aureka-hide-hints', '1'); else localStorage.removeItem('aureka-hide-hints') } catch { /* ignore */ }
  }

  useEffect(() => {
    const rail = railRef.current
    if (!rail) return
    const calculate = () => {
      if (window.matchMedia('(max-width: 720px)').matches) {
        setHiddenIds(previous => previous.length ? [] : previous)
        setHiddenSubIds(previous => previous.length ? [] : previous)
        return
      }
      const widths = new Map<string, number>()
      measureRef.current?.querySelectorAll<HTMLElement>('[data-nav-measure]').forEach(node => {
        const key = node.dataset.navMeasure
        if (key) widths.set(key, node.getBoundingClientRect().width)
      })
      const titleWidth = titleRef.current?.getBoundingClientRect().width ?? 0
      const separators = 18 + (subItems.length ? 18 : 0)
      const gapsAndOverflow = 34 + (subItems.length ? 10 : 0)
      const available = Math.max(0, rail.clientWidth - titleWidth - separators - gapsAndOverflow)
      const primaryNatural = naturalWidth(items, widths, 'primary')
      const secondaryNatural = naturalWidth(subItems, widths, 'secondary')
      if (primaryNatural + secondaryNatural <= available) {
        setHiddenIds(previous => previous.length ? [] : previous)
        setHiddenSubIds(previous => previous.length ? [] : previous)
        return
      }
      const primaryMin = items.length ? (widths.get('primary:' + resolvedActiveId) ?? 92) + (items.length > 1 ? OVERFLOW_WIDTH + ITEM_GAP : 0) : 0
      const secondaryMin = subItems.length ? (widths.get('secondary:' + resolvedSecondaryActiveId) ?? 92) + (subItems.length > 1 ? OVERFLOW_WIDTH + ITEM_GAP : 0) : 0
      const extraPrimary = Math.max(0, primaryNatural - primaryMin)
      const extraSecondary = Math.max(0, secondaryNatural - secondaryMin)
      const extraTotal = extraPrimary + extraSecondary
      const remaining = Math.max(0, available - primaryMin - secondaryMin)
      const primaryBudget = Math.min(primaryNatural, primaryMin + (extraTotal ? remaining * extraPrimary / extraTotal : 0))
      const secondaryBudget = Math.min(secondaryNatural, secondaryMin + (extraTotal ? remaining * extraSecondary / extraTotal : 0))
      const nextPrimary = overflowFor(items, resolvedActiveId, primaryBudget, widths, 'primary')
      const nextSecondary = overflowFor(subItems, resolvedSecondaryActiveId, secondaryBudget, widths, 'secondary')
      setHiddenIds(previous => sameIds(previous, nextPrimary) ? previous : nextPrimary)
      setHiddenSubIds(previous => sameIds(previous, nextSecondary) ? previous : nextSecondary)
    }
    calculate()
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(calculate) : null
    observer?.observe(rail); if (rail.parentElement) observer?.observe(rail.parentElement)
    window.addEventListener('resize', calculate)
    return () => { observer?.disconnect(); window.removeEventListener('resize', calculate) }
  }, [itemsSignature, subItemsSignature, resolvedActiveId, resolvedSecondaryActiveId, title])

  useLayoutEffect(() => {
    const box = itemsRef.current
    if (!box) return
    const place = () => {
      const active = box.querySelector<HTMLElement>('.workspaceNavigationRailItem.active')
      if (!active) { box.classList.remove('hasPill', 'pillReady'); return }
      box.style.setProperty('--pill-x', active.offsetLeft + 'px'); box.style.setProperty('--pill-y', active.offsetTop + 'px')
      box.style.setProperty('--pill-w', active.offsetWidth + 'px'); box.style.setProperty('--pill-h', active.offsetHeight + 'px')
      if (!box.classList.contains('hasPill')) { box.classList.add('hasPill'); requestAnimationFrame(() => box.classList.add('pillReady')) }
    }
    place(); const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null
    observer?.observe(box); return () => observer?.disconnect()
  }, [resolvedActiveId, hiddenIds, itemsSignature])

  useLayoutEffect(() => {
    const box = subItemsRef.current
    if (!box) return
    const place = () => {
      const active = box.querySelector<HTMLElement>('.workspaceNavigationSubItem.active')
      if (!active) { box.classList.remove('hasPill', 'pillReady'); return }
      box.style.setProperty('--pill-x', active.offsetLeft + 'px'); box.style.setProperty('--pill-y', active.offsetTop + 'px')
      box.style.setProperty('--pill-w', active.offsetWidth + 'px'); box.style.setProperty('--pill-h', active.offsetHeight + 'px')
      if (!box.classList.contains('hasPill')) { box.classList.add('hasPill'); requestAnimationFrame(() => box.classList.add('pillReady')) }
    }
    place(); const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(place) : null
    observer?.observe(box); return () => observer?.disconnect()
  }, [resolvedSecondaryActiveId, hiddenSubIds, subItemsSignature])

  useEffect(() => {
    if (!window.matchMedia('(max-width: 720px)').matches) return
    // Each group scrolls independently so both active choices remain visible
    // even when the combined primary + secondary labels exceed phone width.
    const groups: Array<[HTMLDivElement | null, string]> = [
      [itemsRef.current, '.workspaceNavigationRailItem.active'],
      [subItemsRef.current, '.workspaceNavigationSubItem.active'],
    ]
    for (const [group, selector] of groups) {
      if (!group) continue
      const active = group.querySelector<HTMLElement>(selector)
      if (!active) continue
      if (active.offsetLeft < group.scrollLeft + 8) group.scrollLeft = Math.max(0, active.offsetLeft - 8)
      else if (active.offsetLeft + active.offsetWidth > group.scrollLeft + group.clientWidth - 8) {
        group.scrollLeft = active.offsetLeft + active.offsetWidth - group.clientWidth + 8
      }
    }
  }, [resolvedActiveId, resolvedSecondaryActiveId, hiddenIds, hiddenSubIds])

  const visibleItems = items.filter(item => item.id === resolvedActiveId || !hiddenIds.includes(item.id))
  const overflowItems = items.filter(item => !visibleItems.some(visible => visible.id === item.id))
  const visibleSubItems = subItems.filter(item => item.id === resolvedSecondaryActiveId || !hiddenSubIds.includes(item.id))
  const overflowSubItems = subItems.filter(item => !visibleSubItems.some(visible => visible.id === item.id))
  const selectPrimary = (id: string) => { onSelect(id); if (overflowRef.current) overflowRef.current.open = false }
  const selectSecondary = (id: string) => { (onSubSelect ?? onSelect)(id); if (subOverflowRef.current) subOverflowRef.current.open = false }

  return <>
    <nav ref={railRef} className="workspaceNavigationRail" aria-label={ariaLabel}>
      <span ref={titleRef} className="workspaceNavigationRailTitle">{title}</span>
      {items.length > 0 && <span className="workspaceNavigationRailDivider" aria-hidden="true" />}
      <div ref={itemsRef} className="workspaceNavigationRailItems" role="group" aria-label={'Navigasi utama ' + title}>
        {visibleItems.map(item => { const selected = item.id === resolvedActiveId; return <button type="button" key={item.id} className={'workspaceNavigationRailItem' + (selected ? ' active' : '')} title={item.hint} aria-current={selected ? 'page' : undefined} onClick={() => selectPrimary(item.id)}>{item.label}</button> })}
      </div>
      {overflowItems.length > 0 && <details ref={overflowRef} className="workspaceNavigationOverflow"><summary aria-label={'Navigasi utama lainnya untuk ' + title}>Lainnya</summary><div className="workspaceNavigationOverflowMenu" role="group" aria-label="Tab utama lainnya">{overflowItems.map(item => <button type="button" key={item.id} className="workspaceNavigationOverflowItem" title={item.hint} onClick={() => selectPrimary(item.id)}>{item.label}</button>)}</div></details>}
      {subItems.length > 0 && <span className="workspaceNavigationGroupDivider" aria-hidden="true" />}
      {subItems.length > 0 && <div ref={subItemsRef} className="workspaceNavigationSubItems" role="group" aria-label={'Navigasi lanjutan ' + (subTitle || title)}>
        {visibleSubItems.map(item => { const selected = item.id === resolvedSecondaryActiveId; return <button type="button" key={item.id} className={'workspaceNavigationSubItem' + (selected ? ' active' : '')} title={item.hint} aria-current={selected ? 'page' : undefined} onClick={() => selectSecondary(item.id)}>{item.label}</button> })}
      </div>}
      {overflowSubItems.length > 0 && <details ref={subOverflowRef} className="workspaceNavigationOverflow workspaceNavigationSubOverflow"><summary aria-label={'Navigasi lanjutan lainnya untuk ' + title}>Lainnya</summary><div className="workspaceNavigationOverflowMenu" role="group" aria-label="Tab lanjutan lainnya">{overflowSubItems.map(item => <button type="button" key={item.id} className={'workspaceNavigationOverflowItem' + (item.id === resolvedSecondaryActiveId ? ' active' : '')} title={item.hint} aria-current={item.id === resolvedSecondaryActiveId ? 'page' : undefined} onClick={() => selectSecondary(item.id)}>{item.label}</button>)}</div></details>}
      <div ref={measureRef} className="workspaceNavigationMeasure" aria-hidden="true">{items.map(item => <span key={'primary-' + item.id} data-nav-measure={'primary:' + item.id}>{item.label}</span>)}{subItems.map(item => <span key={'secondary-' + item.id} data-nav-measure={'secondary:' + item.id}>{item.label}</span>)}</div>
    </nav>
    {mobileWorkspaceTabs && <section className="workspaceMobileNavigation" aria-label="Navigasi workspace">
      {showTransitionNotice && <div className="workspaceMobileTransitionNotice" role="status">
        <span>Navigasi HP diperbarui. Pilih modul melalui Menu, lalu gunakan Tab Workspace untuk berpindah halaman. Bookmark lama tetap diarahkan otomatis.</span>
        <button type="button" onClick={dismissTransitionNotice} aria-label="Tutup pemberitahuan navigasi">×</button>
      </div>}
      <div className="workspaceMobileNavigationHead">
        <div className="workspaceMobileBreadcrumb" aria-label="Lokasi kerja">
          <span>{title}</span>
          {subItems.length > 0 && <>
            <span className="workspaceMobileBreadcrumbDivider" aria-hidden="true">/</span>
            <strong>{subTitle || activePrimaryItem?.label || 'Bagian workspace'}</strong>
          </>}
        </div>
        {subItems.length > 0 && items.length > 1 && <details ref={mobileGroupRef} className="workspaceMobileGroupPicker">
          <summary><span>Bagian</span><strong>{activePrimaryItem?.label || 'Pilih bagian'}</strong></summary>
          <div className="workspaceMobileGroupMenu" role="group" aria-label="Pilih bagian workspace">
            {items.map(item => <button type="button" key={item.id} aria-current={item.id === resolvedActiveId ? 'page' : undefined} onClick={() => { selectPrimary(item.id); if (mobileGroupRef.current) mobileGroupRef.current.open = false }}>{item.label}</button>)}
          </div>
        </details>}
      </div>
      {mobileTabItems.length > 0 && <nav className="workspaceMobileTabs" aria-label="Tab Workspace">
        {mobileTabItems.map(item => {
          const selected = item.id === activeMobileTabId
          return <button type="button" key={item.id} className={'workspaceMobileTab' + (selected ? ' active' : '')} aria-current={selected ? 'page' : undefined} onClick={() => subItems.length ? selectSecondary(item.id) : selectPrimary(item.id)}>{item.label}</button>
        })}
      </nav>}
    </section>}
    {pageHint && !hintsHidden && <p className="workspacePageHint" role="note"><svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="7.5" /><path d="M10 9v5M10 6.2v.3" /></svg><span>{pageHint}</span><button type="button" onClick={() => toggleHints(true)} aria-label="Sembunyikan penjelasan halaman" title="Sembunyikan penjelasan (bisa dimunculkan lagi di Pengaturan → Preferensi Tampilan)">×</button></p>}
  </>
}
