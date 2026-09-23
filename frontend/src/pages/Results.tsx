import React, { useState } from 'react'
import { Navigate, useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { StepIndicator } from '../components/StepIndicator'
import { Modal } from '../components/Modal'
import { useAppState } from '../state/AppState'

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
      <section className="panel results-card">
        <div className="result-thumb result-thumb--cleared" aria-hidden="true">
          <img className="icon" src="/assets/icon-image.svg" alt="" />
          <p className="result-thumb-note">Original image removed</p>
        </div>

        <div className="result-body">
          <div className="result-text">
            <p>{currentResult.summary}</p>
          </div>
          <div className="score">
            <span>{currentResult.confidence}</span>
          </div>
        </div>

        <p className="privacy-note" role="status">
          {privacyText}
          {currentResult.imageDeletedAt ? (
            <>
              {' '}
              <span className="privacy-meta">
                Deleted at {new Date(currentResult.imageDeletedAt).toLocaleString()}
                {currentResult.imageStoredAt
                  ? ` · stored at ${new Date(currentResult.imageStoredAt).toLocaleString()}`
                  : ''}
              </span>
            </>
          ) : null}
        </p>

        <div className="results-steps">
          <StepIndicator step={3} />
        </div>

        <div className="results-actions">
          <button className="btn" onClick={save} disabled={alreadySaved}>
            {alreadySaved ? 'Saved' : 'Save result'}
          </button>
          <button className="btn-ghost" onClick={analyzeAnother}>
            Analyze another
          </button>
        </div>
      </section>

      {saved && (
        <Modal
          title="Results Saved"
          subtitle={'Results can be viewed in the “History” Page. The original image was not saved.'}
          onClose={() => setSaved(false)}
        />
      )}
    </AppShell>
  )
}
