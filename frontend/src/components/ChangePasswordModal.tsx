import React, { useState } from 'react'
import { Modal } from './Modal'
import { Alert, Button, LockIcon, TextField } from './ui'
import { useAppState } from '../state/AppState'
import {
  CURRENT_PASSWORD_WRONG,
  PASSWORD_REQUIREMENTS_MESSAGE,
  meetsPasswordPolicy,
} from '../state/accountRules'

type FieldErrors = { current?: string; next?: string; confirm?: string; form?: string }

/* Change password from Profile. Firebase checks the current password before
   accepting the new one. Figma: Profile redesign, frame "P4 · Change password dialog". */
export const ChangePasswordModal: React.FC<{ onClose: () => void; onChanged: () => void }> = ({
  onClose,
  onChanged,
}) => {
  const { changePassword } = useAppState()
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [busy, setBusy] = useState(false)

  const edit = (setter: (v: string) => void, key: keyof FieldErrors) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setter(e.target.value)
    setErrors((prev) => ({ ...prev, [key]: undefined, form: undefined }))
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const found: FieldErrors = {}
    if (!current) found.current = 'Enter your current password.'
    if (!meetsPasswordPolicy(next)) found.next = PASSWORD_REQUIREMENTS_MESSAGE
    if (next !== confirm) found.confirm = 'Passwords do not match.'
    setErrors(found)
    if (Object.keys(found).length) return

    setBusy(true)
    try {
      await changePassword(current, next)
      onChanged()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not change your password.'
      setErrors(message === CURRENT_PASSWORD_WRONG ? { current: message } : { form: message })
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Change password"
      subtitle="Use at least 12 characters, with upper and lower case letters, a number and a symbol."
      icon={<LockIcon />}
      onClose={busy ? () => {} : onClose}
      actions={
        <>
          <Button variant="ghost" size="lg" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" form="change-password" size="lg" loading={busy}>
            {busy ? 'Updating…' : 'Update password'}
          </Button>
        </>
      }
    >
      <form id="change-password" className="password-form" onSubmit={submit} noValidate>
        <TextField
          variant="filled"
          type="password"
          label="Current password"
          autoComplete="current-password"
          value={current}
          onChange={edit(setCurrent, 'current')}
          error={errors.current}
          disabled={busy}
        />
        <TextField
          variant="filled"
          type="password"
          label="New password"
          autoComplete="new-password"
          value={next}
          onChange={edit(setNext, 'next')}
          error={errors.next}
          disabled={busy}
        />
        <TextField
          variant="filled"
          type="password"
          label="Confirm new password"
          autoComplete="new-password"
          value={confirm}
          onChange={edit(setConfirm, 'confirm')}
          error={errors.confirm}
          disabled={busy}
        />
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
      </form>
    </Modal>
  )
}
