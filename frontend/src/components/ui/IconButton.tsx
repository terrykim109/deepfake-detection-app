import React from 'react'
import { cx } from './cx'

export interface IconButtonProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  /** Accessible name — required because the button has no visible text. */
  label: string
  /** Image path (e.g. /assets/icon-save.svg) or an inline element. */
  icon: string | React.ReactNode
  size?: 'sm' | 'md' | 'lg'
}

export const IconButton: React.FC<IconButtonProps> = ({
  label,
  icon,
  size = 'md',
  className,
  type = 'button',
  ...rest
}) => (
  <button
    type={type}
    className={cx('ui-icon-btn', `ui-icon-btn--${size}`, className)}
    aria-label={label}
    title={label}
    {...rest}
  >
    {typeof icon === 'string' ? <img src={icon} alt="" /> : icon}
  </button>
)
