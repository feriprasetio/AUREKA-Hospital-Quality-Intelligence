import type { ReactNode } from 'react'

type WorkspaceModuleHeaderProps = {
  title: ReactNode
  className?: string
  actions?: ReactNode
}

export default function WorkspaceModuleHeader({ title, className = '', actions }: WorkspaceModuleHeaderProps) {
  return (
    <header className={`workspaceModuleHeader ${className}`}>
      <div className="workspaceModuleHeaderCopy"><h2>{title}</h2></div>
      {actions && <div className="workspaceModuleHeaderTools"><div className="workspaceModuleActions">{actions}</div></div>}
    </header>
  )
}
