import React, { useEffect, useId, useRef, useState } from 'react'
import { Button, GearIcon, IconButton, Switch } from './ui'
import { usePreferences } from '../state/usePreferences'

/* Header gear button + non-modal popover for display settings.
   Changes apply live, so there is no Save. Escape returns focus to the
   gear; clicking outside or tabbing out of the panel just closes it. */

export const SettingsMenu: React.FC = () => {
  const [open, setOpen] = useState(false)
  const prefs = usePreferences()
  const rootRef = useRef<HTMLDivElement>(null)
  const switchRef = useRef<HTMLButtonElement>(null)
  const panelId = useId()
  const triggerId = useId()
  const titleId = useId()
  const darkLabelId = useId()
  const sizeLabelId = useId()

  useEffect(() => {
    if (!open) return
    switchRef.current?.focus()

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      setOpen(false)
      document.getElementById(triggerId)?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, triggerId])

  const onBlur = (e: React.FocusEvent) => {
    // relatedTarget is null when focus leaves the window; keep it open then.
    if (e.relatedTarget && !rootRef.current?.contains(e.relatedTarget as Node)) setOpen(false)
  }

  // aria-disabled instead of disabled: disabling the focused button would drop focus to <body>.
  const step = (enabled: boolean, action: () => void) => ({
    'aria-disabled': !enabled || undefined,
    onClick: () => enabled && action(),
  })

  return (
    <div className="ui-settings" ref={rootRef} onBlur={onBlur}>
      <IconButton
        id={triggerId}
        className="app-settings"
        icon={<GearIcon />}
        label="Display settings"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((o) => !o)}
      />

      {open && (
        <div id={panelId} className="ui-settings__panel" role="dialog" aria-labelledby={titleId}>
          <h2 id={titleId} className="ui-settings__title">Display settings</h2>

          <div className="ui-settings__row">
            <span id={darkLabelId}>Dark mode</span>
            <Switch
              ref={switchRef}
              checked={prefs.theme === 'dark'}
              onChange={prefs.toggleTheme}
              aria-labelledby={darkLabelId}
            />
          </div>

          <div className="ui-settings__row ui-settings__group" role="group" aria-labelledby={sizeLabelId}>
            <span id={sizeLabelId}>Text size</span>
            <div className="ui-settings__stepper">
              <button
                type="button"
                className="ui-settings__step"
                aria-label="Decrease text size"
                {...step(prefs.canDecrease, prefs.decreaseFont)}
              >
                A−
              </button>
              <output className="ui-settings__readout" aria-live="polite">
                {prefs.fontScale}%
              </output>
              <button
                type="button"
                className="ui-settings__step"
                aria-label="Increase text size"
                {...step(prefs.canIncrease, prefs.increaseFont)}
              >
                A+
              </button>
            </div>
            <Button
              variant="link"
              className="ui-settings__reset"
              {...step(prefs.canDecrease, prefs.resetFont)}
            >
              Reset to default
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
