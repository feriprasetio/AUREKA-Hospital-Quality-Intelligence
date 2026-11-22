import { useCallback, useLayoutEffect, useRef } from 'react'

/** Invalidates a request when it is superseded, its scope changes, or the workspace closes. */
export function useLatestWorkspaceRequest(scope: string) {
  const active = useRef<{ scope: string; generation: number } | null>(null)

  useLayoutEffect(() => {
    active.current = { scope, generation: 0 }
    return () => { active.current = null }
  }, [scope])

  return useCallback(() => {
    const requestScope = active.current
    if (!requestScope || requestScope.scope !== scope) return null
    const generation = ++requestScope.generation
    return () => active.current === requestScope && requestScope.generation === generation
  }, [scope])
}
