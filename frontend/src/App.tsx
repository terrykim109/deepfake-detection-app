
import React from 'react'
import { Routes, Route, Navigate } from 'react-router-dom'
import { AppStateProvider, useAppState } from './state/AppState'
import { Landing } from './pages/Landing'
import { About } from './pages/About'
import { Login } from './pages/Login'
import { CreateAccount } from './pages/CreateAccount'
import { VerifyEmail } from './pages/VerifyEmail'
import { Profile } from './pages/Profile'
import { ForgotPassword } from './pages/ForgotPassword'
import { Upload } from './pages/Upload'
import { History } from './pages/History'
import { Results } from './pages/Results'
import { ResultDetail } from './pages/ResultDetail'
import { Learn } from './pages/Learn'
import { StyleGuide } from './pages/StyleGuide'
import { Admin } from './pages/Admin'
import { AdminLayout } from './components/AdminLayout'
import { LandingContentEditor } from './pages/admin/LandingContentEditor'
import { AboutContentEditor } from './pages/admin/AboutContentEditor'
import { LandingPreview } from './pages/admin/LandingPreview'
import { AboutPreview } from './pages/admin/AboutPreview'
import { FullPageSpinner } from './components/ui'

/* ─── Auth Guards ─── */
const RequireAuth: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, loading } = useAppState()
  if (loading) return <FullPageSpinner />
  return user ? children : <Navigate to="/login" replace />
}

const RequireAdmin: React.FC<{ children: React.ReactElement }> = ({ children }) => {
  const { user, loading, isAdmin } = useAppState()
  if (loading) return <FullPageSpinner />
  if (!user) return <Navigate to="/login" replace />
  return isAdmin ? children : <Navigate to="/profile" replace />
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
    <Route path="/learn" element={<RequireAuth><Learn /></RequireAuth>} />
    <Route
      path="/dashboard"
      element={
        <RequireAdmin>
          <AdminLayout />
        </RequireAdmin>
      }
    >
      <Route index element={<Admin />} />
      <Route path="content/landing" element={<LandingContentEditor />} />
      <Route path="content/about" element={<AboutContentEditor />} />
    </Route>
    <Route
      path="/dashboard/content/landing/preview"
      element={
        <RequireAdmin>
          <LandingPreview />
        </RequireAdmin>
      }
    />
    <Route
      path="/dashboard/content/about/preview"
      element={
        <RequireAdmin>
          <AboutPreview />
        </RequireAdmin>
      }
    />
    {/* Design-system reference for the team — public, not linked in the nav */}
    <Route path="/styleguide" element={<StyleGuide />} />
    <Route path="/about" element={<About />} />
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
