import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { contentApi } from '../../api/client'
import { LANDING_DEFAULT } from '../../content/defaults'
import type { LandingContent, LandingStepContent } from '../../content/types'
import { Alert, Button, PageHeader, Spinner } from '../../components/ui'
import {
  ContentEditorActions,
  ContentStatusBar,
  Field,
  ToggleField,
} from './ContentEditorShared'

export const LandingContentEditor: React.FC = () => {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<LandingContent | null>(null)
  const [publishedAt, setPublishedAt] = useState<string | null>(null)
  const [draftUpdatedAt, setDraftUpdatedAt] = useState<string | null>(null)
  const [status, setStatus] = useState('unpublished')
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  useEffect(() => {
    let cancelled = false
    contentApi.adminLanding().then((res) => {
      if (cancelled) return
      if (res.error || !res.data) {
        setDraft(LANDING_DEFAULT)
        setError(res.error || 'Could not load draft')
        setLoading(false)
        return
      }
      setDraft(res.data.draft)
      setPublishedAt(res.data.publishedAt)
      setDraftUpdatedAt(res.data.draftUpdatedAt)
      setStatus(res.data.status)
      setHasUnpublishedChanges(res.data.hasUnpublishedChanges)
      setLoading(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const update = <K extends keyof LandingContent>(key: K, value: LandingContent[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
    setNotice('')
  }

  const updateStep = (index: number, patch: Partial<LandingStepContent>) => {
    setDraft((current) => {
      if (!current) return current
      const explainerSteps = current.explainerSteps.map((step, i) =>
        i === index ? { ...step, ...patch } : step,
      )
      return { ...current, explainerSteps }
    })
    setNotice('')
  }

  const applyMeta = (data: NonNullable<Awaited<ReturnType<typeof contentApi.adminLanding>>['data']>) => {
    setDraft(data.draft)
    setPublishedAt(data.publishedAt)
    setDraftUpdatedAt(data.draftUpdatedAt)
    setStatus(data.status)
    setHasUnpublishedChanges(data.hasUnpublishedChanges)
  }

  const saveDraft = async () => {
    if (!draft) return
    setSaving(true)
    setError('')
    setNotice('')
    const res = await contentApi.saveLandingDraft(draft)
    setSaving(false)
    if (res.error || !res.data) {
      setError(res.error || 'Save failed')
      return
    }
    applyMeta(res.data)
    setNotice('Draft saved. The public Landing page was not changed.')
  }

  const publish = async () => {
    if (!draft) return
    setPublishing(true)
    setError('')
    setNotice('')
    const saved = await contentApi.saveLandingDraft(draft)
    if (saved.error || !saved.data) {
      setPublishing(false)
      setError(saved.error || 'Could not save draft before publish')
      return
    }
    const res = await contentApi.publishLanding()
    setPublishing(false)
    if (res.error || !res.data) {
      setError(res.error || 'Publish failed')
      return
    }
    applyMeta(res.data)
    setNotice('Published. The public Landing page now shows this content.')
  }

  if (loading || !draft) {
    return (
      <div className="admin-inline-loading">
        <Spinner /> Loading Landing editor…
      </div>
    )
  }

  return (
    <div className="content-editor">
      <PageHeader
        title="Landing Page"
        subtitle="Edit copy and section visibility. Save a draft before previewing or publishing."
      />
      <ContentStatusBar
        status={status}
        publishedAt={publishedAt}
        draftUpdatedAt={draftUpdatedAt}
        hasUnpublishedChanges={hasUnpublishedChanges}
      />
      <ContentEditorActions
        saving={saving}
        publishing={publishing}
        onSaveDraft={saveDraft}
        onPreview={() => navigate('/dashboard/content/landing/preview')}
        onPublish={publish}
        error={error}
        notice={notice}
      />

      <section className="content-editor__section" aria-labelledby="landing-hero-editor">
        <div className="content-editor__section-head">
          <h2 id="landing-hero-editor">Hero</h2>
          <ToggleField
            label="Show hero section"
            checked={draft.heroVisible}
            onChange={(checked) => update('heroVisible', checked)}
          />
        </div>
        <div className="content-editor__grid">
          <Field label="Heading" value={draft.heroTitle} onChange={(v) => update('heroTitle', v)} />
          <Field
            label="Description"
            value={draft.heroTagline}
            multiline
            onChange={(v) => update('heroTagline', v)}
          />
          <Field
            label="Button label"
            value={draft.heroCtaLabel}
            onChange={(v) => update('heroCtaLabel', v)}
          />
          <Field
            label="Button destination"
            value={draft.heroCtaHref}
            hint="Relative path (e.g. /create-account) or https URL"
            onChange={(v) => update('heroCtaHref', v)}
          />
          <Field
            label="Hero image URL or path"
            value={draft.heroImageSrc}
            hint="Store a path or URL only — not raw image bytes. Example: /assets/landing-hero.jpg"
            onChange={(v) => update('heroImageSrc', v)}
          />
        </div>
      </section>

      <section className="content-editor__section" aria-labelledby="landing-explainer-editor">
        <div className="content-editor__section-head">
          <h2 id="landing-explainer-editor">How it works</h2>
          <ToggleField
            label="Show explainer section"
            checked={draft.explainerVisible}
            onChange={(checked) => update('explainerVisible', checked)}
          />
        </div>
        <div className="content-editor__grid">
          <Field
            label="Lead description"
            value={draft.explainerLead}
            multiline
            onChange={(v) => update('explainerLead', v)}
          />
          {draft.explainerSteps.map((step, index) => (
            <div key={index} className="content-editor__card">
              <Field
                label={`Step ${index + 1} label`}
                value={step.label}
                onChange={(v) => updateStep(index, { label: v })}
              />
              <label className="ui-field ui-field--filled">
                <span className="ui-field__label">Icon</span>
                <select
                  className="ui-field__input"
                  value={step.icon}
                  onChange={(event) => updateStep(index, { icon: event.target.value })}
                >
                  <option value="image">image</option>
                  <option value="shield-check">shield-check</option>
                  <option value="shield">shield</option>
                </select>
              </label>
            </div>
          ))}
          <Button
            type="button"
            variant="ghost"
            onClick={() =>
              update('explainerSteps', [
                ...draft.explainerSteps,
                { icon: 'image', label: 'New step' },
              ])
            }
          >
            Add step
          </Button>
          {draft.explainerSteps.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => update('explainerSteps', draft.explainerSteps.slice(0, -1))}
            >
              Remove last step
            </Button>
          ) : null}
          <Field
            label="Explainer button label"
            value={draft.explainerCtaLabel}
            onChange={(v) => update('explainerCtaLabel', v)}
          />
          <Field
            label="Explainer button destination"
            value={draft.explainerCtaHref}
            onChange={(v) => update('explainerCtaHref', v)}
          />
        </div>
      </section>

      <section className="content-editor__section" aria-labelledby="landing-footer-editor">
        <h2 id="landing-footer-editor">Footer</h2>
        <div className="content-editor__grid">
          <Field
            label="Disclaimer"
            value={draft.footerDisclaimer}
            onChange={(v) => update('footerDisclaimer', v)}
          />
          <Field
            label="Copyright"
            value={draft.footerCopyright}
            onChange={(v) => update('footerCopyright', v)}
          />
        </div>
      </section>

      {!error && !notice ? (
        <Alert tone="info">
          Preview opens the real Landing layout with your saved draft. Save Draft before Preview if
          you changed fields.
        </Alert>
      ) : null}
    </div>
  )
}
