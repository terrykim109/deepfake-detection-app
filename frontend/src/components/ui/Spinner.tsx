import React from 'react'
import { cx } from './cx'

export interface SpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  /** Announced to screen readers. Omit when a visible label sits next to it. */
  label?: string
  className?: string
}

export const Spinner: React.FC<SpinnerProps> = ({ size = 'md', label, className }) => (
  <span
    className={cx('ui-spinner', `ui-spinner--${size}`, className)}
    role={label ? 'status' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : true}
  />
)

/** Full-viewport loading state used while auth resolves. */
export const FullPageSpinner: React.FC<{ label?: string }> = ({ label = 'Loading' }) => (
  <div className="ui-loading-full">
    <Spinner size="lg" label={label} />
  </div>
)
