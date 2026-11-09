import React, { useEffect, useState } from 'react'
import { AppShell } from '../components/AppShell'
import {
  adminApi,
  type AdminInterval,
  type AdminUsageResponse,
  type AdminUsersResponse,
} from '../api/client'
import { Alert, Card, EmptyState, PageHeader, Select, Spinner } from '../components/ui'

const INTERVAL_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatPeriod(period: string, interval: AdminInterval): string {
  if (interval === 'monthly') {
    const [year, month] = period.split('-').map(Number)
    if (!year || !month) return period
    return new Date(Date.UTC(year, month - 1, 1)).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      timeZone: 'UTC',
    })
  }

  const start = new Date(`${period}T00:00:00Z`)
  if (Number.isNaN(start.getTime())) return period

  if (interval === 'weekly') {
    const end = new Date(start)
    end.setUTCDate(end.getUTCDate() + 6)
    const startLabel = start.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      timeZone: 'UTC',
    })
    const endLabel = end.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      timeZone: 'UTC',
    })
    return `${startLabel} - ${endLabel}`
  }

  return start.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}

function UsageChart({ usage }: { usage: AdminUsageResponse }) {
  const max = Math.max(...usage.buckets.map((bucket) => bucket.totalAnalyses), 1)
  if (usage.buckets.length === 0) {
    return <EmptyState icon="/assets/icon-file.svg" message="No analysis activity recorded yet." />
  }

  return (
    <div className="admin-chart-wrap">
      <div className="admin-chart" role="img" aria-label={`${usage.interval} analysis usage chart`}>
        {usage.buckets.map((bucket) => (
          <div className="admin-chart__column" key={bucket.period}>
            <span className="admin-chart__value">{bucket.totalAnalyses}</span>
            <div className="admin-chart__track">
              <div
                className="admin-chart__bar"
                style={{ height: `${Math.max((bucket.totalAnalyses / max) * 100, 4)}%` }}
                title={`${formatPeriod(bucket.period, usage.interval)}: ${bucket.totalAnalyses} analyses`}
              />
            </div>
            <span className="admin-chart__label">{formatPeriod(bucket.period, usage.interval)}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export const Admin: React.FC = () => {
  const [interval, setInterval] = useState<AdminInterval>('daily')
  const [usage, setUsage] = useState<AdminUsageResponse | null>(null)
  const [users, setUsers] = useState<AdminUsersResponse | null>(null)
  const [usageError, setUsageError] = useState('')
  const [usersError, setUsersError] = useState('')
  const [loadingUsage, setLoadingUsage] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)

  useEffect(() => {
    let active = true
    setLoadingUsage(true)
    setUsageError('')
    void adminApi.usage(interval).then((response) => {
      if (!active) return
      if (response.error || !response.data) {
        setUsage(null)
        setUsageError(response.error || 'Could not load usage metrics.')
      } else {
        setUsage(response.data)
      }
      setLoadingUsage(false)
    })
    return () => {
      active = false
    }
  }, [interval])

  useEffect(() => {
    let active = true
    setLoadingUsers(true)
    setUsersError('')
    void adminApi.users().then((response) => {
      if (!active) return
      if (response.error || !response.data) {
        setUsers(null)
        setUsersError(response.error || 'Could not load users.')
      } else {
        setUsers(response.data)
      }
      setLoadingUsers(false)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <AppShell>
      <PageHeader
        title="Dashboard"
        subtitle="Application usage and account access overview."
        actions={
          <Select
            label="Interval"
            value={interval}
            onChange={(event) => setInterval(event.target.value as AdminInterval)}
            options={INTERVAL_OPTIONS}
          />
        }
      />

      <div className="admin-sections">
        <section className="admin-section" aria-labelledby="admin-usage-title">
          <div className="admin-section__heading">
            <h2 id="admin-usage-title" className="admin-section__title">Usage Overview</h2>
          </div>
          {usageError ? <Alert tone="error">{usageError}</Alert> : null}
          {loadingUsage ? (
            <Card className="admin-loading" padding="lg"><Spinner /><p>Loading usage metrics…</p></Card>
          ) : usage ? (
            <>
              <div className="admin-stats">
                <Card className="admin-stat" padding="md">
                  <p className="admin-stat__label">Total analyses</p>
                  <p className="admin-stat__value">{usage.totals.totalAnalyses}</p>
                </Card>
                <Card className="admin-stat" padding="md">
                  <p className="admin-stat__label">Successful</p>
                  <p className="admin-stat__value">{usage.totals.successfulAnalyses}</p>
                </Card>
                <Card className="admin-stat" padding="md">
                  <p className="admin-stat__label">Failed</p>
                  <p className="admin-stat__value">{usage.totals.failedAnalyses}</p>
                </Card>
              </div>
              <Card className="admin-chart-card" padding="md">
                <h3 className="admin-subtitle">Analysis activity ({usage.interval})</h3>
                <UsageChart usage={usage} />
              </Card>
            </>
          ) : null}
        </section>

        <section className="admin-section" aria-labelledby="admin-users-title">
          <h2 id="admin-users-title" className="admin-section__title">User &amp; Access Overview</h2>
          {usersError ? <Alert tone="error">{usersError}</Alert> : null}
          {loadingUsers ? (
            <Card className="admin-loading" padding="lg"><Spinner /><p>Loading user access information…</p></Card>
          ) : users ? (
            <>
              <div className="admin-stats">
                <Card className="admin-stat" padding="md">
                  <p className="admin-stat__label">Registered users</p>
                  <p className="admin-stat__value">{users.totalUsers}</p>
                </Card>
                <Card className="admin-stat" padding="md">
                  <p className="admin-stat__label">Verified</p>
                  <p className="admin-stat__value">{users.verifiedUsers}</p>
                </Card>
                <Card className="admin-stat" padding="md">
                  <p className="admin-stat__label">Unverified</p>
                  <p className="admin-stat__value">{users.unverifiedUsers}</p>
                </Card>
              </div>
              {users.users.length === 0 ? (
                <EmptyState icon="/assets/icon-file.svg" message="No registered users found." />
              ) : (
                <Card className="admin-table-card" padding="md">
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr><th>Email</th><th>Registration date</th><th>Verification</th><th>Role</th></tr>
                      </thead>
                      <tbody>
                        {users.users.map((account) => (
                          <tr key={account.userId}>
                            <td>{account.email || '—'}</td>
                            <td>{formatDate(account.createdAt)}</td>
                            <td>{account.isVerified ? 'Verified' : 'Unverified'}</td>
                            <td><span className={account.role === 'admin' ? 'admin-role admin-role--admin' : 'admin-role'}>{account.role}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </>
          ) : null}
        </section>
      </div>
    </AppShell>
  )
}
