import { useEffect, useState } from 'react'

/* Breakpoints mirror styles/layout.css — keep them in sync. */
export const MOBILE_QUERY = '(max-width: 767px)'
export const TABLET_QUERY = '(min-width: 768px) and (max-width: 1279px)'

const matches = (query: string): boolean =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(query).matches
    : false

/** Tracks a CSS media query and re-renders when it starts/stops matching. */
export function useMediaQuery(query: string): boolean {
  const [isMatch, setIsMatch] = useState(() => matches(query))

  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mql = window.matchMedia(query)
    const onChange = () => setIsMatch(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [query])

  return isMatch
}

/** True on phone-sized viewports. Use for behaviour/copy differences;
    use CSS media queries for pure layout changes. */
export const useIsMobile = (): boolean => useMediaQuery(MOBILE_QUERY)
