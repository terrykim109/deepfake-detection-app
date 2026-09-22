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
    setHistory((rows) => (rows.some((r) => r.id === result.id) ? rows : [result, ...rows]))
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

      // Client-side validation first (reject before provider/network when possible)
      const local = await validateUploadSelection([file])
      if (!local.ok) throw new Error(local.message)

      const userId = authState.user.user_id

      const validated = await analysisApi.validate(userId, file)
      if (validated.error) throw new Error(validated.error)

      const started = await analysisApi.start(userId)
      if (started.error) throw new Error(started.error)

      analyzingRef.current = true
      setAnalyzing(true)

      try {
        const detection = await detector.analyze(file, signal)
        if (signal?.aborted) throw new DOMException('Analysis aborted', 'AbortError')

        const now = new Date()
        const result: AnalysisResult = {
          ...detection,
          id: `r_${now.getTime()}`,
          fileName: file.name,
          timestamp: formatTimestamp(now),
          createdAt: now.toISOString(),
        }
        setCurrentResult(result)
        setPreviewUrl(preview)
      } finally {
        analyzingRef.current = false
        setAnalyzing(false)
        await analysisApi.finish(userId)
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
