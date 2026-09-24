import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { StepIndicator } from '../components/StepIndicator'
import { useAppState } from '../state/AppState'
import { TIPS, TIPS_LEAD } from '../data/mock'
import { validateUploadSelection } from '../upload/validateUpload'

/* Figma frame "Image Upload" (node 20:12).

   Analyze posts to the backend /api/analysis/run path (DFD-02) and
   surfaces connecting / processing / analyzing status while it runs. */
export const Upload: React.FC = () => {
  const navigate = useNavigate()
  const { runAnalysis, analyzing, analysisStage, analysisStageLabel, user } = useAppState()
  const inputRef = useRef<HTMLInputElement>(null)

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const previewRef = useRef<string | null>(null)
  const handedOff = useRef(false)

  useEffect(
    () => () => {
      abortRef.current?.abort()
      if (previewRef.current && !handedOff.current) {
        URL.revokeObjectURL(previewRef.current)
      }
    },
    [],
  )

  const setPreviewUrl = (next: string | null) => {
    if (previewRef.current && previewRef.current !== next) {
      URL.revokeObjectURL(previewRef.current)
    }
    previewRef.current = next
    setPreview(next)
  }

  const clear = () => {
    setFile(null)
    setPreviewUrl(null)
    setError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  const accept = async (files: FileList | File[] | null | undefined) => {
    setError('')
    const result = await validateUploadSelection(files)
    if (!result.ok) {
      setFile(null)
      setPreviewUrl(null)
      if (inputRef.current) inputRef.current.value = ''
      setError(result.message)
      return
    }

    setFile(result.file)
    setPreviewUrl(URL.createObjectURL(result.file))
    setError('')
  }

  const analyze = async () => {
    if (!user) {
      setError('Please log in before uploading an image for analysis.')
      return
    }
    if (!file) {
      setError('Choose one JPG, JPEG, PNG, or WEBP image under 10 MB to continue.')
      return
    }
    if (processing || analyzing) {
      setError(
        'You already have an analysis in progress. Please wait for it to finish before uploading another image.',
      )
      return
    }

    setProcessing(true)
    setError('')

    const controller = new AbortController()
    abortRef.current = controller

    try {
      const recheck = await validateUploadSelection([file])
      if (!recheck.ok) {
        setProcessing(false)
        setError(recheck.message)
        return
      }

      await runAnalysis(file, preview, controller.signal)
      handedOff.current = true
      setFile(null)
      setPreviewUrl(null)
      if (inputRef.current) inputRef.current.value = ''
      navigate('/results')
    } catch (err) {
      if (controller.signal.aborted) return
      setProcessing(false)
      setError(err instanceof Error ? err.message : 'Analysis failed. Please try again with another image.')
      setFile(null)
      setPreviewUrl(null)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const busy = processing || analyzing
  const statusText =
    analysisStageLabel ||
    (busy ? 'Analyzing your image…' : '')

  return (
    <AppShell>
      <h1 className="page-title">Upload your media</h1>

      <section className="panel upload-card">
        <div className="upload-grid">
          <div className="upload-col">
            {busy ? (
              <div className="processing-box">
                <div className="spinner" />
                <p className="processing-text">{statusText}</p>
                {analysisStage !== 'idle' && analysisStage !== 'completed' && (
                  <p className="processing-stage" aria-live="polite">
                    Status: {analysisStage}
                  </p>
                )}
              </div>
            ) : (
              <div
                className={`drop-zone${dragging ? ' dragging' : ''}`}
                onClick={() => inputRef.current?.click()}
                onDragOver={(e) => {
                  e.preventDefault()
                  setDragging(true)
                }}
                onDragLeave={() => setDragging(false)}
                onDrop={(e) => {
                  e.preventDefault()
                  setDragging(false)
                  void accept(e.dataTransfer.files)
                }}
              >
                {preview ? (
                  <img className="preview" src={preview} alt={file?.name ?? 'Selected image'} />
                ) : (
                  <>
                    <p className="drop-zone-text">Drop your image here</p>
                    <p className="drop-zone-hint">or click to browse — JPG, JPEG, PNG or WEBP (max 10 MB)</p>
                  </>
                )}
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                void accept(e.target.files)
              }}
            />

            <div className="upload-steps">
              <StepIndicator step={busy ? 2 : 1} />
            </div>

            {error && <p className="upload-error">{error}</p>}

            <div className="upload-actions">
              <button className="btn" onClick={() => void analyze()} disabled={!file || busy}>
                {busy ? 'Working…' : 'Analyze image'}
              </button>
              {!busy && (
                <button className="btn-ghost" onClick={clear}>
                  {file ? 'Clear' : 'Choose another image'}
                </button>
              )}
            </div>
          </div>

          <aside className="tips-panel">
            <p className="tips-title">Helpful Tips</p>
            <p className="tips-lead">{TIPS_LEAD}</p>
            {TIPS.map((tip) => (
              <div className="tip-row" key={tip}>
                <img src="/assets/icon-check-circle.svg" alt="" />
                <span>{tip}</span>
              </div>
            ))}
          </aside>
        </div>
      </section>
    </AppShell>
  )
}
