import React, { useId } from 'react'
import { cx } from './cx'

export interface SelectOption {
  value: string
  label: string
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  label: string
  hideLabel?: boolean
  options: SelectOption[]
}

export const Select: React.FC<SelectProps> = ({ label, hideLabel, options, className, id, ...rest }) => {
  const autoId = useId()
  const selectId = id ?? `select-${autoId}`
  return (
    <div className={cx('ui-select', className)}>
      <label htmlFor={selectId} className={cx('ui-select__label', hideLabel && 'visually-hidden')}>
        {label}
      </label>
      <select id={selectId} className="ui-select__input" {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
