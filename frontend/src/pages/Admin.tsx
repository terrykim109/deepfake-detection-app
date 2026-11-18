import React, { useEffect, useState } from 'react'
import { AppShell } from '../components/AppShell'
import {
  adminApi,
  type AdminAnalysis,
  type AdminAnalysisDetail,
  type AdminInterval,
  type AdminUsageResponse,
  type AdminUsersResponse,
} from '../api/client'
import { Alert, Card, EmptyState, PageHeader, Select, Spinner } from '../components/ui'
import { Modal } from '../components/Modal'

const INTERVAL_OPTIONS = [
  { value: 'daily', label: 'Daily' },
  { value: 'weekly', label: 'Weekly' },
  { value: 'monthly', label: 'Monthly' },
]
type AnalysisFilter = 'all' | 'successful' | 'failed'
type UserFilter = 'all' | 'verified' | 'unverified'
type SortDirection = 'asc' | 'desc'
type AnalysisSortKey = 'analysis' | 'user' | 'status' | 'completed' | 'confidence'
type UserSortKey = 'email' | 'createdAt' | 'lastLogin' | 'verification' | 'role' | 'status'
type SortState<Key extends string> = { key: Key; direction: SortDirection }

function toggleSort<Key extends string>(current: SortState<Key>, key: Key): SortState<Key> {
  return current.key === key
    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: 'asc' }
}

function sortArrow<Key extends string>(sort: SortState<Key>, key: Key): string {
  return sort.key === key ? (sort.direction === 'asc' ? ' ↑' : ' ↓') : ''
}

function sortAria<Key extends string>(sort: SortState<Key>, key: Key): 'none' | 'ascending' | 'descending' {
  if (sort.key !== key) return 'none'
  return sort.direction === 'asc' ? 'ascending' : 'descending'
}

function compareText(left: string | null | undefined, right: string | null | undefined): number {
  return (left || '').localeCompare(right || '', undefined, { sensitivity: 'base' })
}

function compareDate(left: string | null, right: string | null): number {
  const leftTime = left ? Date.parse(left) : Number.NEGATIVE_INFINITY
  const rightTime = right ? Date.parse(right) : Number.NEGATIVE_INFINITY
  return leftTime - rightTime
}

function formatDate(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

function formatDateTime(value: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
}

function formatPipelineStatus(value: string | null): string {
  if (!value) return '—'
  if (['ok', 'empty', 'success', 'completed'].includes(value.toLowerCase())) return 'Completed'
  if (['error', 'failed', 'failure'].includes(value.toLowerCase())) return 'Failed'
  return value
}

function getAnalysisPeriod(analysis: AdminAnalysis, interval: AdminInterval): string | null {
  const timestamp = analysis.completedAt || analysis.createdAt
  if (!timestamp) return null
  const date = new Date(timestamp)
  if (Number.isNaN(date.getTime())) return null
  const year = date.getUTCFullYear()
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  if (interval === 'monthly') return `${year}-${month}`
  if (interval === 'weekly') {
    const monday = new Date(Date.UTC(year, date.getUTCMonth(), date.getUTCDate()))
    const weekday = monday.getUTCDay() || 7
    monday.setUTCDate(monday.getUTCDate() - weekday + 1)
    return monday.toISOString().slice(0, 10)
  }
  return `${year}-${month}-${day}`
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

function UsageChart({
  usage,
  onBucketClick,
}: {
  usage: AdminUsageResponse
  onBucketClick: (period: string) => void
}) {
  const max = Math.max(...usage.buckets.map((bucket) => bucket.totalAnalyses), 1)
  if (usage.buckets.length === 0) {
    return <EmptyState icon="/assets/icon-file.svg" message="No analysis activity recorded yet." />
  }

  return (
    <div className="admin-chart-wrap">
      <div className="admin-chart" role="img" aria-label={`${usage.interval} analysis usage chart`}>
        {usage.buckets.map((bucket) => (
          <button
            className="admin-chart__column"
            key={bucket.period}
            type="button"
            onClick={() => onBucketClick(bucket.period)}
            title={`View analyses for ${formatPeriod(bucket.period, usage.interval)}`}
          >
            <span className="admin-chart__value">{bucket.totalAnalyses}</span>
            <div className="admin-chart__track">
              <div
                className="admin-chart__bar"
                style={{ height: `${Math.max((bucket.totalAnalyses / max) * 100, 4)}%` }}
                title={`${formatPeriod(bucket.period, usage.interval)}: ${bucket.totalAnalyses} analyses`}
              />
            </div>
            <span className="admin-chart__label">{formatPeriod(bucket.period, usage.interval)}</span>
          </button>
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
  const [analysisPeriod, setAnalysisPeriod] = useState<string | null>(null)
  const [analysisSort, setAnalysisSort] = useState<SortState<AnalysisSortKey>>({
    key: 'completed',
    direction: 'desc',
  })
  const [userFilter, setUserFilter] = useState<UserFilter>('all')
  const [userSort, setUserSort] = useState<SortState<UserSortKey>>({
    key: 'createdAt',
    direction: 'desc',
  })
  const [usageError, setUsageError] = useState('')
  const [usersError, setUsersError] = useState('')
  const [analysesError, setAnalysesError] = useState('')
  const [loadingUsage, setLoadingUsage] = useState(true)
  const [loadingUsers, setLoadingUsers] = useState(true)
  const [loadingAnalyses, setLoadingAnalyses] = useState(true)
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null)
  const [analysisDetail, setAnalysisDetail] = useState<AdminAnalysisDetail | null>(null)
  const [analysisDetailError, setAnalysisDetailError] = useState('')
  const [loadingAnalysisDetail, setLoadingAnalysisDetail] = useState(false)

  useEffect(() => {
    if (!selectedAnalysisId) {
      setAnalysisDetail(null)
      setAnalysisDetailError('')
      return
    }
    let active = true
    setLoadingAnalysisDetail(true)
    setAnalysisDetailError('')
    void adminApi.analysisDetail(selectedAnalysisId).then((response) => {
      if (!active) return
      if (response.error || !response.data) {
        setAnalysisDetail(null)
        setAnalysisDetailError(response.error || 'Could not load analysis details.')
      } else {
        setAnalysisDetail(response.data)
      }
      setLoadingAnalysisDetail(false)
    })
    return () => {
      active = false
    }
  }, [selectedAnalysisId])

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
    setAnalysisPeriod(null)
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

  const visibleUsers = users?.users.filter((account) => {
    if (userFilter === 'verified') return account.isVerified
    if (userFilter === 'unverified') return !account.isVerified
    return true
  }) ?? []
  const userEmails = new Map(users?.users.map((account) => [account.userId, account.email]) ?? [])
  const latestBucket = usage?.buckets.length
    ? usage.buckets[usage.buckets.length - 1]
    : null
  const activePeriod = analysisPeriod ?? latestBucket?.period ?? null
  const periodAnalyses = latestBucket
    ? analyses.filter((analysis) => getAnalysisPeriod(analysis, interval) === activePeriod)
    : []
  const visibleAnalyses = periodAnalyses.filter((analysis) => {
    if (analysisFilter === 'successful') return ['success', 'completed'].includes(analysis.status)
    if (analysisFilter === 'failed') return !['success', 'completed'].includes(analysis.status)
    return true
  })
  const sortedAnalyses = [...visibleAnalyses].sort((left, right) => {
    let comparison = 0
    if (analysisSort.key === 'analysis') comparison = compareText(left.requestId, right.requestId)
    if (analysisSort.key === 'user') {
      comparison = compareText(userEmails.get(left.userId) || left.userId, userEmails.get(right.userId) || right.userId)
    }
    if (analysisSort.key === 'status') comparison = compareText(left.status || 'unknown', right.status || 'unknown')
    if (analysisSort.key === 'completed') comparison = compareDate(left.completedAt || left.createdAt, right.completedAt || right.createdAt)
    if (analysisSort.key === 'confidence') comparison = (left.confidence ?? -1) - (right.confidence ?? -1)
    if (comparison === 0) comparison = compareText(left.requestId, right.requestId)
    return analysisSort.direction === 'asc' ? comparison : -comparison
  })
  const sortedUsers = [...visibleUsers].sort((left, right) => {
    let comparison = 0
    if (userSort.key === 'email') comparison = compareText(left.email, right.email)
    if (userSort.key === 'createdAt') comparison = compareDate(left.createdAt, right.createdAt)
    if (userSort.key === 'lastLogin') comparison = compareDate(left.lastLogin, right.lastLogin)
    if (userSort.key === 'verification') comparison = Number(left.isVerified) - Number(right.isVerified)
    if (userSort.key === 'role') comparison = compareText(left.role, right.role)
    if (userSort.key === 'status') comparison = compareText(left.status, right.status)
    if (comparison === 0) comparison = compareText(left.userId, right.userId)
    return userSort.direction === 'asc' ? comparison : -comparison
  })

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
                <button className="admin-stat-button" type="button" onClick={() => { setAnalysisPeriod(latestBucket?.period ?? null); setAnalysisFilter('all'); setAnalysisView('list') }}>
                  <Card className="admin-stat" padding="md" interactive={analysisView === 'list' && analysisFilter === 'all'}>
                  <p className="admin-stat__label">Total analyses</p>
                  <p className="admin-stat__value">{latestBucket?.totalAnalyses ?? 0}</p>
                  </Card>
                </button>
                <button className="admin-stat-button" type="button" onClick={() => { setAnalysisPeriod(latestBucket?.period ?? null); setAnalysisFilter('successful'); setAnalysisView('list') }}>
                  <Card className="admin-stat" padding="md" interactive={analysisFilter === 'successful'}>
                  <p className="admin-stat__label">Successful</p>
                  <p className="admin-stat__value">{latestBucket?.successfulAnalyses ?? 0}</p>
                  </Card>
                </button>
                <button className="admin-stat-button" type="button" onClick={() => { setAnalysisPeriod(latestBucket?.period ?? null); setAnalysisFilter('failed'); setAnalysisView('list') }}>
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
                    <UsageChart usage={usage} onBucketClick={(period) => { setAnalysisPeriod(period); setAnalysisFilter('all'); setAnalysisView('list') }} />
                  </>
                ) : (
                  <>
                    <div className="admin-panel-heading">
                      <h3 className="admin-subtitle">
                        {analysisFilter === 'all' ? 'All analyses' : analysisFilter === 'successful' ? 'Successful analyses' : 'Failed analyses'} ({activePeriod ? formatPeriod(activePeriod, interval) : 'selected period'})
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
                          <thead><tr>
                            <th aria-sort={sortAria(analysisSort, 'analysis')}><button className="admin-sort-button" type="button" onClick={() => setAnalysisSort((sort) => toggleSort(sort, 'analysis'))}>Analysis{sortArrow(analysisSort, 'analysis')}</button></th>
                            <th aria-sort={sortAria(analysisSort, 'user')}><button className="admin-sort-button" type="button" onClick={() => setAnalysisSort((sort) => toggleSort(sort, 'user'))}>User{sortArrow(analysisSort, 'user')}</button></th>
                            <th aria-sort={sortAria(analysisSort, 'status')}><button className="admin-sort-button" type="button" onClick={() => setAnalysisSort((sort) => toggleSort(sort, 'status'))}>Status{sortArrow(analysisSort, 'status')}</button></th>
                            <th aria-sort={sortAria(analysisSort, 'completed')}><button className="admin-sort-button" type="button" onClick={() => setAnalysisSort((sort) => toggleSort(sort, 'completed'))}>Completed{sortArrow(analysisSort, 'completed')}</button></th>
                            <th aria-sort={sortAria(analysisSort, 'confidence')}><button className="admin-sort-button" type="button" onClick={() => setAnalysisSort((sort) => toggleSort(sort, 'confidence'))}>Confidence{sortArrow(analysisSort, 'confidence')}</button></th>
                          </tr></thead>
                          <tbody>{sortedAnalyses.map((analysis) => (
                            <tr key={analysis.requestId}>
                              <td>
                                <button
                                  className="admin-analysis-link"
                                  type="button"
                                  onClick={() => setSelectedAnalysisId(analysis.requestId)}
                                >
                                  {analysis.requestId}
                                </button>
                              </td>
                              <td>{userEmails.get(analysis.userId) || analysis.userId || '—'}</td>
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
                        <tr>
                          <th aria-sort={sortAria(userSort, 'email')}><button className="admin-sort-button" type="button" onClick={() => setUserSort((sort) => toggleSort(sort, 'email'))}>Email{sortArrow(userSort, 'email')}</button></th>
                          <th aria-sort={sortAria(userSort, 'createdAt')}><button className="admin-sort-button" type="button" onClick={() => setUserSort((sort) => toggleSort(sort, 'createdAt'))}>Registration date{sortArrow(userSort, 'createdAt')}</button></th>
                          <th aria-sort={sortAria(userSort, 'verification')}><button className="admin-sort-button" type="button" onClick={() => setUserSort((sort) => toggleSort(sort, 'verification'))}>Verification{sortArrow(userSort, 'verification')}</button></th>
                          <th aria-sort={sortAria(userSort, 'role')}><button className="admin-sort-button" type="button" onClick={() => setUserSort((sort) => toggleSort(sort, 'role'))}>Role{sortArrow(userSort, 'role')}</button></th>
                          <th aria-sort={sortAria(userSort, 'lastLogin')}><button className="admin-sort-button" type="button" onClick={() => setUserSort((sort) => toggleSort(sort, 'lastLogin'))}>Last login{sortArrow(userSort, 'lastLogin')}</button></th>
                          <th aria-sort={sortAria(userSort, 'status')}><button className="admin-sort-button" type="button" onClick={() => setUserSort((sort) => toggleSort(sort, 'status'))}>Status{sortArrow(userSort, 'status')}</button></th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortedUsers.map((account) => (
                          <tr key={account.userId}>
                            <td>{account.email || '—'}</td>
                            <td>{formatDate(account.createdAt)}</td>
                            <td>{account.isVerified ? 'Verified' : 'Unverified'}</td>
                            <td><span className={account.role === 'admin' ? 'admin-role admin-role--admin' : 'admin-role'}>{account.role}</span></td>
                            <td>{formatDate(account.lastLogin)}</td>
                            <td>{account.status === 'active' ? 'Active' : 'Disabled'}</td>
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
      {selectedAnalysisId ? (
        <Modal
          title="Analysis details"
          subtitle={selectedAnalysisId}
          tone={analysisDetail?.status === 'success' || analysisDetail?.status === 'completed' ? 'success' : 'danger'}
          onClose={() => setSelectedAnalysisId(null)}
        >
          {loadingAnalysisDetail ? (
            <div className="admin-inline-loading"><Spinner /><span>Loading details…</span></div>
          ) : analysisDetailError ? (
            <Alert tone="error">{analysisDetailError}</Alert>
          ) : analysisDetail ? (
            <dl className="admin-detail-grid">
              <div className="admin-detail-grid__full"><dt>User</dt><dd>{analysisDetail.email || analysisDetail.userId || '—'}</dd></div>
              <div><dt>Status</dt><dd>{analysisDetail.status || 'Unknown'}</dd></div>
              <div><dt>Confidence</dt><dd>{analysisDetail.confidence == null ? '—' : `${analysisDetail.confidence}%`}</dd></div>
              <div><dt>Started</dt><dd>{formatDateTime(analysisDetail.startedAt || analysisDetail.createdAt)}</dd></div>
              <div><dt>Completed</dt><dd>{formatDateTime(analysisDetail.completedAt)}</dd></div>
              <div><dt>Reverse search</dt><dd>{formatPipelineStatus(analysisDetail.reverseSearchStatus)}</dd></div>
              <div><dt>Forensics</dt><dd>{formatPipelineStatus(analysisDetail.forensicsStatus)}</dd></div>
              {!['success', 'completed'].includes(analysisDetail.status)
                ? analysisDetail.diagnosticError
                  ? (
                      <div className="admin-detail-grid__full">
                        <dt>Failure Details</dt>
                        <dd>{analysisDetail.diagnosticError}</dd>
                      </div>
                    )
                  : analysisDetail.error
                    ? (
                        <div className="admin-detail-grid__full">
                          <dt>Error</dt>
                          <dd>{analysisDetail.error}</dd>
                        </div>
                      )
                    : null
                : null}
            </dl>
          ) : null}
        </Modal>
      ) : null}
    </AppShell>
  )
}
