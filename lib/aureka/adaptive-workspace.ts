export type AdaptiveLayoutId =
  | 'bento-grid'
  | 'three-pane'
  | 'analytical'
  | 'clinical-case'
  | 'risk-intelligence'
  | 'workflow-kanban'
  | 'timeline-gantt'
  | 'document-intelligence'
  | 'chat-artifact'
  | 'canvas-editor'

export type AdaptiveWorkspaceDensity = 'comfortable' | 'compact' | 'spacious'

export type AdaptiveLayoutDefinition = {
  id: AdaptiveLayoutId
  label: string
}

export type AdaptiveWorkspaceDefinition = {
  workspaceId: string
  moduleId: string
  containerLabel: string
  layout: AdaptiveLayoutDefinition
}

export const AUREKA_ADAPTIVE_LAYOUTS: readonly AdaptiveLayoutDefinition[] = [
  { id: 'bento-grid', label: 'Bento Intelligence' },
  { id: 'three-pane', label: 'Three-Pane Workspace' },
  { id: 'analytical', label: 'Analytical Workspace' },
  { id: 'clinical-case', label: 'Clinical Case Workspace' },
  { id: 'risk-intelligence', label: 'Risk Intelligence' },
  { id: 'workflow-kanban', label: 'Workflow / Kanban' },
  { id: 'timeline-gantt', label: 'Timeline / Gantt' },
  { id: 'document-intelligence', label: 'Document Intelligence' },
  { id: 'chat-artifact', label: 'Chat + Artifact' },
  { id: 'canvas-editor', label: 'Canvas Editor' },
] as const

const LAYOUT_BY_ID = new Map(AUREKA_ADAPTIVE_LAYOUTS.map((layout) => [layout.id, layout]))

function normalizeText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function slug(value: string): string {
  return normalizeText(value).replace(/\s+/g, '-').slice(0, 72) || 'overview'
}

function includesAny(value: string, terms: string[]): boolean {
  return terms.some((term) => value.includes(term))
}

function resolveLayout(moduleId: string, label: string): AdaptiveLayoutId {
  const module = normalizeText(moduleId)
  const context = normalizeText(label)

  if (includesAny(context, ['canvas editor', 'editor sertifikat', 'sertifikat'])) return 'canvas-editor'
  if (module === 'home' || module === 'insights') return 'bento-grid'
  if (module === 'nara') return 'chat-artifact'

  if (module === 'patients') {
    return context.includes('pola perawatan') ? 'analytical' : 'three-pane'
  }

  if (module === 'clinical') {
    return context.includes('realcost') ? 'analytical' : 'clinical-case'
  }

  if (module === 'quality') {
    if (includesAny(context, ['standar prosedur', 'spo', 'legal'])) return 'document-intelligence'
    if (includesAny(context, ['standar pelayanan', 'spm', 'monitoring', 'hasil capaian', 'kinerja pic', 'rekonsiliasi'])) return 'analytical'
    return 'three-pane'
  }

  if (module === 'secretariat') {
    if (includesAny(context, ['program kerja', 'timeline', 'rencana kegiatan'])) return 'timeline-gantt'
    return includesAny(context, ['undangan', 'kirim', 'prioritas', 'usulan']) ? 'workflow-kanban' : 'three-pane'
  }

  if (module === 'analytics') {
    return includesAny(context, ['program kerja', 'timeline', 'rencana kegiatan']) ? 'timeline-gantt' : 'workflow-kanban'
  }

  if (module === 'safety') {
    if (includesAny(context, ['budaya', 'survei', 'survey'])) return 'analytical'
    if (includesAny(context, ['fmea'])) return 'workflow-kanban'
    if (includesAny(context, ['insiden', 'investigasi', 'register'])) return 'clinical-case'
    return 'bento-grid'
  }

  if (module === 'risk') {
    if (includesAny(context, ['mitigasi', 'rtp', 'rencana tindak'])) return 'timeline-gantt'
    if (context.includes('fmea')) return 'workflow-kanban'
    if (context.includes('profil risiko')) return 'three-pane'
    return 'risk-intelligence'
  }

  if (module === 'staff') {
    if (includesAny(context, ['in house training', 'pelatihan'])) return 'timeline-gantt'
    if (includesAny(context, ['orientasi', 'mahasiswa', 'tim dan penugasan', 'penugasan'])) return 'workflow-kanban'
    if (includesAny(context, ['oppe', 'fppe'])) return 'clinical-case'
    if (includesAny(context, ['kinerja pic', 'monitoring kinerja'])) return 'analytical'
    return 'three-pane'
  }

  if (module === 'settings') {
    if (includesAny(context, ['legal', 'asset', 'dokumen'])) return 'document-intelligence'
    if (includesAny(context, ['audit log', 'riwayat aktivitas'])) return 'analytical'
    return 'three-pane'
  }

  return 'analytical'
}

export function resolveAdaptiveWorkspace(moduleId: string, containerLabel: string): AdaptiveWorkspaceDefinition {
  const safeModule = normalizeText(moduleId).replace(/\s+/g, '-') || 'workspace'
  const safeLabel = String(containerLabel || 'Ruang kerja').trim()
  const layoutId = resolveLayout(moduleId, safeLabel)
  const layout = LAYOUT_BY_ID.get(layoutId) || AUREKA_ADAPTIVE_LAYOUTS[2]

  return {
    workspaceId: safeModule + '-' + slug(safeLabel),
    moduleId: safeModule,
    containerLabel: safeLabel,
    layout,
  }
}

export function normalizeWorkspaceDensity(value: unknown): AdaptiveWorkspaceDensity {
  return value === 'compact' ? 'compact' : value === 'spacious' ? 'spacious' : 'comfortable'
}

export function workspacePreferenceStorageKey(workspaceId: string, userId?: string): string {
  const prefix = 'aureka:adaptive-workspace:v1:'
  return prefix + (userId ? encodeURIComponent(userId) + ':' : '') + slug(workspaceId)
}

export function parseWorkspacePreference(value: string | null): { version: 1; density: AdaptiveWorkspaceDensity } {
  if (!value) return { version: 1, density: 'comfortable' }
  try {
    const parsed = JSON.parse(value) as { version?: unknown; density?: unknown } | null
    if (!parsed || parsed.version !== 1) return { version: 1, density: 'comfortable' }
    return { version: 1, density: normalizeWorkspaceDensity(parsed.density) }
  } catch {
    return { version: 1, density: 'comfortable' }
  }
}
