import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { useAppState } from '../state/AppState'
import type { AnalysisStage } from '../detection/detector'
import { validateUploadSelection } from '../upload/validateUpload'
import {
  Alert,
  Button,
  CheckIcon,
  ClockIcon,
  ImageIcon,
  PageHeader,
  ScaleIcon,
  ShieldCheckIcon,
  Spinner,
  UploadIcon,
} from '../components/ui'
import { cx } from '../components/ui/cx'
import { useIsMobile } from '../hooks/useMediaQuery'

const STEPS = [
  { name: 'Upload', desc: 'Choose one image' },
  { name: 'Processing', desc: 'We check it, then delete the copy' },
  { name: 'Results', desc: 'Verdict with a confidence score' },
]

// Order matches the stages the detector reports while it runs.
const SUBSTEPS: { stage: AnalysisStage; label: string }[] = [
  { stage: 'validating', label: 'Check your image' },
  { stage: 'connecting', label: 'Connect to the analysis service' },
  { stage: 'processing', label: 'Prepare a secure temporary copy' },
  { stage: 'analyzing', label: 'Analyze your image' },
  { stage: 'finalizing', label: 'Remove the temporary image' },
]

const FACTS = [
  { id: 'upload-fact-formats', title: 'Formats', body: 'JPG, JPEG, PNG or WEBP', Icon: ImageIcon },
  { id: 'upload-fact-size', title: 'Size', body: 'Up to 10 MB, one image at a time', Icon: UploadIcon },
  {
    id: 'upload-fact-privacy',
    title: 'Privacy',
    body: 'Deleted within 60 seconds of analysis. History never stores the image.',
    Icon: ShieldCheckIcon,
  },
  {
    id: 'upload-fact-advisory',
    title: 'Advisory',
    body: 'A screening aid to support your judgment, not forensic proof.',
    Icon: ScaleIcon,
  },
]

// About where people start to lose focus on a wait (NN/g response-time limits).
const SLOW_AFTER_MS = 10_000

type StepState = 'done' | 'active' | 'todo'

const formatSize = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`

/* Guided card: the stepper heads the card, the image and the facts (or the
   live checklist while busy) share the body, and the action bar holds the
   buttons. Figma: "Upload redesign — light + dark", direction C.

   Analyze posts to the backend /api/analysis/run path (DFD-02) and
   surfaces connecting / processing / analyzing status while it runs. */
export const Upload: React.FC = () => {
  const navigate = useNavigate()
  const { runAnalysis, analyzing, analysisStage, analysisStageLabel, user } = useAppState()
  const inputRef = useRef<HTMLInputElement>(null)
  const isMobile = useIsMobile()

  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [dimensions, setDimensions] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)
  const previewRef = useRef<string | null>(null)
  const handedOff = useRef(false)

  const busy = processing || analyzing

  useEffect(
    () => () => {
      abortRef.current?.abort()
      if (previewRef.current && !handedOff.current) {
        URL.revokeObjectURL(previewRef.current)
      }
    },
    [],
  )

  // A file dropped outside the drop zone would otherwise open in the tab and leave the app.
  useEffect(() => {
    const block = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) e.preventDefault()
    }
    window.addEventListener('dragover', block)
    window.addEventListener('drop', block)
    return () => {
      window.removeEventListener('dragover', block)
      window.removeEventListener('drop', block)
    }
  }, [])

  useEffect(() => {
    if (!busy) return
    const timer = window.setTimeout(() => setSlow(true), SLOW_AFTER_MS)
    return () => {
      window.clearTimeout(timer)
      setSlow(false)
    }
  }, [busy])

  const setPreviewUrl = (next: string | null) => {
    if (previewRef.current && previewRef.current !== next) {
      URL.revokeObjectURL(previewRef.current)
    }
    previewRef.current = next
    setPreview(next)
    setDimensions(null)
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
    if (busy) {
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
      // AppState now owns the blob URL for Results zoom — do not revoke it here.
      handedOff.current = true
      setFile(null)
      previewRef.current = null
      setPreview(null)
      if (inputRef.current) inputRef.current.value = ''
      navigate('/results')
    } catch (err) {
      if (controller.signal.aborted) return
      setProcessing(false)
      setError(err instanceof Error ? err.message : 'Analysis failed. Please try again with another image.')
      // AppState revoked the preview it was handed; keep the file so the user can retry it.
      setPreviewUrl(URL.createObjectURL(file))
    }
  }

  // The stage from the previous run lingers until AppState starts this one, so ignore it until then.
  const statusText = (analyzing && analysisStageLabel) || 'Checking your image…'
  const openPicker = () => inputRef.current?.click()

  const stepState = (i: number): StepState => {
    const active = busy ? 1 : 0
    return i < active ? 'done' : i === active ? 'active' : 'todo'
  }
  // Before the detector reports its first stage, treat the run as on the first substep.
  const currentSub = analyzing ? Math.max(0, SUBSTEPS.findIndex((s) => s.stage === analysisStage)) : 0
  const subState = (i: number): StepState => (i < currentSub ? 'done' : i === currentSub ? 'active' : 'todo')

  const fileDetail = file
    ? [formatSize(file.size), dimensions, file.type.replace('image/', '').toUpperCase()].filter(Boolean).join(' · ')
    : ''

  const dropHandlers = busy
    ? {}
    : {
        onDragOver: (e: React.DragEvent) => {
          e.preventDefault()
          setDragging(true)
        },
        onDragLeave: (e: React.DragEvent) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
        },
        onDrop: (e: React.DragEvent) => {
          e.preventDefault()
          setDragging(false)
          void accept(e.dataTransfer.files)
        },
      }

  return (
    <AppShell>
      <div className="upload-page">
        <PageHeader
          title="Check an image"
          subtitle="Add one photo and we’ll screen it for signs of AI generation or editing."
        />

        <section className="upload-card" aria-labelledby="upload-card-title">
          <h2 id="upload-card-title" className="visually-hidden">
            {busy ? 'Step 2 of 3, Checking your image' : 'Step 1 of 3, Choose your image'}
          </h2>

          <ol className="upload-steps">
            {STEPS.map((s, i) => {
              const state = stepState(i)
              return (
                <li
                  key={s.name}
                  className={cx('upload-steps__step', `is-${state}`)}
                  aria-current={state === 'active' ? 'step' : undefined}
                >
                  <span className="upload-steps__marker" aria-hidden="true">
                    {state === 'done' ? <CheckIcon /> : i + 1}
                  </span>
                  <span className="upload-steps__text">
                    <span className="upload-steps__name">
                      {s.name}
                      {state === 'done' && <span className="visually-hidden"> (done)</span>}
                    </span>
                    <span className="upload-steps__desc">{s.desc}</span>
                  </span>
                </li>
              )
            })}
          </ol>

          <div className="upload-card__body">
            <div
              className={cx('upload-card__main', dragging && 'is-dragging', error && !file && 'has-error')}
              {...dropHandlers}
            >
              {error && <Alert tone="error">{error}</Alert>}

              {preview ? (
                <div className="upload-box">
                  <div className="upload-box__stage">
                    <img
                      className="upload-box__image"
                      src={preview}
                      alt={file?.name ?? 'Selected image'}
                      onLoad={(e) => {
                        const img = e.currentTarget
                        setDimensions(`${img.naturalWidth} × ${img.naturalHeight}`)
                      }}
                    />
                    {busy && (
                      <>
                        <div className="upload-box__progress" aria-hidden="true" />
                        <p className="upload-box__status" aria-live="polite">
                          <Spinner size="sm" />
                          {statusText}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="upload-file">
                    <span className="upload-file__icon" aria-hidden="true">
                      <ImageIcon />
                    </span>
                    <div className="upload-file__meta">
                      <p className="upload-file__name">{file?.name}</p>
                      <p className="upload-file__detail">{fileDetail}</p>
                    </div>
                    {!busy && (
                      <Button variant="link" onClick={openPicker}>
                        Replace
                      </Button>
                    )}
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="upload-drop"
                  aria-describedby="upload-fact-formats upload-fact-size"
                  onClick={openPicker}
                >
                  <span className="upload-drop__tile" aria-hidden="true">
                    <UploadIcon />
                  </span>
                  <span className="upload-drop__title">
                    {isMobile ? 'Choose a photo to check' : 'Drag and drop an image here'}
                  </span>
                  <span className="upload-drop__or">
                    {isMobile ? (
                      <span className="upload-drop__link">Browse your photos</span>
                    ) : (
                      <>
                        or <span className="upload-drop__link">browse your files</span>
                      </>
                    )}
                  </span>
                </button>
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
            </div>

            {busy ? (
              <aside className="upload-rail is-busy" aria-labelledby="upload-rail-title">
                <h3 id="upload-rail-title" className="upload-rail__title">
                  What happens now
                </h3>
                <ul className="upload-substeps">
                  {SUBSTEPS.map((sub, j) => {
                    const ss = subState(j)
                    return (
                      <li key={sub.stage} className={cx('upload-substep', `is-${ss}`)}>
                        <span className="upload-substep__icon" aria-hidden="true">
                          {ss === 'done' ? (
                            <CheckIcon />
                          ) : ss === 'active' ? (
                            <Spinner size="sm" />
                          ) : (
                            <span className="upload-substep__dot" />
                          )}
                        </span>
                        {sub.label}
                      </li>
                    )
                  })}
                </ul>
                <p className="upload-rail__note">
                  <ShieldCheckIcon aria-hidden="true" />
                  Your image is deleted within 60 seconds of analysis.
                </p>
              </aside>
            ) : (
              <aside className="upload-rail" aria-label="Before you upload">
                <ul className="upload-facts">
                  {FACTS.map(({ id, title, body, Icon }) => (
                    <li key={id} className="upload-fact">
                      <span className="upload-fact__tile" aria-hidden="true">
                        <Icon />
                      </span>
                      <div>
                        <p className="upload-fact__title">{title}</p>
                        <p id={id} className="upload-fact__body">
                          {body}
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              </aside>
            )}
          </div>

          <div className="upload-bar">
            <div className="upload-bar__info">
              {/* Always mounted so screen readers announce the text when it arrives. */}
              <p className="upload-slow" role="status">
                {slow && (
                  <>
                    <ClockIcon aria-hidden="true" />
                    Taking longer than usual. Please keep this page open.
                  </>
                )}
              </p>
            </div>
            <div className="upload-bar__actions">
              {!busy && (
                <Button variant="ghost" size="lg" onClick={file ? clear : openPicker}>
                  {file ? 'Remove' : 'Browse files'}
                </Button>
              )}
              <Button
                size="lg"
                className="upload-cta"
                onClick={() => void analyze()}
                disabled={!file}
                loading={busy}
              >
                {busy ? 'Analyzing…' : 'Analyze image'}
              </Button>
            </div>
          </div>
        </section>
      </div>
    </AppShell>
  )
}
