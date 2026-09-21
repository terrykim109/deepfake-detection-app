import React, { createContext, useContext, useMemo, useState } from 'react'
import { useAuth, type AuthState, type AuthActions } from './useAuth'
import { HISTORY_SEED, type AnalysisResult } from '../data/mock'

export type SortOrder = 'newest' | 'oldest'

type AppStateValue = AuthState & AuthActions & {
  history: AnalysisResult[]
  sortOrder: SortOrder
  setSortOrder: (order: SortOrder) => void
  sortedHistory: AnalysisResult[]
  deleteResult: (id: string) => void
}

const AppStateContext = createContext<AppStateValue | null>(null)

export const AppStateProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const authState = useAuth()
  const [history, setHistory] = useState<AnalysisResult[]>(HISTORY_SEED)
  const [sortOrder, setSortOrder] = useState<SortOrder>('newest')

  const sortedHistory = useMemo(() => {
    const dir = sortOrder === 'newest' ? -1 : 1
    return [...history].sort(
      (a, b) => dir * (Date.parse(a.createdAt) - Date.parse(b.createdAt)),
    )
  }, [history, sortOrder])

  return (
    <AppStateContext.Provider
      value={{
        ...authState,
        history,
        sortOrder,
        setSortOrder,
        sortedHistory,
        deleteResult: (id) =>
          setHistory((rows) => rows.filter((r) => r.id !== id)),
      }}
    >
      {children}
    </AppStateContext.Provider>
  )}

export const useAppState = (): AppStateValue => {
  const ctx = useContext(AppStateContext)
  if (!ctx) throw new Error('useAppState must be used inside AppStateProvider')
  return ctx
}
