import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { useAuth, type AuthState, type AuthActions } from './useAuth'
import { HISTORY_SEED, type AnalysisResult } from '../data/mock'
import { mockDetector } from '../detection/mockDetector'
import type { Detector } from '../detection/detector'
import { analysisApi } from '../api/client'
import { validateUploadSelection } from '../upload/validateUpload'

export type SortOrder = 'newest' | 'oldest'

type AppStateValue = AuthState & AuthActions & {
  history: AnalysisResult[]
  sortOrder: SortOrder
  setSortOrder: (order: SortOrder) => void
  sortedHistory: AnalysisResult[]
  deleteResult: (id: string) => void
  currentResult: AnalysisResult | null
  /** Cleared after analysis — original image is never kept for history. */
  previewUrl: string | null
  analyzing: boolean
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

/** History may store the verdict only — never an image URL or bytes. */
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
}> = ({ children, detector = mockDetector }) => {
  const authState = useAuth()
  const [history, setHistory] = useState<AnalysisResult[]>(HISTORY_SEED)
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')
  const [currentResult, setCurrentResult] = useState<AnalysisResult | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
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

      const userId = authState.user.user_id

      const validated = await analysisApi.validate(userId, file)
      if (validated.error) throw new Error(validated.error)

      const started = await analysisApi.start(userId, file)
      if (started.error || !started.data?.image?.image_id) {
        throw new Error(
          started.error ||
            'We could not store your image for analysis. Nothing was kept — please try uploading again.',
        )
      }

      const imageId = started.data.image.image_id
      let settled = false
      analyzingRef.current = true
      setAnalyzing(true)

      const settle = async (outcome: 'success' | 'failure' | 'cancelled') => {
        if (settled) return null
        settled = true
        return analysisApi.finish(userId, imageId, outcome)
      }

      try {
        if (signal?.aborted) {
          throw new DOMException('Analysis aborted', 'AbortError')
        }

        const detection = await detector.analyze(file, signal)
        if (signal?.aborted) {
          throw new DOMException('Analysis aborted', 'AbortError')
        }

        const finished = await settle('success')
        if (finished?.error) {
          throw new Error(
            finished.error ||
              'Analysis finished but we could not confirm image deletion. Please try again.',
          )
        }

        revokePreview(preview)
        setPreviewUrl(null)

        const now = new Date()
        const privacy = finished?.data?.privacy
        const result: AnalysisResult = {
          ...detection,
          id: `r_${now.getTime()}`,
          fileName: file.name,
          timestamp: formatTimestamp(now),
          createdAt: now.toISOString(),
          imageDeleted: true,
          imageStoredAt: privacy?.stored_at ?? started.data.image.stored_at ?? null,
          imageDeletedAt: privacy?.deleted_at ?? null,
          privacyMessage:
            privacy?.message ||
            'Your original image has been deleted from our servers. Only this analysis result was kept.',
        }
        setCurrentResult(result)
      } catch (err) {
        const aborted =
          (err instanceof DOMException && err.name === 'AbortError') || Boolean(signal?.aborted)
        await settle(aborted ? 'cancelled' : 'failure')

        revokePreview(preview)
        setPreviewUrl(null)

        if (aborted) throw err

        const message =
          err instanceof Error
            ? err.message
            : 'Analysis could not be completed. Your image was deleted — please try uploading again.'
        throw new Error(
          /network|fetch|failed to fetch/i.test(message)
            ? 'The analysis service is unavailable right now. Your image was not kept — please try uploading again when the service is available.'
            : message.includes('deleted')
              ? message
              : `${message} Your original image has been deleted. You can upload again.`,
        )
      } finally {
        analyzingRef.current = false
        setAnalyzing(false)
      }
    },
    [authState.user, authState.loading, detector],
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
