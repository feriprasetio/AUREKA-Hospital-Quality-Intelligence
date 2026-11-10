import type { ReactNode } from 'react'

type WorkspaceModuleHeaderProps = {
  title: ReactNode
  description?: ReactNode
  eyebrow?: string
  className?: string
  actions?: ReactNode
}

/** Keeps operational actions visible without repeating a full page-sized hero. */
export default function WorkspaceModuleHeader({
  title,
  description,
  eyebrow,
  className = '',
  actions,
}: WorkspaceModuleHeaderProps) {
  return (
    <section className={`workspaceModuleHeader ${className}`}>
      <div className="workspaceModuleHeaderCopy">
        {eyebrow && <span className="workspaceModuleEyebrow">{eyebrow}</span>}
        <h2>{title}</h2>
      </div>
      <div className="workspaceModuleHeaderTools">
        {description != null && description !== '' && (
          <details className="workspaceModuleGuide">
            <summary>
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="10" cy="10" r="7.25" />
                <path d="M10 9v5M10 6v.2" />
              </svg>
              Panduan
            </summary>
            <div className="workspaceModuleGuideBody">{description}</div>
          </details>
        )}
        {actions && <div className="workspaceModuleActions">{actions}</div>}
      </div>
    </section>
  )
}
