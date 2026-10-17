import { useCallback, useEffect, useState } from 'react'

/* Display preferences (theme + text size). The values live on <html>:
   index.html applies the stored ones before first paint, so this hook
   reads its initial state back from the DOM instead of storage. */

export type Theme = 'light' | 'dark'

/** Percent of the browser default; the first step is both the default and the minimum. */
export const FONT_STEPS = [100, 112.5, 125, 137.5, 150] as const
export type FontScale = (typeof FONT_STEPS)[number]

const THEME_KEY = 'dfd.theme'
const FONT_KEY = 'dfd.fontScale'

// Storage can throw in private mode or when site data is blocked.
const read = (key: string): string | null => {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
const write = (key: string, value: string | null) => {
  try {
    if (value === null) localStorage.removeItem(key)
    else localStorage.setItem(key, value)
  } catch {
    /* preference just won't persist */
  }
}

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

const initialTheme = (): Theme =>
  document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'

const initialFont = (): FontScale => {
  const n = Number(read(FONT_KEY))
  return (FONT_STEPS as readonly number[]).includes(n) ? (n as FontScale) : FONT_STEPS[0]
}

export function usePreferences() {
  const [theme, setTheme] = useState<Theme>(initialTheme)
  const [fontScale, setFontScale] = useState<FontScale>(initialFont)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    const root = document.documentElement
    if (fontScale === FONT_STEPS[0]) root.style.removeProperty('font-size')
    else root.style.fontSize = `${fontScale}%`
    write(FONT_KEY, fontScale === FONT_STEPS[0] ? null : String(fontScale))
  }, [fontScale])

  // Follow the OS theme until the user picks one explicitly.
  useEffect(() => {
    const mq = darkQuery()
    const onChange = (e: MediaQueryListEvent) => {
      if (read(THEME_KEY) === null) setTheme(e.matches ? 'dark' : 'light')
    }
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((t) => {
      const next: Theme = t === 'dark' ? 'light' : 'dark'
      write(THEME_KEY, next)
      return next
    })
  }, [])

  const index = FONT_STEPS.indexOf(fontScale)
  const last = FONT_STEPS.length - 1
  const stepFont = (delta: number) =>
    setFontScale((s) => FONT_STEPS[Math.min(Math.max(FONT_STEPS.indexOf(s) + delta, 0), last)])

  return {
    theme,
    toggleTheme,
    fontScale,
    canIncrease: index < last,
    canDecrease: index > 0,
    increaseFont: () => stepFont(1),
    decreaseFont: () => stepFont(-1),
    resetFont: () => setFontScale(FONT_STEPS[0]),
  }
}
