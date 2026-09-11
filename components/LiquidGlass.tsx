import type { ReactNode } from 'react'

type LiquidGlassProps = {
  children: ReactNode
  className?: string
}

export function LiquidGlass({ children, className = '' }: LiquidGlassProps) {
  return (
    <div className={`liquidGlass ${className}`.trim()}>
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
