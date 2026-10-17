import React from 'react'
import { cx } from './cx'

export interface SwitchProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange' | 'role' | 'aria-checked'> {
  checked: boolean
  onChange: (checked: boolean) => void
}

/* On/off toggle. A real button with role="switch", so Space/Enter work
   natively; name it with aria-label or aria-labelledby. */
export const Switch = React.forwardRef<HTMLButtonElement, SwitchProps>(
  ({ checked, onChange, className, ...rest }, ref) => (
    <button
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      className={cx('ui-switch', className)}
      onClick={() => onChange(!checked)}
      {...rest}
    >
      <span className="ui-switch__thumb" aria-hidden="true" />
    </button>
  ),
)
Switch.displayName = 'Switch'
