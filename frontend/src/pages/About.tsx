import React, { useEffect, useState } from 'react'
import { contentApi } from '../api/client'
import { ABOUT_DEFAULT } from '../content/defaults'
import type { AboutContent } from '../content/types'
import { AboutView } from './AboutView'
import { FullPageSpinner } from '../components/ui'

/* Public About page — published CMS content with local defaults as fallback. */
export const About: React.FC = () => {
  const [content, setContent] = useState<AboutContent | null>(null)

  useEffect(() => {
    let cancelled = false
    contentApi.publishedAbout().then((res) => {
      if (cancelled) return
      setContent(res.data?.content ?? ABOUT_DEFAULT)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!content) return <FullPageSpinner />
  return <AboutView content={content} />
}
