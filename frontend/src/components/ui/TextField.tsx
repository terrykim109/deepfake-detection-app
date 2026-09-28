import React, { useId, useState } from 'react'
import { cx } from './cx'
import { IconButton } from './IconButton'

export interface TextFieldProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label: string
  /** Keep the label for screen readers only (placeholder carries the visual cue). */
  hideLabel?: boolean
  hint?: React.ReactNode
  error?: React.ReactNode
  /** underline = auth screens, filled = profile / general forms */
  variant?: 'underline' | 'filled'
  className?: string
}

/* Works both controlled (value/onChange) and uncontrolled (name + form
   elements), so pages can keep their existing form handling. */
export const TextField = React.forwardRef<HTMLInputElement, TextFieldProps>(
  ({ label, hideLabel, hint, error, variant = 'underline', className, id, type = 'text', ...rest }, ref) => {
    const autoId = useId()
    const inputId = id ?? `field-${autoId}`
    const hintId = hint ? `${inputId}-hint` : undefined
    const errorId = error ? `${inputId}-error` : undefined
    const isPassword = type === 'password'
    const [reveal, setReveal] = useState(false)

    return (
      <div
        className={cx(
          'ui-field',
          `ui-field--${variant}`,
          isPassword && 'ui-field--has-toggle',
          Boolean(error) && 'ui-field--invalid',
          className,
        )}
      >
        <label htmlFor={inputId} className={cx('ui-field__label', hideLabel && 'visually-hidden')}>
          {label}
        </label>

        <div className="ui-field__control">
          <input
            ref={ref}
            id={inputId}
            type={isPassword && reveal ? 'text' : type}
            className="ui-field__input"
            aria-invalid={error ? true : undefined}
            aria-describedby={cx(hintId, errorId) || undefined}
            {...rest}
          />
          {isPassword && (
            <IconButton
              className="ui-field__toggle"
              size="sm"
              icon="/assets/icon-visibility.svg"
              label={reveal ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
              aria-pressed={reveal}
              onClick={() => setReveal((v) => !v)}
              disabled={rest.disabled}
            />
          )}
        </div>

        {hint && <p id={hintId} className="ui-field__hint">{hint}</p>}
        {error && <p id={errorId} className="ui-field__error">{error}</p>}
      </div>
    )
  },
)
TextField.displayName = 'TextField'
