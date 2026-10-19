import React, { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { StepIndicator } from '../components/StepIndicator'
import { Modal } from '../components/Modal'
import { ImageZoom } from '../components/ImageZoom'
import { ForensicsReport } from '../components/ForensicsReport'
import { useAppState, type ForensicsStatus } from '../state/AppState'
import type { ForensicsRunResponse } from '../api/client'
import { Alert, Button, Card, CheckCircleIcon, PageHeader, ScoreDial, Spinner, TrashCheckIcon, VerdictBadge } from '../components/ui'
import '../styles/forensics.css'

/* Fixed advisory text required on every result (SDS §4.1.2.7, BR-12 / FR-11). */
const DISCLAIMER =
  'This tool provides a preliminary screening only. It is not a forensic, legal, academic, or identity-verification authority. Results are estimates and should not be treated as definitive proof. Always verify important media through additional sources.'

/* Figma frame "Image Results" (node 3:4).

   After analysis the original image is deleted from our servers (FR-12).
   A session-only local preview remains so the user can inspect/zoom. */
export const Results: React.FC = () => {
  const navigate = useNavigate()
  const {
    currentResult,
    previewUrl,
    saveResult,
    isSaved,
    clearAnalysis,
    forensicsStatus,
    forensicsResult,
    forensicsError,
  } = useAppState()
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
          {previewUrl ? (
            <div className="result-preview">
              <ImageZoom
                src={previewUrl}
                alt={currentResult.fileName}
                findings={currentResult.findings}
              />
              <p className="result-preview-note">
                Temporary local preview for inspection — not stored on our servers.
              </p>
            </div>
          ) : (
            <div className="result-thumb" aria-hidden="true">
              <img className="icon" src="/assets/icon-image.svg" alt="" />
              <p className="result-thumb-note">Original image removed</p>
            </div>
          )}

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

        <ForensicsDisclosure
          status={forensicsStatus}
          result={forensicsResult}
          error={forensicsError}
        />

        <Alert tone="success" icon={<TrashCheckIcon className="ui-alert__icon" />} className="privacy-note">
          {privacyText}
          {previewUrl
            ? ' A temporary local preview is shown above so you can zoom and inspect details; it is discarded when you leave this screen.'
            : null}
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

/* Independent Digital Image Forensics engine (metadata/EXIF, ELA, noise,
   C2PA) — runs in parallel with the deepfake detector from the same
   upload (see AppState.runAnalysis) and is never required to view the
   main verdict above. Collapsed by default; expanding it reveals
   whatever state the parallel run is currently in. */
const ForensicsDisclosure: React.FC<{
  status: ForensicsStatus
  result: ForensicsRunResponse | null
  error: string | null
}> = ({ status, result, error }) => {
  const [open, setOpen] = useState(false)

  return (
    <Card padding="lg" className="forensics-disclosure">
      <button
        type="button"
        className="forensics-toggle"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="forensics-toggle-title">
          Forensics details
          {status === 'running' && <Spinner size="sm" label="Running forensics checks" />}
        </span>
        <span className="forensics-toggle-icon" aria-hidden="true">
          {open ? '−' : '+'}
        </span>
      </button>

      {open && (
        <div className="forensics-disclosure-body">
          {status === 'running' && (
            <p className="forensics-hint">
              Running metadata, ELA, noise, and C2PA checks…
            </p>
          )}
          {status === 'failed' && (
            <Alert tone="warning">
              {error || 'The forensics service did not return a result.'}
            </Alert>
          )}
          {status === 'completed' && result && (
            <ForensicsReport forensics={result.forensics} />
          )}
          {status === 'idle' && (
            <p className="forensics-hint">Forensics details are not available for this result.</p>
          )}
        </div>
      )}
    </Card>
  )
}
