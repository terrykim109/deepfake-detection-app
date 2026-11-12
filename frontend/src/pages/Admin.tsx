import React, { useEffect, useState } from 'react'
import { AppShell } from '../components/AppShell'
import {
  adminApi,
  type AdminAnalysis,
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
type AnalysisFilter = 'all' | 'successful' | 'failed'
type UserFilter = 'all' | 'verified' | 'unverified'

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
  const [analyses, setAnalyses] = useState<AdminAnalysis[]>([])
  const [analysisFilter, setAnalysisFilter] = useState<AnalysisFilter>('all')
  const [analysisView, setAnalysisView] = useState<'chart' | 'list'>('chart')
  const [userFilter, setUserFilter] = useState<UserFilter>('all')
  const [usageError, setUsageError] = useState('')
  const [usersError, setUsersError] = useState('')
  const [analysesError, setAnalysesError] = useState('')
  const [loadingUsage, setLoadingUsage] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingAnalyses, setLoadingAnalyses] = useState(true)

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
    void adminApi.analyses().then((response) => {
      if (!active) return
      if (response.error || !response.data) {
        setAnalysesError(response.error || 'Could not load analyses.')
      } else {
        setAnalyses(response.data.analyses)
      }
      setLoadingAnalyses(false)
    })
    return () => {
      active = false
    }
  }, [])

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

  const visibleAnalyses = analyses.filter((analysis) => {
    if (analysisFilter === 'successful') return ['success', 'completed'].includes(analysis.status)
    if (analysisFilter === 'failed') return !['success', 'completed'].includes(analysis.status)
    return true
  })
  const visibleUsers = users?.users.filter((account) => {
    if (userFilter === 'verified') return account.isVerified
    if (userFilter === 'unverified') return !account.isVerified
    return true
  }) ?? []
  const latestBucket = usage?.buckets.length
    ? usage.buckets[usage.buckets.length - 1]
    : null

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
                <button className="admin-stat-button" type="button" onClick={() => { setAnalysisFilter('all'); setAnalysisView('list') }}>
                  <Card className="admin-stat" padding="md" interactive={analysisView === 'list' && analysisFilter === 'all'}>
                  <p className="admin-stat__label">Total analyses</p>
                  <p className="admin-stat__value">{latestBucket?.totalAnalyses ?? 0}</p>
                  </Card>
                </button>
                <button className="admin-stat-button" type="button" onClick={() => { setAnalysisFilter('successful'); setAnalysisView('list') }}>
                  <Card className="admin-stat" padding="md" interactive={analysisFilter === 'successful'}>
                  <p className="admin-stat__label">Successful</p>
                  <p className="admin-stat__value">{latestBucket?.successfulAnalyses ?? 0}</p>
                  </Card>
                </button>
                <button className="admin-stat-button" type="button" onClick={() => { setAnalysisFilter('failed'); setAnalysisView('list') }}>
                  <Card className="admin-stat" padding="md" interactive={analysisFilter === 'failed'}>
                  <p className="admin-stat__label">Failed</p>
                  <p className="admin-stat__value">{latestBucket?.failedAnalyses ?? 0}</p>
                  </Card>
                </button>
              </div>
              <Card className="admin-chart-card" padding="md">
                {analysisView === 'chart' ? (
                  <>
                    <h3 className="admin-subtitle">Analysis activity ({usage.interval})</h3>
                    <UsageChart usage={usage} />
                  </>
                ) : (
                  <>
                    <div className="admin-panel-heading">
                      <h3 className="admin-subtitle">
                        {analysisFilter === 'all' ? 'All analyses' : analysisFilter === 'successful' ? 'Successful analyses' : 'Failed analyses'}
                      </h3>
                      <button className="admin-view-chart-button" type="button" onClick={() => setAnalysisView('chart')}>
                        Back to chart
                      </button>
                    </div>
                    {analysesError ? <Alert tone="error">{analysesError}</Alert> : null}
                    {loadingAnalyses ? <div className="admin-inline-loading"><Spinner /><span>Loading analyses…</span></div> : visibleAnalyses.length === 0 ? (
                      <EmptyState icon="/assets/icon-file.svg" message="No matching analyses found." />
                    ) : (
                      <div className="admin-table-wrap">
                        <table className="admin-table">
                          <thead><tr><th>Analysis</th><th>Status</th><th>Completed</th><th>Confidence</th></tr></thead>
                          <tbody>{visibleAnalyses.map((analysis) => (
                            <tr key={analysis.requestId}>
                              <td>{analysis.requestId}</td>
                              <td>{analysis.status || 'Unknown'}</td>
                              <td>{formatDate(analysis.completedAt || analysis.createdAt)}</td>
                              <td>{analysis.confidence == null ? '—' : `${analysis.confidence}%`}</td>
                            </tr>
                          ))}</tbody>
                        </table>
                      </div>
                    )}
                  </>
                )}
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
                <button className="admin-stat-button" type="button" onClick={() => setUserFilter('all')}>
                  <Card className="admin-stat" padding="md" interactive={userFilter === 'all'}>
                  <p className="admin-stat__label">Registered users</p>
                  <p className="admin-stat__value">{users.totalUsers}</p>
                  </Card>
                </button>
                <button className="admin-stat-button" type="button" onClick={() => setUserFilter('verified')}>
                  <Card className="admin-stat" padding="md" interactive={userFilter === 'verified'}>
                  <p className="admin-stat__label">Verified</p>
                  <p className="admin-stat__value">{users.verifiedUsers}</p>
                  </Card>
                </button>
                <button className="admin-stat-button" type="button" onClick={() => setUserFilter('unverified')}>
                  <Card className="admin-stat" padding="md" interactive={userFilter === 'unverified'}>
                  <p className="admin-stat__label">Unverified</p>
                  <p className="admin-stat__value">{users.unverifiedUsers}</p>
                  </Card>
                </button>
              </div>
              {visibleUsers.length === 0 ? (
                <EmptyState icon="/assets/icon-file.svg" message="No matching users found." />
              ) : (
                <Card className="admin-table-card" padding="md">
                  <div className="admin-table-wrap">
                    <table className="admin-table">
                      <thead>
                        <tr><th>Email</th><th>Registration date</th><th>Verification</th><th>Role</th></tr>
                      </thead>
                      <tbody>
                        {visibleUsers.map((account) => (
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
