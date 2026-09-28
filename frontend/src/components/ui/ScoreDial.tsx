import React from 'react'
import { cx } from './cx'
import type { VerdictState } from './VerdictBadge'

export interface ScoreDialProps {
  /** Confidence 0–100. null/undefined renders "–" (Inconclusive / Failed). */
  value?: number | null
  verdict?: VerdictState
  label?: string
  className?: string
}

export const ScoreDial: React.FC<ScoreDialProps> = ({ value, verdict, label = 'Confidence', className }) => {
  const hasValue = typeof value === 'number' && Number.isFinite(value)
  const display = hasValue ? Math.round(value) : null
  return (
    <div
      className={cx('ui-score', verdict && `ui-score--${verdict}`, className)}
      role="img"
      aria-label={hasValue ? `${label}: ${display}%` : `${label}: not available`}
    >
      <span className="ui-score__value" aria-hidden="true">
        {hasValue ? (
          <>
            {display}
            <small>%</small>
          </>
        ) : (
          '–'
        )}
      </span>
      <span className="ui-score__label" aria-hidden="true">{label}</span>
    </div>
  )
}
