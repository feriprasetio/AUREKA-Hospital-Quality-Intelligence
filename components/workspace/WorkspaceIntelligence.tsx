import type { ReactNode } from 'react'

export type WorkspaceIntelligenceMetric = {
  label: string
  value: string | number | null
}

const formatNumber = new Intl.NumberFormat('id-ID')

export function WorkspaceIntelligenceLabel() {
  return <span className="workspaceIntelligenceLabel">Visual Intelligence</span>
}

export function WorkspaceIntelligenceMetrics({
  metrics, loading = false, unavailable = false,
}: {
  metrics: readonly WorkspaceIntelligenceMetric[]
  loading?: boolean
  unavailable?: boolean
}) {
  if (!metrics.length) return null
  if (loading || unavailable) {
    return <p className="workspaceIntelligenceStatus" role="status">
      {loading ? 'Memuat ringkasan…' : 'Ringkasan belum tersedia.'}
    </p>
  }

  return (
    <dl className="workspaceIntelligenceMetrics" aria-label="Ringkasan lembar kerja">
      {metrics.map(({ label, value }) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{typeof value === 'number' ? formatNumber.format(value) : value ?? '-'}</dd>
        </div>
      ))}
    </dl>
  )
}

export function WorkspaceIntelligenceHeading({ children }: { children: ReactNode }) {
  return <div className="workspaceIntelligenceHeading">
    <WorkspaceIntelligenceLabel />
    <h2>{children}</h2>
  </div>
}
