import React from 'react'
import { AppShell } from '../components/AppShell'
import { Card, PageHeader, Spinner } from '../components/ui'

export const Admin: React.FC = () => (
  <AppShell>
    <PageHeader
      title="Dashboard"
      subtitle="Application usage and account access overview."
    />
    <div className="admin-sections">
      <Card className="admin-placeholder" padding="lg">
        <h2 className="admin-section__title">Usage Overview</h2>
        <div className="admin-placeholder__state">
          <Spinner />
          <p>Usage metrics will appear here.</p>
        </div>
      </Card>
      <Card className="admin-placeholder" padding="lg">
        <h2 className="admin-section__title">User &amp; Access Overview</h2>
        <div className="admin-placeholder__state">
          <Spinner />
          <p>User and access information will appear here.</p>
        </div>
      </Card>
    </div>
  </AppShell>
)
