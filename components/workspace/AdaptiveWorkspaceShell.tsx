'use client'

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  parseWorkspacePreference,
  resolveAdaptiveWorkspace,
  workspacePreferenceStorageKey,
  type AdaptiveWorkspaceDensity,
} from '@/lib/aureka/adaptive-workspace'

type AdaptiveWorkspaceShellProps = {
  moduleId: string
  containerLabel: string
  children: ReactNode
}

/**
 * Adds a shared, low-impact adaptive layer around existing domain workspaces.
 * Domain forms, calculations, data access, and authorization remain owned by
 * their existing modules. Personal preferences are presentation-only.
 */
export default function AdaptiveWorkspaceShell({
  moduleId,
  containerLabel,
  children,
}: AdaptiveWorkspaceShellProps) {
  const definition = useMemo(
    () => resolveAdaptiveWorkspace(moduleId, containerLabel),
    [moduleId, containerLabel],
  )
  const storageKey = useMemo(
    () => workspacePreferenceStorageKey(definition.workspaceId),
    [definition.workspaceId],
  )
  const [density, setDensity] = useState<AdaptiveWorkspaceDensity>('comfortable')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    let nextDensity: AdaptiveWorkspaceDensity = 'comfortable'
    try {
      nextDensity = parseWorkspacePreference(window.localStorage.getItem(storageKey)).density
    } catch {
      // Private browsing and managed devices may deny local storage access.
    }
    setDensity(nextDensity)
    setHydrated(true)
  }, [storageKey])

  useEffect(() => {
    if (!hydrated) return
    try {
      window.localStorage.setItem(storageKey, JSON.stringify({ version: 1, density }))
    } catch {
      // The workspace remains usable when preferences cannot be persisted.
    }
  }, [density, hydrated, storageKey])

  const resetPreference = () => setDensity('comfortable')

  return (
    <section
      className="adaptiveWorkspaceShell"
      data-adaptive-workspace={definition.workspaceId}
      data-adaptive-layout={definition.layout.id}
      data-adaptive-density={density}
      aria-label={'Ruang kerja ' + definition.containerLabel}
    >
      <header className="adaptiveWorkspaceHeader">
        <div className="adaptiveWorkspaceHeading">
          <span className="adaptiveWorkspaceKicker">AUREKA WORKSPACE</span>
          <strong className="adaptiveWorkspaceLayoutName">{definition.layout.label}</strong>
          <p className="adaptiveWorkspaceDescription">{definition.layout.purpose}</p>
        </div>
        <details className="adaptiveWorkspacePreferences">
          <summary aria-label="Preferensi tampilan ruang kerja">
            Preferensi tampilan
          </summary>
          <div className="adaptiveWorkspacePreferencePanel">
            <label>
              <span>Kepadatan tampilan</span>
              <select
                aria-label="Kepadatan tampilan ruang kerja"
                value={density}
                onChange={(event) => setDensity(event.target.value === 'compact' ? 'compact' : 'comfortable')}
              >
                <option value="comfortable">Nyaman</option>
                <option value="compact">Ringkas</option>
              </select>
            </label>
            <button type="button" onClick={resetPreference} disabled={density === 'comfortable'}>
              Kembalikan default
            </button>
            <small>Preferensi disimpan pada perangkat ini dan tidak mengubah data pelayanan.</small>
          </div>
        </details>
      </header>
      <div className="adaptiveWorkspaceContent" data-adaptive-density={density}>
        {children}
      </div>
    </section>
  )
}
