import React from 'react'
import { NavLink, Outlet } from 'react-router-dom'
import { AppShell } from './AppShell'

/** Internal Admin area chrome: Overview + Content Management. */
export const AdminLayout: React.FC = () => (
  <AppShell>
    <div className="admin-layout">
      <nav className="admin-subnav" aria-label="Admin">
        <p className="admin-subnav__label">Admin</p>
        <NavLink
          to="/dashboard"
          end
          className={({ isActive }) =>
            isActive ? 'admin-subnav__link admin-subnav__link--active' : 'admin-subnav__link'
          }
        >
          Overview
        </NavLink>
        <p className="admin-subnav__group">Content Management</p>
        <NavLink
          to="/dashboard/content/landing"
          className={({ isActive }) =>
            isActive ? 'admin-subnav__link admin-subnav__link--active' : 'admin-subnav__link'
          }
        >
          Landing Page
        </NavLink>
        <NavLink
          to="/dashboard/content/about"
          className={({ isActive }) =>
            isActive ? 'admin-subnav__link admin-subnav__link--active' : 'admin-subnav__link'
          }
        >
          About Us
        </NavLink>
      </nav>
      <div className="admin-layout__main">
        <Outlet />
      </div>
    </div>
  </AppShell>
)
