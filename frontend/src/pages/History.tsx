import React, { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AppShell } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { useAppState, type SortOrder } from '../state/AppState'
import { Button, Card, EmptyState, IconButton, PageHeader, Select, Toast, TrashIcon, VerdictBadge } from '../components/ui'

const SORT_OPTIONS = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
]

/* Figma frames "History" (3:188), "Sorting" (126:162),
   "DeletePopUp" (156:118) and "Deleted History" (117:101) — one screen
   with a sort control, a delete confirmation and a success banner. */
export const History: React.FC = () => {
  const navigate = useNavigate()
  const { sortedHistory, sortOrder, setSortOrder, deleteResult } = useAppState()
  const [pendingDelete, setPendingDelete] = useState<string | null>(null)
  const [showDeleted, setShowDeleted] = useState(false)
  const toastTimer = useRef<number>()

  useEffect(() => () => window.clearTimeout(toastTimer.current), [])

  const confirmDelete = () => {
    if (pendingDelete) deleteResult(pendingDelete)
    setPendingDelete(null)
    setShowDeleted(true)
    /* Restart the timer so a second delete gets a full toast rather than
       inheriting the tail of the first one. */
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setShowDeleted(false), 2400)
  }

  const open = (id: string) => navigate(`/result/${id}`)

  return (
    <AppShell>
      {showDeleted && <Toast message="Successfully Deleted!" />}

      <PageHeader
        title="History"
        actions={
          <Select
            label="Sort by"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value as SortOrder)}
            options={SORT_OPTIONS}
          />
        }
      />

      <Card className="history-card" padding="md">
        {sortedHistory.length === 0 ? (
          <EmptyState icon="/assets/icon-file.svg" message="No saved results yet." />
        ) : (
          <ul className="history-list">
            {sortedHistory.map((row) => (
              <Card as="li" padding="none" interactive className="history-row" key={row.id}>
                {/* Whole-row button opens the result; delete is a sibling so
                    controls are never nested (WCAG 4.1.2). */}
                <button
                  type="button"
                  className="history-row-open"
                  onClick={() => open(row.id)}
                  aria-label={`Open result for ${row.fileName}`}
                >
                  <span className="history-row-info">
                    <span className="history-row-name">{row.fileName}</span>
                    <span className="history-row-meta">
                      <VerdictBadge verdict={row.verdict} label={row.verdictLabel} size="sm" />
                      <span>{row.confidence}% confidence</span>
                    </span>
                    <span className="history-row-time">{row.timestamp}</span>
                  </span>
                </button>

                <IconButton
                  className="history-row-delete"
                  icon="/assets/icon-x-octagon.svg"
                  label={`Delete ${row.fileName}`}
                  onClick={() => setPendingDelete(row.id)}
                />
              </Card>
            ))}
          </ul>
        )}
      </Card>

      {pendingDelete && (
        <Modal
          title="Delete Result?"
          subtitle="This result will be permanently deleted. This can't be undone."
          icon={<TrashIcon />}
          tone="danger"
          onClose={() => setPendingDelete(null)}
          actions={
            <>
              <Button variant="ghost" onClick={() => setPendingDelete(null)}>
                Cancel
              </Button>
              <Button variant="danger" onClick={confirmDelete}>
                Delete
              </Button>
            </>
          }
        />
      )}
    </AppShell>
  )
}
