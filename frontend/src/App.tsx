
import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppStateProvider, useAppState } from './state/AppState'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { CreateAccount } from './pages/CreateAccount'
import { VerifyEmail } from './pages/VerifyEmail'
import { Profile } from './pages/Profile'
import { ForgotPassword } from './pages/ForgotPassword'
import { Upload } from './pages/Upload'
import { History } from './pages/History'
import { Results } from './pages/Results'
import { ResultDetail } from './pages/ResultDetail'
import { StyleGuide } from './pages/StyleGuide'
import { FullPageSpinner } from './components/ui'

/* ─── Auth Guards ─── */
const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, loading } = useAppState()
  if (loading) return <FullPageSpinner />
  return user ? children : <Navigate to="/login" replace />
}

const RedirectIfAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, loading } = useAppState()
  if (loading) return <FullPageSpinner />
  return user ? <Navigate to="/profile" replace /> : children
}

/* The landing page is only for visitors; signed-in users start on Analyze */
const LandingOrApp: React.FC = () => {
  const { user, loading } = useAppState()
  if (loading) return <FullPageSpinner />
  return user ? <Navigate to="/upload" replace /> : <Landing />
}

/* ─── Router ─── */
const AppRoutes: React.FC = () => (
  <Routes>
    <Route path="/login" element={<RedirectIfAuth><Login /></RedirectIfAuth>} />
    <Route path="/create-account" element={<RedirectIfAuth><CreateAccount /></RedirectIfAuth>} />
    <Route path="/verify-email" element={<RedirectIfAuth><VerifyEmail /></RedirectIfAuth>} />
    <Route path="/forgot-password" element={<RedirectIfAuth><ForgotPassword /></RedirectIfAuth>} />
    <Route path="/profile" element={<RequireAuth><Profile /></RequireAuth>} />
    <Route path="/upload" element={<RequireAuth><Upload /></RequireAuth>} />
    <Route path="/results" element={<RequireAuth><Results /></RequireAuth>} />
    <Route path="/history" element={<RequireAuth><History /></RequireAuth>} />
    <Route path="/result/:id" element={<RequireAuth><ResultDetail /></RequireAuth>} />
    {/* Design-system reference for the team — public, not linked in the nav */}
    <Route path="/styleguide" element={<StyleGuide />} />
    <Route path="/" element={<LandingOrApp />} />
    <Route path="*" element={<Navigate to="/" replace />} />
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
