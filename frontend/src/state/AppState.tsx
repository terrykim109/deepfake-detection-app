import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useAuth, type AuthState, type AuthActions } from './useAuth'
import { HISTORY_SEED, type AnalysisResult } from '../data/mock'
import { createHttpDetector } from '../detection/httpDetector'
import type { AnalysisStage, Detector } from '../detection/detector'
import { ANALYSIS_STAGE_LABELS } from '../detection/detector'
import { validateUploadSelection } from '../upload/validateUpload'

export type SortOrder = 'newest' | 'oldest'

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

  const [history, setHistory] = useState<AnalysisResult[]>(HISTORY_SEED)
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisStage, setAnalysisStage] = useState<AnalysisStage>('idle')
  const analyzingRef = useRef(false)

  const sortedHistory = useMemo(() => {
    const dir = sortOrder === 'newest' ? -1 : 1
    return [...history].sort(
      (a, b) => dir * (Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    )
  }, [history, sortOrder])

  const clearAnalysis = useCallback(() => {
    setCurrentResult(null)
    setPreviewUrl(null)
    setAnalysisStage('idle')
  }, [])

  const saveResult = useCallback((result: AnalysisResult) => {
    const safe = toHistorySafe(result)
    setHistory((rows) => (rows.some((r) => r.id === safe.id) ? rows : [safe, ...rows]))
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

      try {
        const detection = await activeDetector.analyze(file, signal, setAnalysisStage)
        if (signal?.aborted) throw new DOMException('Analysis aborted', 'AbortError')

        revokePreview(preview)
        setPreviewUrl(null)

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
        }
        setCurrentResult(result)
        setAnalysisStage('completed')
      } catch (err) {
        setAnalysisStage('failed')
        revokePreview(preview)
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
    [authState.user, authState.loading, activeDetector],
  )

  return (
    <AppStateContext.Provider
      value={{
        ...authState,
        history,
        sortOrder,
        setSortOrder,
        sortedHistory,
        deleteResult: (id) => setHistory((rows) => rows.filter((r) => r.id !== id)),
        currentResult,
        previewUrl,
        analyzing,
        analysisStage,
        analysisStageLabel: ANALYSIS_STAGE_LABELS[analysisStage],
        runAnalysis,
        saveResult,
        isSaved,
        clearAnalysis,
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
