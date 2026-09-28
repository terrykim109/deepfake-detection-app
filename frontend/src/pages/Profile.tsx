import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { useAppState } from '../state/AppState'
import { Alert, Button, Card, TextField } from '../components/ui'

/* Profile page — editable fields synced to backend.
   After login, user lands here first. */
export const Profile: React.FC = () => {
  const navigate = useNavigate()
  const { profile, updateProfile, signOut, loading, saving, error, clearError } = useAppState()
  const [draft, setDraft] = useState(profile)
  const [dirty, setDirty] = useState(false)
  const [savedNote, setSavedNote] = useState(false)
  const [localError, setLocalError] = useState('')
  const busy = loading || saving

  useEffect(() => {
    if (!dirty) setDraft(profile)
  }, [profile, dirty])

  const set = (key: keyof typeof draft) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setDraft((d) => ({ ...d, [key]: value }))
    setDirty(true)
    setSavedNote(false)
    setLocalError('')
    clearError()
  }

  const save = async () => {
    setLocalError('')
    try {
      await updateProfile(draft)
      setDirty(false)
      setSavedNote(true)
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not save profile.')
    }
  }

  const logOut = async () => {
    await signOut()
    navigate('/login')
  }

  const displayError = localError || error

  const fullName = `${draft.firstName || profile.firstName} ${draft.lastName || profile.lastName}`.trim()

  return (
    <AppShell>
      <div className="profile-head">
        <div className="profile-avatar" aria-hidden="true" />
        <h1 className="profile-name">{fullName || 'Your profile'}</h1>
      </div>

      <Card className="profile-card" padding="lg">
        <TextField variant="filled" id="firstName" label="First Name" value={draft.firstName} onChange={set('firstName')} disabled={busy} autoComplete="given-name" />
        <TextField variant="filled" id="lastName" label="Last Name" value={draft.lastName} onChange={set('lastName')} disabled={busy} autoComplete="family-name" />
        <TextField variant="filled" id="email" type="email" label="Email" value={draft.email} onChange={set('email')} disabled={busy} autoComplete="email" />
        <TextField variant="filled" id="phone" type="tel" label="Phone Number" value={draft.phone} onChange={set('phone')} disabled={busy} autoComplete="tel" />
      </Card>

      <div className="profile-footer">
        <div className="profile-status">
          {savedNote && !displayError && <Alert tone="success">Profile updated</Alert>}
          {displayError && <Alert tone="error">{displayError}</Alert>}
        </div>
        <div className="profile-actions">
          <Button variant="ghost" size="lg" onClick={save} disabled={busy} loading={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </Button>
          <Button size="lg" onClick={logOut} disabled={busy}>
            Log Out
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
