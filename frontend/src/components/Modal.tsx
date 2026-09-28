import React, { useEffect, useId, useRef } from 'react'
import { IconButton, CloseIcon } from './ui'

/* Dialog from the Figma "Saved Modal" / "DeleteModal" frames: a
   primary-coloured title bar with a close X over the message body.
   Escape and backdrop click close it; focus moves in on open and back
   to the trigger on close. */

interface ModalProps {
  title: string
  subtitle: string
  onClose: () => void
  /** Footer buttons — rendered in a centred, wrapping action row. */
  actions?: React.ReactNode
  children?: React.ReactNode
}

export const Modal: React.FC<ModalProps> = ({ title, subtitle, onClose, actions, children }) => {
  const dialogRef = useRef<HTMLDivElement>(null)
  const titleId = useId()
  const subId = useId()
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    dialogRef.current?.focus()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      previous?.focus?.()
    }
  }, [])

  return (
    <div className="ui-modal-backdrop" onClick={onClose} role="presentation">
      <div
        ref={dialogRef}
        className="ui-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={subId}
        tabIndex={-1}
      >
        <div className="ui-modal__bar">
          <IconButton
            className="ui-modal__close"
            size="sm"
            label="Close"
            icon={<CloseIcon />}
            onClick={onClose}
          />
        </div>
        <div className="ui-modal__body">
          <h2 id={titleId} className="ui-modal__title">{title}</h2>
          <p id={subId} className="ui-modal__sub">{subtitle}</p>
        </div>
        {actions && <div className="ui-modal__actions">{actions}</div>}
        {children}
      </div>
    </div>
  )
}
