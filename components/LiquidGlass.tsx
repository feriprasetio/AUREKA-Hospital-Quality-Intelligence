import type { MouseEventHandler, ReactNode } from 'react'

type LiquidGlassProps = {
  children: ReactNode
  className?: string
  onClick?: MouseEventHandler<HTMLDivElement>
  role?: 'button' | 'article' | 'region'
  tabIndex?: number
}

export function LiquidGlass({
  children,
  className = '',
  onClick,
  role,
  tabIndex,
}: LiquidGlassProps) {
  const clickable = Boolean(onClick)

  return (
    <div
      className={`liquidGlass ${clickable ? 'liquidGlassClickable' : ''} ${className}`.trim()}
      onClick={onClick}
      role={role ?? (clickable ? 'button' : undefined)}
      tabIndex={tabIndex ?? (clickable ? 0 : undefined)}
      onKeyDown={
        clickable
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                event.currentTarget.click()
              }
            }
          : undefined
      }
    >
      <div className="liquidGlassEdge" aria-hidden="true" />
      <div className="liquidGlassSheen" aria-hidden="true" />
      <div className="liquidGlassContent">{children}</div>
    </div>
  )
}

export function LiquidGlassButton({
  children,
  className = '',
  type = 'button',
  onClick,
  disabled = false,
}: {
  children: ReactNode
  className?: string
  type?: 'button' | 'submit'
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <div className={`liquidButton ${className}`.trim()}>
      <button type={type} onClick={onClick} disabled={disabled}>
        {children}
      </button>
    </div>
  )
}
