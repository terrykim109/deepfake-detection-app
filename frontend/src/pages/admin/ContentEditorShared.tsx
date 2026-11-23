import React, { useId } from 'react'
import { Alert, Button, TextField } from '../../components/ui'

export function formatStamp(value: string | null | undefined): string {
  if (!value) return 'Never'
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString()
}

export const ContentStatusBar: React.FC<{
  status: string
  publishedAt: string | null
  draftUpdatedAt: string | null
  hasUnpublishedChanges: boolean
}> = ({ status, publishedAt, draftUpdatedAt, hasUnpublishedChanges }) => (
  <div className="content-editor__status" role="status">
    <p>
      <strong>Publication status:</strong> {status === 'published' ? 'Published' : 'Unpublished'}
      {hasUnpublishedChanges ? ' · Draft has unpublished changes' : ''}
    </p>
    <p>Last published: {formatStamp(publishedAt)}</p>
    <p>Draft updated: {formatStamp(draftUpdatedAt)}</p>
  </div>
)

export const ContentEditorActions: React.FC<{
  saving: boolean
  publishing: boolean
  onSaveDraft: () => void
  onPreview: () => void
  onPublish: () => void
  error?: string
  notice?: string
}> = ({ saving, publishing, onSaveDraft, onPreview, onPublish, error, notice }) => (
  <div className="content-editor__actions">
    {error ? <Alert tone="error">{error}</Alert> : null}
    {notice ? <Alert tone="success">{notice}</Alert> : null}
    <div className="content-editor__action-row">
      <Button type="button" variant="ghost" loading={saving} onClick={onSaveDraft}>
        Save Draft
      </Button>
      <Button type="button" variant="ghost" onClick={onPreview}>
        Preview
      </Button>
      <Button type="button" variant="primary" loading={publishing} onClick={onPublish}>
        Publish
      </Button>
    </div>
  </div>
)

export const Field: React.FC<{
  label: string
  value: string
  onChange: (value: string) => void
  multiline?: boolean
  hint?: string
}> = ({ label, value, onChange, multiline, hint }) => {
  const id = useId()
  if (!multiline) {
    return (
      <TextField
        label={label}
        value={value}
        hint={hint}
        variant="filled"
        onChange={(event) => onChange(event.target.value)}
      />
    )
  }
  return (
    <div className="ui-field ui-field--filled">
      <label className="ui-field__label" htmlFor={id}>
        {label}
      </label>
      <textarea
        id={id}
        className="ui-field__input content-editor__textarea"
        rows={4}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {hint ? <p className="ui-field__hint">{hint}</p> : null}
    </div>
  )
}

export const ToggleField: React.FC<{
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
}> = ({ label, checked, onChange }) => (
  <label className="content-editor__toggle">
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
    />
    <span>{label}</span>
  </label>
)
