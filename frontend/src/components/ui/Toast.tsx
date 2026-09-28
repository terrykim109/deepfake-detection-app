import React from 'react'
import { cx } from './cx'

export interface ToastProps {
  message: React.ReactNode
  tone?: 'success' | 'error' | 'info'
  className?: string
}

/* Render conditionally; the caller owns the timer. */
export const Toast: React.FC<ToastProps> = ({ message, tone = 'success', className }) => (
  <div className={cx('ui-toast', `ui-toast--${tone}`, className)} role="status" aria-live="polite">
    {message}
  </div>
)
