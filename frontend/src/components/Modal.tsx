import React, { useEffect, useId, useRef } from 'react'
import { IconButton, CloseIcon } from './ui'
import { cx } from './ui/cx'

/* Compact centred dialog: an optional tinted icon circle over the title,
   message and a row of actions, with a close X in the corner.
   Escape and backdrop click close it; focus moves in on open, Tab is
   trapped inside, and focus returns to the trigger on close. */

export type ModalTone = 'info' | 'success' | 'danger'

interface ModalProps {
  title: string
  subtitle: string
  onClose: () => void
  /** Icon shown in a tinted circle above the title. */
  icon?: React.ReactNode
  /** Colours the icon circle. */
  tone?: ModalTone
  /** Footer buttons — rendered in an equal-width action row that stacks on narrow screens. */
  actions?: React.ReactNode
  children?: React.ReactNode
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export const Modal: React.FC<ModalProps> = ({
  title,
  subtitle,
  onClose,
  icon,
  tone = 'info',
  actions,
  children,
}) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const subId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    dialogRef.current?.focus()

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current()
        return
      }
      if (e.key !== 'Tab' || !dialogRef.current) return
      const items = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE))
      if (items.length === 0) return
      const first = items[0]
      const last = items[items.length - 1]
      const active = document.activeElement
      if (e.shiftKey && (active === first || active === dialogRef.current)) {
        e.preventDefault()
        last.focus()
      } else if (!e.shiftKey && active === last) {
        e.preventDefault()
        first.focus()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
      previous?.focus?.()
    }
  }, [])

  return (
    <div className="ui-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className={cx('ui-modal', `ui-modal--${tone}`)}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subId}
        tabIndex={-1}
      >
        <IconButton
          className="ui-modal__close"
          size="sm"
          label="Close"
          icon={<CloseIcon />}
          onClick={onClose}
        />
        {icon && <div className="ui-modal__icon">{icon}</div>}
        <h2 id={titleId} className="ui-modal__title">{title}</h2>
        <p id={subId} className="ui-modal__sub">{subtitle}</p>
        {children}
        {actions && <div className="ui-modal__actions">{actions}</div>}
      </div>
    </div>
  )
}
