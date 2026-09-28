import React, { useState } from 'react'
import { Navigate, useParams } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { useAppState } from '../state/AppState'
import { Button, Card, IconButton, PageHeader, ScoreDial, VerdictBadge } from '../components/ui'

/* Figma frames "Result from History" (20:45) and
   "Saved Confirmation" (115:50) — the score ellipse, the summary and a
   save action that opens the confirmation modal. */
export const ResultDetail: React.FC = () => {
  const { id } = useParams()
  const { history } = useAppState()
  const [saved, setSaved] = useState(false)

  const result = history.find((r) => r.id === id)
  if (!result) return <Navigate to="/history" replace />

  return (
    <AppShell>
      <PageHeader title="Saved result" />

      <Card className="detail-card" padding="lg">
        <IconButton
          className="detail-save"
          size="lg"
          icon="/assets/icon-save.svg"
          label="Save result"
          onClick={() => setSaved(true)}
        />

        <ScoreDial value={result.confidence} verdict={result.verdict} />
        <VerdictBadge verdict={result.verdict} label={result.verdictLabel} />

        <p className="detail-text">{result.summary}</p>

        <p className="detail-meta">
          {result.fileName} · {result.timestamp}
        </p>
      </Card>

      {saved && (
        <Modal
          title="Results Saved"
          subtitle={'Results can be viewed in the “History” Page'}
          onClose={() => setSaved(false)}
          actions={<Button onClick={() => setSaved(false)}>OK</Button>}
        />
      )}
    </AppShell>
  )
}
