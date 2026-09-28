import React from 'react'
import type { Verdict } from '../../detection/detector'
import { cx } from './cx'
import { AlertIcon, CheckCircleIcon, QuestionIcon, WarningIcon } from './icons'

/* SDS §4.1.2.1 result states (FR-10 / BR-13). The detector's Verdict
   covers the three completed states; 'failed' is UI-only. */
export type VerdictState = Verdict | 'failed'

export const VERDICT_META: Record<
  VerdictState,
  { label: string; Icon: React.FC<React.SVGProps<SVGSVGElement>> }
> = {
  real: { label: 'Likely Authentic', Icon: CheckCircleIcon },
  fake: { label: 'Likely Manipulated', Icon: WarningIcon },
  warn: { label: 'Inconclusive', Icon: QuestionIcon },
  failed: { label: 'Failed', Icon: AlertIcon },
}

export interface VerdictBadgeProps {
  verdict: VerdictState
  /** Overrides the standard state label (e.g. the detector's verdictLabel). */
  label?: string
  size?: 'sm' | 'md'
  className?: string
}

export const VerdictBadge: React.FC<VerdictBadgeProps> = ({ verdict, label, size = 'md', className }) => {
  const { label: fallback, Icon } = VERDICT_META[verdict]
  return (
    <span className={cx('ui-verdict', `ui-verdict--${verdict}`, `ui-verdict--${size}`, className)}>
      <Icon />
      {label || fallback}
    </span>
  )
}
