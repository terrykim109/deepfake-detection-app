import React from 'react'
import { cx } from './cx'

export interface PageHeaderProps {
  title: React.ReactNode
  subtitle?: React.ReactNode
  /** Right-aligned controls (e.g. a sort select). */
  actions?: React.ReactNode
  className?: string
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions, className }) => (
  <header className={cx('ui-page-header', className)}>
    <div>
      <h1 className="ui-page-header__title">{title}</h1>
      {subtitle && <p className="ui-page-header__subtitle">{subtitle}</p>}
    </div>
    {actions}
  </header>
)
