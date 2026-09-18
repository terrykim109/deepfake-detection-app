import { useEffect, useRef } from 'react'

const LAST_ACTIVITY_KEY = 'dfd.lastActivity'
const SESSION_EXPIRED_KEY = 'dfd.sessionExpired'
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'click',
]

export function markSessionExpired(reason = 'inactivity') {
  try {
    sessionStorage.setItem(SESSION_EXPIRED_KEY, reason)
  } catch {
    /* ignore */
  }
}

export function consumeSessionExpired(): string | null {
  try {
    const reason = sessionStorage.getItem(SESSION_EXPIRED_KEY)
    if (reason) sessionStorage.removeItem(SESSION_EXPIRED_KEY)
    return reason
  } catch {
    return null
  }
}

export function readLastActivity(): number {
  try {
    const raw = sessionStorage.getItem(LAST_ACTIVITY_KEY)
    const n = raw ? Number(raw) : NaN
    return Number.isFinite(n) ? n : Date.now()
  } catch {
    return Date.now()
  }
}

export function writeLastActivity(ts = Date.now()) {
  try {
    sessionStorage.setItem(LAST_ACTIVITY_KEY, String(ts))
  } catch {
    /* ignore */
  }
}

export function clearLastActivity() {
  try {
    sessionStorage.removeItem(LAST_ACTIVITY_KEY)
  } catch {
    /* ignore */
  }
}

/**
 * While `active`, logs the user out after `timeoutMs` of no user interaction.
 * Activity also refreshes a persisted timestamp so a closed/idle tab still times out.
 */
export function useInactivityTimeout(
  active: boolean,
  onTimeout: () => void,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
) {
  const onTimeoutRef = useRef(onTimeout)
  onTimeoutRef.current = onTimeout

  useEffect(() => {
    if (!active || timeoutMs <= 0) return

    let timer: number | undefined
    let lastWrite = 0

    const expire = () => {
      markSessionExpired('inactivity')
      clearLastActivity()
      onTimeoutRef.current()
    }

    const schedule = () => {
      if (timer) window.clearTimeout(timer)
      const last = readLastActivity()
      const remaining = timeoutMs - (Date.now() - last)
      if (remaining <= 0) {
        expire()
        return
      }
      timer = window.setTimeout(expire, remaining)
    }

    const noteActivity = () => {
      const now = Date.now()
      // Throttle sessionStorage writes during high-frequency events like mousemove
      if (now - lastWrite > 1000) {
        writeLastActivity(now)
        lastWrite = now
      }
      schedule()
    }

    writeLastActivity(readLastActivity())
    schedule()

    const onVisible = () => {
      if (document.visibilityState === 'visible') schedule()
    }

    for (const evt of ACTIVITY_EVENTS) {
      window.addEventListener(evt, noteActivity, { passive: true })
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      if (timer) window.clearTimeout(timer)
      for (const evt of ACTIVITY_EVENTS) {
        window.removeEventListener(evt, noteActivity)
      }
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [active, timeoutMs])
}
