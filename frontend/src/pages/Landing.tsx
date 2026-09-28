import React from 'react'
import { useNavigate } from 'react-router-dom'
import { Logo } from '../components/AppShell'
import { Button, Card } from '../components/ui'

/* Figma frame "Landing Page" (node 3:182) */
export const Landing: React.FC = () => {
  const navigate = useNavigate()

  return (
    <div className="ui-container">
      <header className="app-header">
        <Logo to="/" />
      </header>

      <nav className="nav-bar" aria-label="Account">
        <div className="nav-auth">
          <Button size="sm" onClick={() => navigate('/create-account')}>
            Create Account
          </Button>
          <Button size="sm" onClick={() => navigate('/login')}>
            Log In
          </Button>
        </div>
      </nav>

      <main>
        <Card className="landing-card" padding="lg">
          <div className="landing-heading">
            <h1 className="l1">Not everything you see is real. Check first.</h1>
            <p className="l2">Create an account to securely analyze your images.</p>
          </div>

          <div className="landing-tiles">
            <div className="landing-tile landing-tile--real">REAL</div>
            <div className="landing-tile landing-tile--fake">Deepfake</div>
          </div>

          <div className="landing-cta">
            <Button size="lg" onClick={() => navigate('/create-account')}>
              Get Started
            </Button>
          </div>
        </Card>
      </main>
    </div>
  )
}
