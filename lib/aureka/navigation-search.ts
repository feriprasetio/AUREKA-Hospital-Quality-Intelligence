type NavigationChild = { id: string; label: string; children?: NavigationChild[] }
export type NavigationSearchResult = {
  key: string
  moduleId: string
  childId?: string
  label: string
  context: string
}

const normalize = (value: string) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('id-ID').trim()

/** Search only the already-authorized navigation supplied by the caller. */
export function searchWorkspaceNavigation(
  modules: ReadonlyArray<readonly [string, string]>,
  children: Record<string, NavigationChild[]>,
  query: string,
): NavigationSearchResult[] {
  const terms = normalize(query).split(/\s+/).filter(Boolean)
  if (!terms.length) return []
  const results: NavigationSearchResult[] = []
  const matches = (text: string) => terms.every((term) => normalize(text).includes(term))
  for (const [moduleId, label] of modules) {
    if (matches(label)) results.push({ key: moduleId, moduleId, label, context: 'Area kerja' })
    const visit = (items: NavigationChild[], context: string) => {
      for (const child of items) {
        if (matches(`${context} ${child.label}`)) {
          results.push({ key: `${moduleId}/${child.id}`, moduleId, childId: child.id, label: child.label, context })
        }
        if (child.children) visit(child.children, `${context} · ${child.label}`)
      }
    }
    visit(children[moduleId] ?? [], label)
  }
  return results
}
