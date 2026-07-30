type Props = {
  title: string
  hint?: string
  /** inline = embedded in a panel; banner = full-width soft strip */
  variant?: 'inline' | 'banner' | 'compact'
  className?: string
}

/** Polished loading state for any AI generate action. */
export default function GenerateLoader({
  title,
  hint = 'Usually a few seconds…',
  variant = 'inline',
  className = '',
}: Props) {
  if (variant === 'compact') {
    return (
      <div
        className={`flex items-center gap-2.5 text-sm text-muted ${className}`}
        role="status"
        aria-live="polite"
      >
        <span className="gen-spinner shrink-0" aria-hidden />
        <span className="font-medium text-board/80">{title}</span>
        <span className="gen-dots" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </div>
    )
  }

  if (variant === 'banner') {
    return (
      <div
        className={`rounded-2xl border border-accent-dark/20 bg-gradient-to-r from-emerald-50/90 via-white to-mist px-4 py-3.5 shadow-sm ${className}`}
        role="status"
        aria-live="polite"
      >
        <div className="flex items-center gap-3">
          <span className="gen-ring shrink-0" aria-hidden />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-board">{title}</p>
            {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
          </div>
          <span className="gen-dots hidden sm:flex" aria-hidden>
            <i />
            <i />
            <i />
          </span>
        </div>
        <div className="gen-bar mt-3" aria-hidden>
          <span />
        </div>
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col items-center justify-center gap-4 rounded-2xl border border-board/10 bg-mist/60 px-6 py-10 text-center ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="gen-ring" aria-hidden />
      <div>
        <p className="font-display text-lg font-bold text-board">{title}</p>
        {hint && <p className="mt-1.5 text-sm text-muted">{hint}</p>}
      </div>
      <div className="gen-bar w-40 max-w-full" aria-hidden>
        <span />
      </div>
      <span className="gen-dots" aria-hidden>
        <i />
        <i />
        <i />
      </span>
    </div>
  )
}
