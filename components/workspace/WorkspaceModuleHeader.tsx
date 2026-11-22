import type { ReactNode } from 'react'
import { WorkspaceIntelligenceHeading, WorkspaceIntelligenceMetrics, type WorkspaceIntelligenceMetric } from './WorkspaceIntelligence'

type WorkspaceModuleHeaderProps = {
  title: ReactNode
  className?: string
  actions?: ReactNode
  metrics?: readonly WorkspaceIntelligenceMetric[]
  loading?: boolean
  unavailable?: boolean
}

export default function WorkspaceModuleHeader({ title, className = '', actions, metrics, loading, unavailable }: WorkspaceModuleHeaderProps) {
  return (
    <header className={`workspaceModuleHeader ${className}`}>
      <div className="workspaceModuleHeaderCopy"><WorkspaceIntelligenceHeading>{title}</WorkspaceIntelligenceHeading></div>
      {actions && <div className="workspaceModuleHeaderTools"><div className="workspaceModuleActions">{actions}</div></div>}
      {metrics && <WorkspaceIntelligenceMetrics metrics={metrics} loading={loading} unavailable={unavailable} />}
    </header>
  )
}
