import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { useAppState } from '../state/AppState'
import { ALLOWED_MIME_TYPES, MAX_UPLOAD_BYTES } from '../upload/validateUpload'
import { toAvatarBlob } from '../upload/avatarImage'
import { Alert, Button, CameraIcon, Card, TextField, Toast } from '../components/ui'

// Same cap as image analysis; the photo is shrunk before upload, so this only
// guards against decoding something huge in the browser.
const AVATAR_HELP = 'That file can’t be used. Choose a JPG, PNG or WEBP under 10 MB.'
const TOAST_MS = 3000

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`

/* Profile page — editable fields synced to backend, plus a profile photo
   stored in Firebase Storage. Figma: section "Profile redesign (Nat)". */
export const Profile: React.FC = () => {
  const navigate = useNavigate()
  const {
    profile, updateProfile, signOut, loading, saving, error, clearError,
    photoURL, updateAvatar, removeAvatar,
  } = useAppState()
  const [draft, setDraft] = useState(profile)
  const [dirty, setDirty] = useState(false)
  const [savedNote, setSavedNote] = useState(false)
  const [localError, setLocalError] = useState('')
  const [toast, setToast] = useState('')
  const toastTimer = useRef<number>()
  const fileInput = useRef<HTMLInputElement>(null)
  const [pendingPhoto, setPendingPhoto] = useState<{ file: File; avatar: Blob; preview: string } | null>(null)
  const [photoError, setPhotoError] = useState('')
  const [photoBusy, setPhotoBusy] = useState(false)
  const busy = loading || saving

  useEffect(() => {
    if (!dirty) setDraft(profile)
  }, [profile, dirty])

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  useEffect(() => () => {
    if (pendingPhoto) URL.revokeObjectURL(pendingPhoto.preview)
  }, [pendingPhoto])

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
    clearError()
  }

  const save = async () => {
    setLocalError('')
    try {
      await updateProfile(draft)
      setDirty(false)
      setSavedNote(true)
      showToast('Changes saved')
    } catch (err) {
      setLocalError(err instanceof Error ? err.message : 'Could not save profile.')
    }
  }

  const pickPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    // Reset so picking the same file again still fires onChange
    e.target.value = ''
    if (!file) return
    setPhotoError('')
    setPendingPhoto(null)
    if (!(ALLOWED_MIME_TYPES as readonly string[]).includes(file.type) || file.size > MAX_UPLOAD_BYTES) {
      setPhotoError(AVATAR_HELP)
      return
    }
    try {
      // Preview the shrunk copy so what you see is exactly what gets uploaded
      const avatar = await toAvatarBlob(file)
      setPendingPhoto({ file, avatar, preview: URL.createObjectURL(avatar) })
    } catch {
      // Right extension, but the browser can't decode it (corrupt or mislabelled)
      setPhotoError(AVATAR_HELP)
    }
  }

  const savePhoto = async () => {
    if (!pendingPhoto) return
    setPhotoBusy(true)
    setPhotoError('')
    try {
      await updateAvatar(pendingPhoto.avatar)
      setPendingPhoto(null)
      showToast('Photo updated')
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not update your photo.')
    } finally {
      setPhotoBusy(false)
    }
  }

  const deletePhoto = async () => {
    setPhotoBusy(true)
    setPhotoError('')
    try {
      await removeAvatar()
      showToast('Photo removed')
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : 'Could not remove your photo.')
    } finally {
      setPhotoBusy(false)
    }
  }

  const logOut = async () => {
    await signOut()
    navigate('/login')
  }

  const displayError = localError || error

  const fullName = `${draft.firstName || profile.firstName} ${draft.lastName || profile.lastName}`.trim()
  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')

  const shownPhoto = pendingPhoto?.preview || photoURL
  const status = changed ? 'Unsaved changes' : savedNote ? 'Saved just now' : 'No unsaved changes'

  return (
    <AppShell>
      {toast && <Toast message={toast} />}

      <div className="profile">
        <div className="profile-head">
          <button
            type="button"
            className="profile-avatar"
            onClick={() => fileInput.current?.click()}
            disabled={photoBusy}
            aria-label="Change profile photo"
          >
            {shownPhoto ? (
              <img src={shownPhoto} alt="" />
            ) : (
              <span aria-hidden="true">{initials}</span>
            )}
            <span className="profile-avatar__badge" aria-hidden="true">
              <CameraIcon />
            </span>
          </button>
          <input
            ref={fileInput}
            type="file"
            accept={ALLOWED_MIME_TYPES.join(',')}
            onChange={pickPhoto}
            hidden
          />

          <div className="profile-identity">
            <h1 className="profile-name">{fullName || 'Your profile'}</h1>
            {profile.email && <p className="profile-email">{profile.email}</p>}
            <div className="profile-photo-links">
              <Button variant="link" onClick={() => fileInput.current?.click()} disabled={photoBusy}>
                Change photo
              </Button>
              {photoURL && !pendingPhoto && (
                <Button variant="link" className="profile-remove" onClick={deletePhoto} disabled={photoBusy}>
                  Remove photo
                </Button>
              )}
            </div>
          </div>
        </div>

        {pendingPhoto && (
          <div className="profile-pending">
            <div className="profile-pending__text">
              <strong>New photo: {pendingPhoto.file.name} · {formatSize(pendingPhoto.file.size)}</strong>
              <span>Preview only. It isn&rsquo;t saved until you press Save photo.</span>
            </div>
            <Button
              variant="ghost"
              onClick={() => {
                setPendingPhoto(null)
                setPhotoError('')
              }}
              disabled={photoBusy}
            >
              Cancel
            </Button>
            <Button onClick={savePhoto} loading={photoBusy}>
              {photoBusy ? 'Uploading…' : 'Save photo'}
            </Button>
          </div>
        )}

        {photoError && <Alert tone="error">{photoError}</Alert>}

        <Card className="profile-card" padding="md">
          <div className="profile-card__head">
            <h2>Personal information</h2>
            <p>Your name and contact details.</p>
          </div>

          <div className="profile-fields">
            <TextField variant="filled" id="firstName" label="First name" value={draft.firstName} onChange={set('firstName')} disabled={busy} autoComplete="given-name" />
            <TextField variant="filled" id="lastName" label="Last name" value={draft.lastName} onChange={set('lastName')} disabled={busy} autoComplete="family-name" />
            <TextField variant="filled" id="email" type="email" label="Email" value={draft.email} onChange={set('email')} disabled={busy} autoComplete="email" />
            <TextField variant="filled" id="phone" type="tel" label="Phone number" value={draft.phone} onChange={set('phone')} disabled={busy} autoComplete="tel" />
          </div>

          {displayError && <Alert tone="error">{displayError}</Alert>}

          <div className="profile-card__footer">
            <p className={savedNote && !changed ? 'profile-status profile-status--saved' : 'profile-status'}>{status}</p>
            <Button size="lg" onClick={save} disabled={busy || !changed} loading={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </Button>
          </div>
        </Card>

        <div className="profile-footer">
          <Button variant="ghost" size="lg" onClick={logOut} disabled={busy}>
            Log out
          </Button>
        </div>
      </div>
    </AppShell>
  )
}
