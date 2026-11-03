'use client'

type AsyncState = 'loading' | 'empty' | 'error'

type AsyncStatePanelProps = {
  state: AsyncState
  title: string
  description?: string
  retryLabel?: string
  onRetry?: () => void
  retrying?: boolean
  compact?: boolean
}

export default function AsyncStatePanel({
  state,
  title,
  description,
  retryLabel = 'Coba lagi',
  onRetry,
  retrying = false,
  compact = false,
}: AsyncStatePanelProps) {
  const isError = state === 'error'
  const isLoading = state === 'loading'

  return (
    <section
      className={`aurekaAsyncState ${compact ? 'compact' : ''} ${state}`}
      role={isError ? 'alert' : 'status'}
      aria-live={isError ? 'assertive' : 'polite'}
      aria-busy={isLoading || retrying}
    >
      <style jsx>{`
        .aurekaAsyncState {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          width: 100%;
          min-width: 0;
          padding: 16px;
          border: 1px solid var(--aureka-color-border, #e5e7eb);
          border-radius: 14px;
          background: var(--aureka-color-surface-muted, #f8faf9);
          color: var(--aureka-color-foreground, #1e293b);
          text-align: left;
        }
        .aurekaAsyncState.compact { padding: 11px 12px; border-radius: 11px; }
        .aurekaAsyncState.error {
          border-color: color-mix(in srgb, var(--aureka-color-danger, #dc2626) 25%, white);
          background: var(--aureka-color-danger-soft, #fef2f2);
        }
        .aurekaAsyncState.empty { background: var(--aureka-color-surface-muted, #f8faf9); }
        .stateIcon {
          display: grid;
          place-items: center;
          flex: 0 0 28px;
          width: 28px;
          height: 28px;
          border-radius: 9px;
          background: var(--aureka-color-surface, #fff);
          color: var(--aureka-color-muted, #64748b);
          font-size: 14px;
          font-weight: 800;
        }
        .error .stateIcon { color: var(--aureka-color-danger, #dc2626); }
        .loading .stateIcon { color: var(--aureka-color-primary, #0f7656); }
        .spinner {
          width: 15px;
          height: 15px;
          border: 2px solid currentColor;
          border-right-color: transparent;
          border-radius: 50%;
          animation: aureka-spin .8s linear infinite;
        }
        .stateBody { flex: 1 1 auto; min-width: 0; }
        .stateTitle { display: block; font-size: 12px; line-height: 1.45; font-weight: 800; }
        .stateDescription { display: block; margin-top: 3px; color: var(--aureka-color-foreground-secondary, #475569); font-size: 11px; line-height: 1.55; overflow-wrap: anywhere; }
        .stateAction {
          flex: 0 0 auto;
          min-height: 36px;
          padding: 7px 11px;
          border: 1px solid var(--aureka-color-border-strong, #cbd5e1);
          border-radius: 9px;
          background: var(--aureka-color-surface, #fff);
          color: var(--aureka-color-foreground, #1e293b);
          font: inherit;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }
        .stateAction:focus-visible { outline: 3px solid var(--aureka-color-ring, rgba(15,118,86,.32)); outline-offset: 2px; }
        .stateAction:disabled { cursor: wait; opacity: .65; }
        @keyframes aureka-spin { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) { .spinner { animation-duration: 2s; } }
        @media (max-width: 480px) {
          .aurekaAsyncState { flex-wrap: wrap; }
          .stateAction { margin-left: 40px; }
        }
      `}</style>
      <span className="stateIcon" aria-hidden="true">
        {isLoading ? <span className="spinner" /> : isError ? '!' : 'i'}
      </span>
      <span className="stateBody">
        <strong className="stateTitle">{title}</strong>
        {description ? <span className="stateDescription">{description}</span> : null}
      </span>
      {isError && onRetry ? (
        <button type="button" className="stateAction" disabled={retrying} onClick={onRetry}>
          {retrying ? 'Memuat…' : retryLabel}
        </button>
      ) : null}
    </section>
  )
}
