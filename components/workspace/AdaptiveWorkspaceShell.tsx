'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { resolveAdaptiveWorkspace, type AdaptiveWorkspaceDensity } from '@/lib/aureka/adaptive-workspace'
import { APPEARANCE_EVENT, APPEARANCE_KEY, readAppearancePreferences } from '@/lib/ui/appearance-preferences'

type AdaptiveWorkspaceShellProps = {
  moduleId: string
  containerLabel: string
  userId?: string
  children: ReactNode
}

/** All workspaces follow the same device-level density preference.
 * No header-injected control and no competing per-module density setting.
 */
export default function AdaptiveWorkspaceShell({
  moduleId,
  containerLabel,
  children,
}: AdaptiveWorkspaceShellProps) {
  const definition = resolveAdaptiveWorkspace(moduleId, containerLabel)
  const [density, setDensity] = useState<AdaptiveWorkspaceDensity>('comfortable')

  useEffect(() => {
    const refresh = () => setDensity(readAppearancePreferences().density)
    refresh()
    const onStorage = (event: StorageEvent) => {
      if (event.key === APPEARANCE_KEY || event.key === null) refresh()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(APPEARANCE_EVENT, refresh)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(APPEARANCE_EVENT, refresh)
    }
  }, [])

  return (
    <section
      className="adaptiveWorkspaceShell"
      data-adaptive-workspace={definition.workspaceId}
      data-adaptive-layout={definition.layout.id}
      data-adaptive-density={density}
      aria-label={definition.containerLabel}
    >
      <div className="adaptiveWorkspaceContent" data-adaptive-density={density}>{children}</div>
    </section>
  )
}
