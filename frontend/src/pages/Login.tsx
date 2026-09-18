// Login.tsx

import React, { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAppState } from '../state/AppState'
import { consumeSessionExpired } from '../state/useInactivityTimeout'

export const Login: React.FC = () => {
  const navigate = useNavigate()
  const { signIn, error, clearError, loading, sessionTimeoutMinutes } = useAppState()
  const [showPassword, setShowPassword] = useState(false)
  const [localError, setLocalError] = useState('')
  const [sessionNote, setSessionNote] = useState('')

  useEffect(() => {
    const reason = consumeSessionExpired()
    if (reason === 'inactivity') {
      setSessionNote(
        `Your session ended after ${sessionTimeoutMinutes} minutes of inactivity. Please log in again.`,
      )
    }
  }, [sessionTimeoutMinutes])

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLocalError('')
    setSessionNote('')
    clearError()

    const form = e.target as HTMLFormElement
    const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim()
    const password = (form.elements.namedItem('password') as HTMLInputElement).value.trim()

    if (!email || !password) {
      setLocalError('Enter an email address and password to continue.')
      return
    }

    try {
      await signIn(email, password)
      navigate('/profile')
    } catch {
      // error surfaced via useAuth
    }
  }

  const displayError = localError || error

  return (
    <div className="stage auth-page">
      <aside className="auth-aside">
        <img src="./logo.png" alt="Deepfake Detection" />
      </aside>

      <main className="auth-main">
        <h1 className="auth-title">Log in</h1>

        {sessionNote && <p className="auth-error">{sessionNote}</p>}

        <form onSubmit={submit}>
          <div className="field">
            <input
              name="email"
              type="email"
              placeholder="Email Address"
              autoComplete="email"
              disabled={loading}
            />
          </div>

          <div className="field">
            <input
              name="password"
              type={showPassword ? 'text' : 'password'}
              placeholder="Password"
              autoComplete="current-password"
              disabled={loading}
            />
            <button
              type="button"
              className="field-toggle"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? 'Hide password' : 'Show password'}
            >
              <img src="/assets/icon-visibility.svg" alt="" />
            </button>
          </div>

          {displayError && <p className="auth-error">{displayError}</p>}

          <button type="submit" className="btn auth-submit" disabled={loading}>
            {loading ? 'Logging in...' : 'Log in'}
          </button>
        </form>

       <div className="auth-links">
          <p>
            Don't have an account? <Link to="/create-account">Create an account</Link>
          </p>
        </div>
      </main>
    </div>
  )
}
