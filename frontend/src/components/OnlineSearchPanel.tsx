import React, { useMemo, useState } from 'react'
import type { OnlineSearchInfo, OnlineSearchHit } from '../detection/detector'

const PREVIEW_COUNT = 3

const MATCH_LABEL: Record<OnlineSearchHit['matchType'], string> = {
  exact: 'Exact match',
  visual: 'Visually similar',
  related: 'Related',
}

function matchClass(matchType: OnlineSearchHit['matchType']): string {
  if (matchType === 'exact') return 'online-search__badge online-search__badge--exact'
  if (matchType === 'visual') return 'online-search__badge online-search__badge--visual'
  return 'online-search__badge online-search__badge--related'
}

function ResultRow({ item }: { item: OnlineSearchHit }) {
  return (
    <li className="online-search__item">
      <div className="online-search__thumb" aria-hidden={!item.thumbnail}>
        {item.thumbnail ? (
          <img src={item.thumbnail} alt="" loading="lazy" referrerPolicy="no-referrer" />
        ) : (
          <span className="online-search__thumb-placeholder" />
        )}
      </div>
      <div className="online-search__meta">
        <span className={matchClass(item.matchType)}>{MATCH_LABEL[item.matchType]}</span>
        <a
          className="online-search__title"
          href={item.link}
          target="_blank"
          rel="noopener noreferrer"
        >
          {item.title}
        </a>
        <p className="online-search__source">{item.source || 'Unknown source'}</p>
      </div>
    </li>
  )
}

export const OnlineSearchPanel: React.FC<{ data: OnlineSearchInfo | null | undefined }> = ({
  data,
}) => {
  const [expanded, setExpanded] = useState(false)

  const results = data?.results ?? []
  const visible = useMemo(
    () => (expanded ? results : results.slice(0, PREVIEW_COUNT)),
    [expanded, results],
  )
  const canExpand = results.length > PREVIEW_COUNT

  const countLabel = (() => {
    if (!data || data.status === 'error') return null
    if (data.status === 'empty' || data.totalCount === 0) return '0 relevant results found'
    const n = data.totalCount
    return `${n} relevant result${n === 1 ? '' : 's'} found`
  })()

  return (
    <section className="online-search" aria-labelledby="online-search-title">
      <div className="online-search__header">
        <h2 id="online-search-title" className="online-search__title-heading">
          Online search
        </h2>
        {countLabel ? <p className="online-search__count">{countLabel}</p> : null}
      </div>

      {!data ? (
        <p className="online-search__state">Online search was not returned for this analysis.</p>
      ) : data.status === 'error' ? (
        <p className="online-search__state online-search__state--error" role="status">
          {data.error || 'Online search could not be completed. Deepfake detection results above are unaffected.'}
        </p>
      ) : data.status === 'empty' || results.length === 0 ? (
        <p className="online-search__state" role="status">
          No matching or visually similar images were found online for this upload.
        </p>
      ) : (
        <>
          {(data.exactCount > 0 || data.visualCount > 0) && (
            <p className="online-search__breakdown">
              {data.exactCount > 0 ? (
                <span>
                  {data.exactCount} exact match{data.exactCount === 1 ? '' : 'es'}
                </span>
              ) : null}
              {data.exactCount > 0 && data.visualCount > 0 ? <span aria-hidden="true"> · </span> : null}
              {data.visualCount > 0 ? (
                <span>
                  {data.visualCount} visually similar
                  {data.relatedCount > 0 ? ` · ${data.relatedCount} related` : ''}
                </span>
              ) : data.relatedCount > 0 ? (
                <span>{data.relatedCount} related</span>
              ) : null}
            </p>
          )}

          <ul className="online-search__list">
            {visible.map((item) => (
              <ResultRow key={`${item.matchType}:${item.link}`} item={item} />
            ))}
          </ul>

          {canExpand ? (
            <button
              type="button"
              className="online-search__toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded((v) => !v)}
            >
              {expanded
                ? 'Show fewer results'
                : `Show all ${results.length} results`}
            </button>
          ) : null}
        </>
      )}

      <p className="online-search__disclaimer">
        {data?.disclaimer ||
          'Online search results do not establish whether an image is authentic.'}{' '}
        Visually similar results are not exact matches and are not proof of authenticity.
      </p>
    </section>
  )
}
