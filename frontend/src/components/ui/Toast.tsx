import React from 'react'
import { cx } from './cx'
import { AlertIcon, CheckCircleIcon, InfoIcon } from './icons'

export interface ToastProps {
  message: React.ReactNode
  tone?: 'success' | 'error' | 'info'
  className?: string
}

const TONE_ICON = {
  success: CheckCircleIcon,
  error: AlertIcon,
  info: InfoIcon,
} as const

/* Render conditionally; the caller owns the timer. */
export const Toast: React.FC<ToastProps> = ({ message, tone = 'success', className }) => {
  const Icon = TONE_ICON[tone]
  return (
    <div className={cx('ui-toast', `ui-toast--${tone}`, className)} role="status" aria-live="polite">
      <Icon className="ui-toast__icon" />
      <span>{message}</span>
    </div>
  )
}
