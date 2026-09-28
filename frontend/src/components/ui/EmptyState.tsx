import React from 'react'
import { cx } from './cx'

export interface EmptyStateProps {
  message: React.ReactNode
  /** Optional image path shown above the message. */
  icon?: string
  action?: React.ReactNode
  className?: string
}

export const EmptyState: React.FC<EmptyStateProps> = ({ message, icon, action, className }) => (
  <div className={cx('ui-empty', className)}>
    {icon && <img src={icon} alt="" />}
    <p>{message}</p>
    {action}
  </div>
)
