import React from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { useAppState } from '../state/AppState'
import { IconButton } from './ui'
import { SettingsMenu } from './SettingsMenu'

export const Logo: React.FC<{ to?: string }> = ({ to = '/' }) => (
  <Link className="app-logo" to={to} aria-label="Deepfake Detection home">
    <img src="/assets/logo.png" alt="Deepfake Detection" />
  </Link>
)

const ANALYZE_PATHS = ['/upload', '/results']
const HISTORY_PATHS = ['/history', '/result/']

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { isAdmin } = useAppState()

  const analyzeActive = ANALYZE_PATHS.some((p) => pathname.startsWith(p))
  const historyActive = HISTORY_PATHS.some((p) => pathname.startsWith(p))
  const dashboardActive = pathname.startsWith('/dashboard')

  return (
    <div className="ui-container">
      <header className="app-header">
        <Logo to="/upload" />
        <div className="app-header__actions">
          <SettingsMenu />
          <IconButton
            className="app-account"
            icon="/assets/account-circle.svg"
            label="Account"
            onClick={() => navigate('/profile')}
            aria-current={pathname.startsWith('/profile') ? 'page' : undefined}
          />
        </div>
      </header>

      <nav className="nav-bar" aria-label="Main">
        <button
          type="button"
          className="nav-tab"
          aria-current={analyzeActive ? 'page' : undefined}
          onClick={() => navigate('/upload')}
        >
          Analyze
        </button>
        <button
          type="button"
          className="nav-tab"
          aria-current={historyActive ? 'page' : undefined}
          onClick={() => navigate('/history')}
        >
          History
        </button>
        {isAdmin ? (
          <button
            type="button"
            className="nav-tab"
            aria-current={dashboardActive ? 'page' : undefined}
            onClick={() => navigate('/dashboard')}
          >
            Dashboard
          </button>
        ) : null}
      </nav>

      <main>{children}</main>
    </div>
  )
}
