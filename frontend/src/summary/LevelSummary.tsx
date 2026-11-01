import { useEffect, useRef, useState } from 'react'
import { forensicsApi, type ForensicsResult } from '../api/client'
import type { AnalysisResult } from '../data/mock'
import { streamLevelSummary, type SummaryLevel } from './summaryApi'
import './levelSummary.css'

interface Props {
  result: AnalysisResult
  previewUrl: string | null
}

interface CachedSummary {
  summary: string
  truncated: boolean
  simulated: boolean
  notices: string[]
}

const FORENSICS_UNAVAILABLE = 'Forensic checks were unavailable, so this summary uses the detector result only.'
const PREVIEW_UNAVAILABLE = 'The image preview is unavailable, so this summary uses the detector result only.'
const SUMMARY_TRUNCATED = 'This summary was cut short. You can regenerate it for a complete version.'

export function LevelSummary({ result, previewUrl }: Props) {
  const [level, setLevel] = useState<SummaryLevel>('beginner')
  const [summary, setSummary] = useState('')
  const [error, setError] = useState('')
  const [notices, setNotices] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [simulated, setSimulated] = useState(false)
  const controllerRef = useRef<AbortController | null>(null)
  const forensicsRef = useRef<ForensicsResult | null>(null)
  const forensicsCheckedRef = useRef(false)
  const forensicsNoticeRef = useRef('')
  const summariesRef = useRef(new Map<SummaryLevel, CachedSummary>())
  const [cachedLevels, setCachedLevels] = useState<Set<SummaryLevel>>(() => new Set())
  const cached = cachedLevels.has(level)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const generate = async () => {
    if (busy) return
    const previous = summariesRef.current.get(level)
    const controller = new AbortController()
    controllerRef.current = controller
    setBusy(true)
    setError('')
    setNotices([])
    setSummary('')
    setSimulated(false)
    let simulatedForRequest = false

    try {
      if (!forensicsCheckedRef.current && previewUrl) {
        forensicsCheckedRef.current = true
        try {
          const blob = await fetch(previewUrl, { signal: controller.signal }).then((response) => response.blob())
          const file = new File([blob], result.fileName, { type: blob.type })
          const response = await forensicsApi.run(file, controller.signal)
          if (response.data?.ok) {
            forensicsRef.current = response.data.forensics
          } else {
            forensicsNoticeRef.current = FORENSICS_UNAVAILABLE
          }
        } catch {
          if (controller.signal.aborted) return
          forensicsNoticeRef.current = FORENSICS_UNAVAILABLE
        }
      } else if (!previewUrl && !forensicsCheckedRef.current) {
        forensicsCheckedRef.current = true
        forensicsNoticeRef.current = PREVIEW_UNAVAILABLE
      }

      const requestNotices = forensicsNoticeRef.current ? [forensicsNoticeRef.current] : []
      setNotices(requestNotices)

      const completed = await streamLevelSummary(
        result,
        forensicsRef.current,
        level,
        (text) => setSummary((current) => current + text),
        (value) => {
          simulatedForRequest = value
          setSimulated(value)
        },
        controller.signal,
      )
      setSummary(completed.summary)
      const completedNotices = completed.truncated ? [...requestNotices, SUMMARY_TRUNCATED] : requestNotices
      summariesRef.current.set(level, { ...completed, simulated: simulatedForRequest, notices: completedNotices })
      setCachedLevels(new Set(summariesRef.current.keys()))
      if (completed.truncated) {
        setNotices(completedNotices)
      }
    } catch (cause) {
      if (!controller.signal.aborted) {
        setSummary(previous?.summary ?? '')
        setSimulated(previous?.simulated ?? false)
        if (previous) setNotices(previous.notices)
        setError(cause instanceof Error ? cause.message : 'The summary could not be generated.')
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
      setBusy(false)
    }
  }

  return (
    <section className="level-summary" aria-label="Detailed summary">
      <h2>Detailed summary</h2>
      <p>Generating a summary uploads your temporary preview to our server for in-memory forensic checks. Only text findings go to the AI summary service.</p>
      <div className="level-summary__controls">
        <label htmlFor="summary-level">Explanation level</label>
        <select id="summary-level" value={level} disabled={busy} onChange={(event) => {
          const next = event.target.value as SummaryLevel
          const saved = summariesRef.current.get(next)
          setLevel(next)
          setSummary(saved?.summary ?? '')
          setSimulated(saved?.simulated ?? false)
          setNotices(saved?.notices ?? [])
          setError('')
        }}>
          <option value="beginner">Beginner</option>
          <option value="intermediate">Intermediate</option>
          <option value="technical">Technical</option>
        </select>
        <button type="button" onClick={() => void generate()} disabled={busy}>
          {busy ? 'Generating…' : cached ? 'Regenerate' : 'Generate summary'}
        </button>
      </div>
      {notices.map((notice) => <p key={notice} className="level-summary__notice">{notice}</p>)}
      {simulated && <p className="level-summary__notice">Demo detection is active. Its verdict and score are simulated, so this summary cannot judge whether the image is AI-generated.</p>}
      {error && <p role="alert" className="level-summary__error">{error}</p>}
      <p role="status" className="level-summary__status">{busy ? 'Writing summary…' : error && summary ? 'Previous summary shown' : summary ? 'Summary ready' : ''}</p>
      <div aria-busy={busy} className="level-summary__output">
        {summary.split(/\n\s*\n/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph}</p>)}
      </div>
    </section>
  )
}
