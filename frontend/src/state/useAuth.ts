import { useState, useEffect, useCallback } from 'react'
import { authApi, type UserResponse } from '../api/client'
import {
  clearLastActivity,
  useInactivityTimeout,
  writeLastActivity,
} from './useInactivityTimeout'

const TOKEN_KEY = 'dfd.token'
const USER_KEY = 'dfd.user'
const DEFAULT_TIMEOUT_MINUTES = 30

function loadStored(): { token: string | null; user: UserResponse | null } {
  try {
    const token = sessionStorage.getItem(TOKEN_KEY)
    const userRaw = sessionStorage.getItem(USER_KEY)
    const user = userRaw ? JSON.parse(userRaw) : null
    return { token, user }
  } catch {
    return { token: null, user: null }
  }
}

function saveStored(token: string, user: UserResponse) {
  sessionStorage.setItem(TOKEN_KEY, token)
  sessionStorage.setItem(USER_KEY, JSON.stringify(user))
  writeLastActivity()
}

function clearStored() {
  sessionStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(USER_KEY)
  clearLastActivity()
}

export interface Profile {
  firstName: string
  lastName: string
  email: string
  phone: string
}

export interface AuthState {
  user: UserResponse | null
  token: string | null
  profile: Profile
  loading: boolean
  saving: boolean
  error: string
  sessionTimeoutMinutes: number
}

export interface AuthActions {
  signUp: (email: string, password: string, displayName?: string) => Promise<void>
  signIn: (email: string, password: string) => Promise<void>
  signOut: (opts?: { reason?: 'manual' | 'inactivity' }) => Promise<void>
  updateProfile: (next: Profile) => Promise<void>
  clearError: () => void
}

function emptyProfile(): Profile {
  return { firstName: '', lastName: '', email: '', phone: '' }
}

/* Build a Profile from the backend user record */
function buildProfile(user: UserResponse | null): Profile {
  if (!user) return emptyProfile()
  const names = (user.display_name || '').split(' ')
  return {
    firstName: user.first_name || names[0] || '',
    lastName: user.last_name || names.slice(1).join(' ') || '',
    email: user.email || '',
    phone: user.phone || '',
  }
}

function applyUser(user: UserResponse, fallback?: Profile | UserResponse | null): UserResponse {
  const fb = fallback && 'firstName' in fallback
    ? fallback
    : fallback
      ? buildProfile(fallback)
      : emptyProfile()
  return {
    ...user,
    email: user.email || fb.email || '',
    first_name: user.first_name || fb.firstName || '',
    last_name: user.last_name || fb.lastName || '',
    phone: user.phone || fb.phone || '',
  }
}

export function useAuth(): AuthState & AuthActions {
  const stored = loadStored()
  const [user, setUser] = useState<UserResponse | null>(stored.user)
  const [token, setToken] = useState<string | null>(stored.token)
  const [profile, setProfile] = useState<Profile>(buildProfile(stored.user))
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [sessionTimeoutMinutes, setSessionTimeoutMinutes] = useState(DEFAULT_TIMEOUT_MINUTES)

  useEffect(() => {
    let cancelled = false
    authApi.sessionConfig().then((res) => {
      if (cancelled || !res.data?.timeout_minutes) return
      setSessionTimeoutMinutes(res.data.timeout_minutes)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const storedUser = stored.user
    const storedToken = stored.token
    if (!storedUser?.user_id || !storedToken) return

    let cancelled = false
    authApi.me(storedUser.user_id).then((res) => {
      if (cancelled || !res.data) return
      const nextUser = applyUser(res.data, storedUser)
      saveStored(storedToken, nextUser)
      setToken(storedToken)
      setUser(nextUser)
      setProfile(buildProfile(nextUser))
    })
    return () => {
      cancelled = true
    }
  }, [])

  const clearError = useCallback(() => setError(''), [])

  const signUp = useCallback(async (email: string, password: string, displayName?: string) => {
    setLoading(true)
    setError('')
    const res = await authApi.signup(email, password, displayName)
    if (res.error) {
      setError(res.error)
      setLoading(false)
      throw new Error(res.error)
    }
    const data = res.data!
    const nextUser = applyUser(data.user)
    saveStored(data.access_token, nextUser)
    setToken(data.access_token)
    setUser(nextUser)
    setProfile(buildProfile(nextUser))
    setLoading(false)
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true)
    setError('')
    const res = await authApi.login(email, password)
    if (res.error) {
      setError(res.error)
      setLoading(false)
      throw new Error(res.error)
    }
    const data = res.data!
    const nextUser = applyUser(data.user)
    saveStored(data.access_token, nextUser)
    setToken(data.access_token)
    setUser(nextUser)
    setProfile(buildProfile(nextUser))
    setLoading(false)
  }, [])

  const signOut = useCallback(async (opts?: { reason?: 'manual' | 'inactivity' }) => {
    setLoading(true)
    try {
      if (user?.user_id) await authApi.logout(user.user_id)
    } finally {
      clearStored()
      if (opts?.reason === 'inactivity') {
        try {
          sessionStorage.setItem('dfd.sessionExpired', 'inactivity')
        } catch {
          /* ignore */
        }
      }
      setToken(null)
      setUser(null)
      setProfile(emptyProfile())
      setLoading(false)
    }
  }, [user])

  /* Update profile — saves to backend AND updates local state */
  const updateProfile = useCallback(async (next: Profile) => {
    if (!user?.user_id) {
      const msg = 'You must be logged in to update your profile.'
      setError(msg)
      throw new Error(msg)
    }
    setSaving(true)
    setError('')

    const res = await authApi.updateProfile(user.user_id, {
      first_name: next.firstName,
      last_name: next.lastName,
      email: next.email,
      phone: next.phone,
    })

    if (res.error) {
      setError(res.error)
      setSaving(false)
      throw new Error(res.error)
    }

    const updatedUser = applyUser(
      res.data || {
        ...user,
        display_name: `${next.firstName} ${next.lastName}`.trim(),
        email: next.email,
        first_name: next.firstName,
        last_name: next.lastName,
        phone: next.phone,
      },
      next,
    )
    saveStored(token || '', updatedUser)
    setUser(updatedUser)
    setProfile(buildProfile(updatedUser))
    setSaving(false)
  }, [user, token])

  // Inactivity auto-logout
  useInactivityTimeout(
    Boolean(user && token),
    () => {
      void signOut({ reason: 'inactivity' })
    },
    sessionTimeoutMinutes * 60 * 1000,
  )

  return {
    user,
    token,
    profile,
    loading,
    saving,
    error,
    sessionTimeoutMinutes,
    signUp,
    signIn,
    signOut,
    updateProfile,
    clearError,
  }
}
