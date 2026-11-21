'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  parseWorkspacePreference,
  resolveAdaptiveWorkspace,
  workspacePreferenceStorageKey,
  type AdaptiveWorkspaceDensity,
} from '@/lib/aureka/adaptive-workspace'

type AdaptiveWorkspaceShellProps = {
  moduleId: string
  containerLabel: string
  userId: string
  controlTarget: HTMLElement | null
  children: ReactNode
}

/** The layout and density are presentation-only. Each module owns its data and actions. */
export default function AdaptiveWorkspaceShell({
  moduleId,
  containerLabel,
  userId,
  controlTarget,
  children,
}: AdaptiveWorkspaceShellProps) {
  const definition = resolveAdaptiveWorkspace(moduleId, containerLabel)
  const legacyKey = workspacePreferenceStorageKey(definition.workspaceId)
  const storageKey = workspacePreferenceStorageKey(definition.workspaceId, userId)
  const [preference, setPreference] = useState<{ key: string; density: AdaptiveWorkspaceDensity } | null>(null)
  const density = preference?.key === storageKey ? preference.density : 'comfortable'

  useEffect(() => {
    const read = () => {
      let density: AdaptiveWorkspaceDensity = 'comfortable'
      try {
        const stored = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(legacyKey)
        density = parseWorkspacePreference(stored).density
      } catch { /* Preferences remain available for the current view. */ }
      setPreference({ key: storageKey, density })
    }
    read()
    const onStorage = (event: StorageEvent) => {
      if (event.key === storageKey || event.key === null) read()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [storageKey, legacyKey])

  const toggleDensity = () => {
    const next = density === 'compact' ? 'comfortable' : 'compact'
    setPreference({ key: storageKey, density: next })
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, density: next }))
    } catch { /* Preferences remain available for the current view. */ }
  }

  return (
    <section
      className="adaptiveWorkspaceShell"
      data-adaptive-workspace={definition.workspaceId}
      data-adaptive-layout={definition.layout.id}
      data-adaptive-density={density}
      aria-label={definition.containerLabel}
    >
      {controlTarget && createPortal(
        <button
          type="button"
          className="workspaceHeaderIcon workspaceDensityToggle"
          aria-label="Tampilan ringkas"
          aria-pressed={density === 'compact'}
          title={density === 'compact' ? 'Tampilan nyaman' : 'Tampilan ringkas'}
          onClick={toggleDensity}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16M8 5v4m8 1v4m-8 1v4" /></svg>
        </button>,
        controlTarget,
      )}
      <div className="adaptiveWorkspaceContent" data-adaptive-density={density}>{children}</div>
    </section>
  )
}
