import React from 'react'
import { cx } from './cx'

export interface CardProps extends React.HTMLAttributes<HTMLElement> {
  as?: 'section' | 'div' | 'article' | 'aside' | 'li'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  /** Adds hover elevation for clickable cards. */
  interactive?: boolean
}

export const Card: React.FC<CardProps> = ({
  as: Tag = 'section',
  padding = 'md',
  interactive,
  className,
  children,
  ...rest
}) => (
  <Tag
    className={cx('ui-card', `ui-card--pad-${padding}`, interactive && 'ui-card--interactive', className)}
    {...rest}
  >
    {children}
  </Tag>
)
