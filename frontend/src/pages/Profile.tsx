import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { ChangePasswordModal } from '../components/ChangePasswordModal'
import { useAppState } from '../state/AppState'
import { USERNAME_RULE, USERNAME_TAKEN, isValidUsername } from '../state/accountRules'
import { Alert, Button, Card, TextField, Toast } from '../components/ui'

const TOAST_MS = 3000

/* Profile page: username and email synced to the backend, plus a password
   change. Figma: section "Profile redesign (Nat)". */
export const Profile: React.FC = () => {
  const navigate = useNavigate()
  const { profile, updateProfile, signOut, loading, saving, error, clearError } = useAppState()
  const [draft, setDraft] = useState(profile)
  const [dirty, setDirty] = useState(false)
  const [savedNote, setSavedNote] = useState(false)
  const [localError, setLocalError] = useState('')
  const [usernameError, setUsernameError] = useState('')
  const [toast, setToast] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const toastTimer = useRef<number>()
  const busy = loading || saving

  useEffect(() => {
    if (!dirty) setDraft(profile)
  }, [profile, dirty])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const showToast = (message: string) => {
    setToast(message)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(''), TOAST_MS)
  }

  /* Compare values, not keystrokes: typing a field back to its saved value
     leaves nothing to save. */
  const changed = (Object.keys(draft) as (keyof typeof draft)[]).some((k) => draft[k] !== profile[k])

  const set = (key: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setDraft((d) => ({ ...d, [key]: value }))
    setDirty(true)
    setSavedNote(false)
    setLocalError('')
    setUsernameError('')
    clearError()
  }

  const save = async () => {
    setLocalError('')
    const username = draft.username.trim()
    if (!isValidUsername(username)) {
      setUsernameError(USERNAME_RULE)
      return
    }
    try {
      await updateProfile({ ...draft, username })
      setDirty(false)
      setSavedNote(true)
      showToast('Changes saved')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not save profile.'
      // Keep the taken-name message on the field it's about
      if (message === USERNAME_TAKEN) {
        setUsernameError(message)
        clearError()
      } else {
        setLocalError(message)
      }
    }
  }

  const logOut = async () => {
    await signOut()
    navigate('/login')
  }

  const displayError = localError || error
  const initial = profile.username.charAt(0).toUpperCase()
  const status = changed ? 'Unsaved changes' : savedNote ? 'Saved just now' : 'No unsaved changes'

  return (
    <AppShell>
      {toast && <Toast message={toast} />}

      <div className="profile">
        <div className="profile-head">
          <div className="profile-avatar">
            <span aria-hidden="true">{initial}</span>
          </div>
          <div className="profile-identity">
            <h1 className="profile-name">{profile.username || 'Your profile'}</h1>
            {profile.email && <p className="profile-email">{profile.email}</p>}
          </div>
          <Button variant="ghost" size="lg" className="profile-logout" onClick={logOut} disabled={busy}>
            Log out
          </Button>
        </div>

        <Card className="profile-card" padding="md">
          <div className="profile-card__head">
            <h2>Personal information</h2>
            <p>Your username and email.</p>
          </div>

          <div className="profile-fields">
            <TextField
              variant="filled"
              id="username"
              label="Username"
              value={draft.username}
              onChange={set('username')}
              error={usernameError}
              disabled={busy}
              autoComplete="nickname"
              autoCapitalize="none"
              spellCheck={false}
            />
            <TextField variant="filled" id="email" type="email" label="Email" value={draft.email} onChange={set('email')} disabled={busy} autoComplete="email" />
          </div>

          {displayError && <Alert tone="error">{displayError}</Alert>}

          <div className="profile-card__footer">
            <p className={savedNote && !changed ? 'profile-status profile-status--saved' : 'profile-status'}>{status}</p>
            <Button size="lg" onClick={save} disabled={busy || !changed} loading={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </Card>

        <Card className="profile-card profile-password" padding="md">
          <div className="profile-card__head">
            <h2>Password</h2>
            <p>Change the password you use to log in.</p>
          </div>
          <Button variant="ghost" size="lg" onClick={() => setChangingPassword(true)} disabled={busy}>
            Change password
          </Button>
        </Card>
      </div>

      {changingPassword && (
        <ChangePasswordModal
          onClose={() => setChangingPassword(false)}
          onChanged={() => {
            setChangingPassword(false)
            showToast('Password updated')
          }}
        />
      )}
    </AppShell>
  )
}
