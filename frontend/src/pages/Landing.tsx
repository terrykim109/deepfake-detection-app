import React, { useEffect, useState } from 'react'
import { contentApi } from '../api/client'
import { LANDING_DEFAULT } from '../content/defaults'
import type { LandingContent } from '../content/types'
import { LandingView } from './LandingView'
import { FullPageSpinner } from '../components/ui'

/* First screen for logged-out visitors (logged-in users are sent to
   /upload by the route). Content comes from published CMS or defaults. */
export const Landing: React.FC = () => {
  const [content, setContent] = useState<LandingContent | null>(null)

  useEffect(() => {
    let cancelled = false
    contentApi.publishedLanding().then((res) => {
      if (cancelled) return
      setContent(res.data?.content ?? LANDING_DEFAULT)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!content) return <FullPageSpinner />
  return <LandingView content={content} />
}
