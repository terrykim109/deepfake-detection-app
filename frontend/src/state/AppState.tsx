import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useAuth, type AuthState, type AuthActions } from './useAuth'
import { type AnalysisResult } from '../data/mock'
import { createHttpDetector } from '../detection/httpDetector'
import type { AnalysisStage, Detector } from '../detection/detector'
import { ANALYSIS_STAGE_LABELS } from '../detection/detector'
import { validateUploadSelection } from '../upload/validateUpload'
import { forensicsApi, type ForensicsRunResponse } from '../api/client'

export type SortOrder = 'newest' | 'oldest'

/* Status of the independent forensics engine (metadata/EXIF, ELA, noise,
   C2PA). It is kicked off alongside the deepfake detector from the same
   upload and never blocks navigation to /results — the Results page
   shows whatever state this is in behind a collapsed-by-default card. */
export type ForensicsStatus = 'idle' | 'running' | 'completed' | 'failed'

const HISTORY_STORAGE_PREFIX = 'dfd.history.'

function historyKey(userId: string) {
  return `${HISTORY_STORAGE_PREFIX}${userId}`
}

function loadHistory(userId: string | null | undefined): AnalysisResult[] {
  if (!userId) return []
  try {
    const raw = localStorage.getItem(historyKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (row) =>
        row &&
        typeof row === 'object' &&
        typeof row.id === 'string' &&
        typeof row.fileName === 'string',
    ) as AnalysisResult[]
  } catch {
    return []
  }
}

function persistHistory(userId: string | null | undefined, rows: AnalysisResult[]) {
  if (!userId) return
  try {
    localStorage.setItem(historyKey(userId), JSON.stringify(rows))
  } catch {
    /* ignore quota / private mode */
  }
}

type AppStateValue = AuthState & AuthActions & {
  history: AnalysisResult[]
  sortOrder: SortOrder
  setSortOrder: (order: SortOrder) => void
  sortedHistory: AnalysisResult[]
  deleteResult: (id: string) => void
  currentResult: AnalysisResult | null
  previewUrl: string | null
  analyzing: boolean
  analysisStage: AnalysisStage
  analysisStageLabel: string
  runAnalysis: (file: File, preview: string | null, signal?: AbortSignal) => Promise<void>
  saveResult: (result: AnalysisResult) => void
  isSaved: (id: string) => boolean
  clearAnalysis: () => void
  /** Independent forensics engine — runs in parallel with the deepfake detector. */
  forensicsStatus: ForensicsStatus
  forensicsResult: ForensicsRunResponse | null
  forensicsError: string | null
}

const AppStateContext = createContext<AppStateValue | null>(null)

function formatTimestamp(d = new Date()): string {
  return d.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function revokePreview(preview: string | null) {
  if (!preview) return
  try {
    URL.revokeObjectURL(preview)
  } catch {
    /* ignore */
  }
}

function toHistorySafe(result: AnalysisResult): AnalysisResult {
  const {
    id,
    fileName,
    timestamp,
    createdAt,
    verdict,
    verdictLabel,
    confidence,
    summary,
    imageDeleted,
    imageStoredAt,
    imageDeletedAt,
    privacyMessage,
  } = result
  return {
    id,
    fileName,
    timestamp,
    createdAt,
    verdict,
    verdictLabel,
    confidence,
    summary,
    imageDeleted: imageDeleted ?? true,
    imageStoredAt: imageStoredAt ?? null,
    imageDeletedAt: imageDeletedAt ?? null,
    privacyMessage,
  }
}

export const AppStateProvider: React.FC<{
  children: React.ReactNode
  detector?: Detector
}> = ({ children, detector }) => {
  const authState = useAuth()
  const userIdRef = useRef<string | null>(null)
  userIdRef.current = authState.user?.user_id ?? null

  const activeDetector = useMemo(
    () => detector ?? createHttpDetector(() => userIdRef.current),
    [detector],
  )

  const userId = authState.user?.user_id ?? null
  const [history, setHistory] = useState<AnalysisResult[]>(() => loadHistory(userId))
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>('idle')
  const [forensicsStatus, setForensicsStatus] = useState<ForensicsStatus>('idle')
  const [forensicsResult, setForensicsResult] = useState<ForensicsRunResponse | null>(null)
  const [forensicsError, setForensicsError] = useState<string | null>(null)
  const analyzingRef = useRef(false)
  const previewUrlRef = useRef<string | null>(null)
  // Identifies the most recent forensics run so a slow response from an
  // earlier run (e.g. a previous upload) can never overwrite a newer one.
  const forensicsRunIdRef = useRef(0)
  const forensicsAbortRef = useRef<AbortController | null>(null)

  // Load this user's real history when auth identity changes (no mock seed).
  useEffect(() => {
    setHistory(loadHistory(userId))
  }, [userId])

  const sortedHistory = useMemo(() => {
    const dir = sortOrder === 'newest' ? -1 : 1
    return [...history].sort(
      (a, b) => dir * (Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    )
  }, [history, sortOrder])

  const clearAnalysis = useCallback(() => {
    revokePreview(previewUrlRef.current)
    previewUrlRef.current = null
    setCurrentResult(null)
    setPreviewUrl(null)
    setAnalysisStage('idle')
    setForensicsStatus('idle')
    setForensicsResult(null)
    setForensicsError(null)
  }, [])

  /* Independent forensics engine (metadata/EXIF, ELA, noise, C2PA). Kicked
     off from runAnalysis alongside the deepfake detector, from the same
     file and abort signal — but its result is read lazily on the Results
     page, so a slow or failed forensics pass never blocks navigation.

     Each call gets a run id and its own AbortController chained to the
     caller's signal. Starting a new run aborts whichever forensics request
     was still in flight and tags the new one as current, so a late response
     from an older upload can never land on top of a newer one's result —
     this run id is also the natural join key for pairing a forensics run
     with its deepfake counterpart later (e.g. a future combined summary). */
  const runForensics = useCallback(async (file: File, externalSignal?: AbortSignal) => {
    forensicsAbortRef.current?.abort()
    const controller = new AbortController()
    forensicsAbortRef.current = controller
    const abortFromExternal = () => controller.abort()
    externalSignal?.addEventListener('abort', abortFromExternal)

    const runId = ++forensicsRunIdRef.current
    const isStale = () => runId !== forensicsRunIdRef.current

    try {
      const { data, error } = await forensicsApi.run(file, controller.signal)
      if (isStale() || controller.signal.aborted) return
      if (error || !data) {
        setForensicsStatus('failed')
        setForensicsError(error || 'The forensics service did not return a result.')
        return
      }
      setForensicsResult(data)
      setForensicsStatus('completed')
    } catch (err) {
      if (isStale() || controller.signal.aborted || (err instanceof DOMException && err.name === 'AbortError')) return
      setForensicsStatus('failed')
      setForensicsError(err instanceof Error ? err.message : 'Forensics analysis failed.')
    } finally {
      externalSignal?.removeEventListener('abort', abortFromExternal)
    }
  }, [])

  const saveResult = useCallback(
    (result: AnalysisResult) => {
      const safe = toHistorySafe(result)
      setHistory((rows) => {
        const next = rows.some((r) => r.id === safe.id) ? rows : [safe, ...rows]
        persistHistory(userIdRef.current, next)
        return next
      })
    },
    [],
  )

  const deleteResult = useCallback((id: string) => {
    setHistory((rows) => {
      const next = rows.filter((r) => r.id !== id)
      persistHistory(userIdRef.current, next)
      return next
    })
  }, [])

  const isSaved = useCallback(
    (id: string) => history.some((r) => r.id === id),
    [history],
  )

  const runAnalysis = useCallback(
    async (file: File, preview: string | null, signal?: AbortSignal) => {
      if (!authState.user?.user_id) {
        throw new Error('Please log in before uploading an image for analysis.')
      }
      if (analyzingRef.current || authState.loading) {
        throw new Error(
          'You already have an analysis in progress. Please wait for it to finish before uploading another image.',
        )
      }

      const local = await validateUploadSelection([file])
      if (!local.ok) throw new Error(local.message)

      analyzingRef.current = true
      setAnalyzing(true)
      setAnalysisStage('validating')

      // Start the independent forensics engine in parallel, from the same
      // upload — it shares the abort signal but is never awaited here, so
      // it can never delay the deepfake verdict or navigation to /results.
      setForensicsStatus('running')
      setForensicsResult(null)
      setForensicsError(null)
      void runForensics(file, signal)

      try {
        const detection = await activeDetector.analyze(file, signal, setAnalysisStage)
        if (signal?.aborted) throw new DOMException('Analysis aborted', 'AbortError')

        // Keep a session-only local preview for Results zoom; server still deletes the file.
        if (previewUrlRef.current && previewUrlRef.current !== preview) {
          revokePreview(previewUrlRef.current)
        }
        previewUrlRef.current = preview
        setPreviewUrl(preview)

        const now = new Date()
        const result: AnalysisResult = {
          verdict: detection.verdict,
          verdictLabel: detection.verdictLabel,
          confidence: detection.confidence,
          summary: detection.summary,
          id: detection.id || `r_${now.getTime()}`,
          fileName: file.name,
          timestamp: formatTimestamp(now),
          createdAt: detection.createdAt || now.toISOString(),
          imageDeleted: detection.imageDeleted ?? true,
          imageStoredAt: detection.imageStoredAt ?? null,
          imageDeletedAt: detection.imageDeletedAt ?? null,
          privacyMessage:
            detection.privacyMessage ||
            'Your original image has been deleted from our servers. Only this analysis result was kept.',
          // Session-only region cues for zoom explanations — omitted from History.
          findings: detection.findings ?? [],
        }
        setCurrentResult(result)
        // Every completed analysis is real history (metadata only — no image).
        const safe = toHistorySafe(result)
        setHistory((rows) => {
          const next = rows.some((r) => r.id === safe.id) ? rows : [safe, ...rows]
          persistHistory(userIdRef.current, next)
          return next
        })
        setAnalysisStage('completed')
      } catch (err) {
        setAnalysisStage('failed')
        revokePreview(preview)
        if (previewUrlRef.current === preview) previewUrlRef.current = null
        setPreviewUrl(null)

        const aborted =
          (err instanceof DOMException && err.name === 'AbortError') || Boolean(signal?.aborted)
        if (aborted) throw err

        const message =
          err instanceof Error
            ? err.message
            : 'Analysis could not be completed. Please try uploading again.'
        throw new Error(message)
      } finally {
        analyzingRef.current = false
        setAnalyzing(false)
      }
    },
    [authState.user, authState.loading, activeDetector, runForensics],
  )

  return (
    <AppStateContext.Provider
      value={{
        ...authState,
        history,
        sortOrder,
        setSortOrder,
        sortedHistory,
        deleteResult,
        currentResult,
        previewUrl,
        analyzing,
        analysisStage,
        analysisStageLabel: ANALYSIS_STAGE_LABELS[analysisStage],
        runAnalysis,
        saveResult,
        isSaved,
        clearAnalysis,
        forensicsStatus,
        forensicsResult,
        forensicsError,
      }}
    >
      {children}
    </AppStateContext.Provider>
  )
}

export const useAppState = (): AppStateValue => {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider')
  return ctx
}
