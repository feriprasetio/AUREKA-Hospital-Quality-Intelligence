'use client'

import type { ReactNode } from 'react'

type WorkspaceTab<T extends string> = {
  value: T
  label: string
  count?: number
  icon?: ReactNode
  hint?: string
}

type WorkspaceTabsProps<T extends string> = {
  idPrefix: string
  label: string
  value: T
  items: readonly WorkspaceTab<T>[]
  onChange: (value: T) => void
  panelId: string
  className?: string
}

/** Desktop keyboard tabs and a native phone selector share the same destinations. */
export default function WorkspaceTabs<T extends string>({
  idPrefix, label, value, items, onChange, panelId, className = '',
}: WorkspaceTabsProps<T>) {
  return (
    <div className={`workspaceViewTabs ${className}`}>
      <div className="workspaceViewTabList" role="tablist" aria-label={label}>
        {items.map(item => (
          <button
            type="button"
            role="tab"
            key={item.value}
            id={`${idPrefix}-tab-${item.value}`}
            className={`workspaceViewTab ${value === item.value ? 'active' : ''}`}
            aria-selected={value === item.value}
            aria-controls={value === item.value ? panelId : undefined}
            tabIndex={value === item.value ? 0 : -1}
            onClick={() => onChange(item.value)}
            onKeyDown={event => {
              const buttons = Array.from(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])
              const index = buttons.indexOf(event.currentTarget)
              const next = event.key === 'ArrowRight' ? (index + 1) % buttons.length : event.key === 'ArrowLeft' ? (index + buttons.length - 1) % buttons.length : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : -1
              if (next < 0) return
              event.preventDefault()
              buttons[next].click()
              buttons[next].focus()
            }}
          >
            {item.icon && <span className="workspaceViewTabIcon" aria-hidden="true">{item.icon}</span>}
            <span className="workspaceViewTabCopy"><b>{item.label}</b>{item.hint && <small>{item.hint}</small>}</span>
            {item.count != null && <span className="workspaceViewTabCount">{item.count}</span>}
          </button>
        ))}
      </div>
      <label className="workspaceViewTabMobile">
        <span>{label}</span>
        <select aria-label={label} value={value} onChange={event => {
          const item = items.find(option => option.value === event.target.value)
          if (item) onChange(item.value)
        }}>
          {items.map(item => <option key={item.value} value={item.value}>{item.label}{item.count != null ? ` (${item.count})` : ''}</option>)}
        </select>
      </label>
    </div>
  )
}
