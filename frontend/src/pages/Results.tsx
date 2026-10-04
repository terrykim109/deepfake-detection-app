import React, { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { StepIndicator } from '../components/StepIndicator'
import { Modal } from '../components/Modal'
import { useAppState } from '../state/AppState'
import { Alert, Button, Card, CheckCircleIcon, PageHeader, ScoreDial, TrashCheckIcon, VerdictBadge } from '../components/ui'

/* Fixed advisory text required on every result (SDS §4.1.2.7, BR-12 / FR-11). */
const DISCLAIMER =
  'This tool provides a preliminary screening only. It is not a forensic, legal, academic, or identity-verification authority. Results are estimates and should not be treated as definitive proof. Always verify important media through additional sources.'

/* Figma frame "Image Results" (node 3:4).

   After analysis the original image is deleted (FR-12). This screen shows
   the result only, plus an explicit privacy confirmation. */
export const Results: React.FC = () => {
  const navigate = useNavigate()
  const { currentResult, saveResult, isSaved, clearAnalysis } = useAppState()
  const [saved, setSaved] = useState(false)
  const alreadySaved = currentResult ? isSaved(currentResult.id) : false

  if (!currentResult) return <Navigate to="/upload" replace />

  const save = () => {
    // History stores the result metadata only — never the original image
    saveResult(currentResult)
    setSaved(true)
  }

  const analyzeAnother = () => {
    clearAnalysis()
    navigate('/upload')
  }

  const privacyText =
    currentResult.privacyMessage ||
    'Your original image has been deleted from our servers. Only this analysis result was kept.'

  return (
    <AppShell>
      <PageHeader title="Analysis result" />

      <Card className="results-card" padding="lg">
        <div className="results-top">
          <div className="result-thumb" aria-hidden="true">
            <img className="icon" src="/assets/icon-image.svg" alt="" />
            <p className="result-thumb-note">Original image removed</p>
          </div>

          <div className="results-summary">
            <VerdictBadge verdict={currentResult.verdict} label={currentResult.verdictLabel} />
            <p className="results-file">{currentResult.fileName}</p>
          </div>
        </div>

        <div className="result-body">
          <div className="result-text">
            <h2 className="result-text-title">What we found</h2>
            <p>{currentResult.summary}</p>
          </div>

          <div className="result-side">
            <ScoreDial value={currentResult.confidence} verdict={currentResult.verdict} />
            <div className="results-actions">
              <Button fullWidth onClick={save} disabled={alreadySaved}>
                {alreadySaved ? 'Saved' : 'Save result'}
              </Button>
              <Button variant="ghost" fullWidth onClick={analyzeAnother}>
                Analyze another
              </Button>
            </div>
          </div>
        </div>

        <Alert tone="success" icon={<TrashCheckIcon className="ui-alert__icon" />} className="privacy-note">
          {privacyText}
          {currentResult.imageDeletedAt ? (
            <span className="privacy-meta">
              Deleted at {new Date(currentResult.imageDeletedAt).toLocaleString()}
              {currentResult.imageStoredAt
                ? ` · stored at ${new Date(currentResult.imageStoredAt).toLocaleString()}`
                : ''}
            </span>
          ) : null}
        </Alert>

        <p className="result-disclaimer">{DISCLAIMER}</p>

        <div className="results-steps">
          <StepIndicator step={3} />
        </div>
      </Card>

      {saved && (
        <Modal
          title="Results Saved"
          subtitle={'Results can be viewed in the “History” Page. The original image was not saved.'}
          icon={<CheckCircleIcon />}
          tone="success"
          onClose={() => setSaved(false)}
          actions={<Button onClick={() => setSaved(false)}>OK</Button>}
        />
      )}
    </AppShell>
  )
}
