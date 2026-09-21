
import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AppStateProvider, useAppState } from './state/AppState'
import { Login } from './pages/Login'
import { CreateAccount } from './pages/CreateAccount'
import { Profile } from './pages/Profile'
import { Upload } from './pages/Upload'
import { History } from './pages/History'

/* ─── Auth Guards ─── */
const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, loading } = useAppState()
  if (loading) return <div className="loading-full"><span className="spinner" /></div>
  return user ? children : <Navigate to="/login" replace />
}

const RedirectIfAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, loading } = useAppState()
  if (loading) return <div className="loading-full"><span className="spinner" /></div>
  return user ? <Navigate to="/profile" replace /> : children
}

/* ─── Router ─── */
const AppRoutes: React.FC = () => (
  <Routes>
    <Route path="/login" element={<RedirectIfAuth><Login /></RedirectIfAuth>} />
    <Route path="/create-account" element={<RedirectIfAuth><CreateAccount /></RedirectIfAuth>} />
    <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
    <Route path="/upload" element={<RequireAuth><Upload /></RequireAuth>} />
    <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
    <Route path="/" element={<Navigate to="/profile" replace />} />
    <Route path="*" element={<Navigate to="/profile" replace />} />
  </Routes>
)

const App: React.FC = () => (
  <AppStateProvider>
    {/* <BrowserRouter> */}
      <AppRoutes />
    {/* </BrowserRouter> */}
  </AppStateProvider>
)

export default App
