import React from 'react'
import { cx } from './cx'
import { AlertIcon, CheckCircleIcon, InfoIcon, WarningIcon } from './icons'

export type AlertTone = 'error' | 'success' | 'info' | 'warning'

const ICONS: Record<AlertTone, React.FC<React.SVGProps<SVGSVGElement>>> = {
  error: AlertIcon,
  success: CheckCircleIcon,
  info: InfoIcon,
  warning: WarningIcon,
}

export interface AlertProps {
  tone?: AlertTone
  title?: React.ReactNode
  /** Replace the default tone icon, or pass null to hide it. */
  icon?: React.ReactNode | null
  className?: string
  children: React.ReactNode
}

/* Errors use role="alert" (interrupts the screen reader); every other
   tone uses role="status" (announced politely). */
export const Alert: React.FC<AlertProps> = ({ tone = 'info', title, icon, className, children }) => {
  const Icon = ICONS[tone]
  return (
    <div className={cx('ui-alert', `ui-alert--${tone}`, className)} role={tone === 'error' ? 'alert' : 'status'}>
      {icon === undefined ? <Icon className="ui-alert__icon" /> : icon}
      <div className="ui-alert__body">
        {title && <p className="ui-alert__title">{title}</p>}
        {children}
      </div>
    </div>
  )
}
