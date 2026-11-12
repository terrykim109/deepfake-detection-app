import React from 'react'
import { Link } from 'react-router-dom'
import { ImageIcon, ShieldCheckIcon, ShieldIcon } from '../components/ui'

const STEPS = [
  { Icon: ImageIcon, label: 'Upload a photo' },
  { Icon: ShieldCheckIcon, label: 'Get a clear verdict' },
  { Icon: ShieldIcon, label: 'Photos are never saved' },
]

/* First screen for logged-out visitors (logged-in users are sent to
   /upload by the route). Figma: section "Landing page (Nat), logged-out
   first screen", frames "Landing v2". */
export const Landing: React.FC = () => (
  <div className="landing">
    <header className="landing-nav">
      <Link to="/" className="landing-brand">
        <span className="landing-brand__mark" aria-hidden="true">
          <img src="/logo.png" alt="" />
        </span>
        Deepfake Detection
      </Link>
      <Link to="/login" className="landing-login">
        Log in
      </Link>
    </header>

    <main>
      <section className="landing-hero" aria-labelledby="landing-title">
        {/* Decorative: the AI-generated face with an analysis mesh */}
        <img className="landing-hero__image" src="/assets/landing-hero.jpg" alt="" />
        <div className="landing-hero__copy">
          <h1 id="landing-title" className="landing-title">Deepfake Detection</h1>
          <p className="landing-tagline">Not every photo is real. Check first.</p>
          <Link to="/create-account" className="ui-btn ui-btn--lg landing-hero__cta">
            Create account
          </Link>
        </div>
      </section>

      <section className="landing-explainer" aria-label="How it works">
        <p className="landing-lead">
          Edited and AI-made photos are easy to miss. Upload one and get a clear verdict, a confidence
          score and a plain-language reason why.
        </p>
        <ul className="landing-steps">
          {STEPS.map(({ Icon, label }) => (
            <li key={label}>
              <Icon />
              {label}
            </li>
          ))}
        </ul>
        <Link to="/create-account" className="ui-btn ui-btn--primary ui-btn--lg landing-explainer__cta">
          Create account
        </Link>
      </section>
    </main>

    <footer className="landing-footer">
      <p>A screening tool, not forensic proof.</p>
      <p>© 2026 Deepfake Detection</p>
    </footer>
  </div>
)
