import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { contentApi } from '../../api/client'
import { ABOUT_DEFAULT } from '../../content/defaults'
import type { AboutContent } from '../../content/types'
import { FullPageSpinner } from '../../components/ui'
import { AboutView } from '../AboutView'

/** Admin-only draft preview using the real About layout. */
export const AboutPreview: React.FC = () => {
  const [content, setContent] = useState<AboutContent | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    contentApi.adminAbout().then((res) => {
      if (cancelled) return
      if (res.error || !res.data) {
        setError(res.error || 'Could not load draft')
        setContent(ABOUT_DEFAULT)
        return
      }
      setContent(res.data.draft)
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!content) return <FullPageSpinner />

  return (
    <>
      <div className="content-preview-toolbar">
        <Link to="/dashboard/content/about" className="ui-btn ui-btn--ghost ui-btn--sm">
          Back to editor
        </Link>
        {error ? <span>{error}</span> : null}
      </div>
      <AboutView content={content} previewBanner="Draft preview — not visible to the public" />
    </>
  )
}
