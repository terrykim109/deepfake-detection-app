import React, { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { contentApi } from '../../api/client'
import { LANDING_DEFAULT } from '../../content/defaults'
import type { LandingContent } from '../../content/types'
import { FullPageSpinner } from '../../components/ui'
import { LandingView } from '../LandingView'

/** Admin-only draft preview using the real Landing layout. */
export const LandingPreview: React.FC = () => {
  const [content, setContent] = useState<LandingContent | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    contentApi.adminLanding().then((res) => {
      if (cancelled) return
      if (res.error || !res.data) {
        setError(res.error || 'Could not load draft')
        setContent(LANDING_DEFAULT)
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
        <Link to="/dashboard/content/landing" className="ui-btn ui-btn--ghost ui-btn--sm">
          Back to editor
        </Link>
        {error ? <span>{error}</span> : null}
      </div>
      <LandingView
        content={content}
        previewBanner="Draft preview — not visible to the public"
      />
    </>
  )
}
