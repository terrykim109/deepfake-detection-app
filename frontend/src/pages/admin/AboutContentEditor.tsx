import React, { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { contentApi } from '../../api/client'
import { ABOUT_DEFAULT } from '../../content/defaults'
import type { AboutContent, AboutTeamMemberContent } from '../../content/types'
import { Alert, Button, PageHeader, Spinner } from '../../components/ui'
import {
  ContentEditorActions,
  ContentStatusBar,
  Field,
  ToggleField,
} from './ContentEditorShared'

function newMember(): AboutTeamMemberContent {
  return {
    id: `member-${Date.now().toString(36)}`,
    name: '',
    role: '',
    contribution: '',
    photoSrc: '',
  }
}

export const AboutContentEditor: React.FC = () => {
  const navigate = useNavigate()
  const [draft, setDraft] = useState<AboutContent | null>(null)
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
    contentApi.adminAbout().then((res) => {
      if (cancelled) return
      if (res.error || !res.data) {
        setDraft(ABOUT_DEFAULT)
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

  const update = <K extends keyof AboutContent>(key: K, value: AboutContent[K]) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current))
    setNotice('')
  }

  const updateMember = (index: number, patch: Partial<AboutTeamMemberContent>) => {
    setDraft((current) => {
      if (!current) return current
      const team = current.team.map((member, i) => (i === index ? { ...member, ...patch } : member))
      return { ...current, team }
    })
    setNotice('')
  }

  const applyMeta = (data: NonNullable<Awaited<ReturnType<typeof contentApi.adminAbout>>['data']>) => {
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
    const res = await contentApi.saveAboutDraft(draft)
    setSaving(false)
    if (res.error || !res.data) {
      setError(res.error || 'Save failed')
      return
    }
    applyMeta(res.data)
    setNotice('Draft saved. The public About page was not changed.')
  }

  const publish = async () => {
    if (!draft) return
    setPublishing(true)
    setError('')
    setNotice('')
    const saved = await contentApi.saveAboutDraft(draft)
    if (saved.error || !saved.data) {
      setPublishing(false)
      setError(saved.error || 'Could not save draft before publish')
      return
    }
    const res = await contentApi.publishAbout()
    setPublishing(false)
    if (res.error || !res.data) {
      setError(res.error || 'Publish failed')
      return
    }
    applyMeta(res.data)
    setNotice('Published. The public About page now shows this content.')
  }

  if (loading || !draft) {
    return (
      <div className="admin-inline-loading">
        <Spinner /> Loading About editor…
      </div>
    )
  }

  return (
    <div className="content-editor">
      <PageHeader
        title="About Us"
        subtitle="Edit sections and team members. Premium remains described as a future offering."
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
        onPreview={() => navigate('/dashboard/content/about/preview')}
        onPublish={publish}
        error={error}
        notice={notice}
      />

      <section className="content-editor__section">
        <div className="content-editor__section-head">
          <h2>Introduction</h2>
          <ToggleField
            label="Show section"
            checked={draft.introVisible}
            onChange={(c) => update('introVisible', c)}
          />
        </div>
        <div className="content-editor__grid">
          <Field label="Heading" value={draft.introHeading} onChange={(v) => update('introHeading', v)} />
          <Field
            label="Description"
            value={draft.introDescription}
            multiline
            onChange={(v) => update('introDescription', v)}
          />
        </div>
      </section>

      <section className="content-editor__section">
        <div className="content-editor__section-head">
          <h2>Our Purpose</h2>
          <ToggleField
            label="Show section"
            checked={draft.purposeVisible}
            onChange={(c) => update('purposeVisible', c)}
          />
        </div>
        <div className="content-editor__grid">
          <Field
            label="Heading"
            value={draft.purposeHeading}
            onChange={(v) => update('purposeHeading', v)}
          />
          <Field
            label="Description"
            value={draft.purposeDescription}
            multiline
            onChange={(v) => update('purposeDescription', v)}
          />
        </div>
      </section>

      <section className="content-editor__section">
        <div className="content-editor__section-head">
          <h2>Accessibility and Membership</h2>
          <ToggleField
            label="Show section"
            checked={draft.accessVisible}
            onChange={(c) => update('accessVisible', c)}
          />
        </div>
        <div className="content-editor__grid">
          <Field
            label="Heading"
            value={draft.accessHeading}
            onChange={(v) => update('accessHeading', v)}
          />
          <Field
            label="Primary description"
            value={draft.accessDescription}
            multiline
            onChange={(v) => update('accessDescription', v)}
          />
          <Field
            label="Secondary description"
            value={draft.accessDescriptionSecondary}
            multiline
            onChange={(v) => update('accessDescriptionSecondary', v)}
          />
          <Field label="Try It Free label" value={draft.tryItLabel} onChange={(v) => update('tryItLabel', v)} />
          <Field
            label="Try It Free destination"
            value={draft.tryItHref}
            onChange={(v) => update('tryItHref', v)}
          />
          <Field
            label="Explore Membership label"
            value={draft.membershipLabel}
            onChange={(v) => update('membershipLabel', v)}
          />
          <Field
            label="Membership coming-soon note"
            value={draft.membershipNote}
            multiline
            onChange={(v) => update('membershipNote', v)}
          />
        </div>
      </section>

      <section className="content-editor__section">
        <div className="content-editor__section-head">
          <h2>Meet the Team</h2>
          <ToggleField
            label="Show section"
            checked={draft.teamVisible}
            onChange={(c) => update('teamVisible', c)}
          />
        </div>
        <div className="content-editor__grid">
          <Field label="Heading" value={draft.teamHeading} onChange={(v) => update('teamHeading', v)} />
          <Field
            label="Description"
            value={draft.teamDescription}
            multiline
            onChange={(v) => update('teamDescription', v)}
          />
        </div>
        <ul className="content-editor__team-list">
          {draft.team.map((member, index) => (
            <li key={member.id} className="content-editor__card">
              <Field
                label="Name"
                value={member.name}
                onChange={(v) => updateMember(index, { name: v })}
              />
              <Field
                label="Role"
                value={member.role}
                onChange={(v) => updateMember(index, { role: v })}
              />
              <Field
                label="Contribution"
                value={member.contribution}
                onChange={(v) => updateMember(index, { contribution: v })}
              />
              <Field
                label="Photo URL or path"
                value={member.photoSrc}
                hint="Optional. Example: /assets/team/name.jpg"
                onChange={(v) => updateMember(index, { photoSrc: v })}
              />
              <Button
                type="button"
                variant="danger"
                onClick={() =>
                  update(
                    'team',
                    draft.team.filter((_, i) => i !== index),
                  )
                }
              >
                Remove member
              </Button>
            </li>
          ))}
        </ul>
        <Button
          type="button"
          variant="ghost"
          onClick={() => update('team', [...draft.team, newMember()])}
        >
          Add team member
        </Button>
      </section>

      <section className="content-editor__section">
        <h2>Footer</h2>
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
          Preview uses the real About layout with the saved draft. Public visitors only see published
          content.
        </Alert>
      ) : null}
    </div>
  )
}
