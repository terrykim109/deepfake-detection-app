import React from 'react'
import { Link, NavLink } from 'react-router-dom'

/** Shared top bar for public marketing pages (landing, about). */
export const PublicNav: React.FC = () => (
  <header className="landing-nav">
    <Link to="/" className="landing-brand">
      <span className="landing-brand__mark" aria-hidden="true">
        <img src="/logo.png" alt="" />
      </span>
      Deepfake Detection
    </Link>
    <nav className="landing-nav__links" aria-label="Primary">
      <NavLink
        to="/about"
        className={({ isActive }) =>
          isActive ? 'landing-nav__link landing-nav__link--active' : 'landing-nav__link'
        }
      >
        About
      </NavLink>
      <Link to="/login" className="landing-login">
        Log in
      </Link>
    </nav>
  </header>
)
