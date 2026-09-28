import React from 'react'
import { useIsMobile } from '../hooks/useMediaQuery'
import { cx } from './ui/cx'

const STEPS = [
  { icon: '/assets/icon-file.svg', label: 'Step 1. Upload', short: 'Upload' },
  { icon: '/assets/icon-clock.svg', label: 'Step 2. Processing', short: 'Processing' },
  { icon: '/assets/icon-smile.svg', label: 'Step 3. Results', short: 'Results' },
]

/* Figma's three circles on desktop; a compact progress bar on phones
   where the circles would not fit. */
export const StepIndicator: React.FC<{ step: 1 | 2 | 3 }> = ({ step }) => {
  const compact = useIsMobile()

  return (
    <ol className={cx('ui-steps', compact && 'ui-steps--compact')} aria-label="Analysis progress">
      {STEPS.map((s, i) => {
        const n = i + 1
        const state = n === step ? 'active' : n < step ? 'done' : 'todo'
        return (
          <li
            key={s.label}
            className={cx('ui-steps__item', `ui-steps__item--${state}`)}
            aria-current={state === 'active' ? 'step' : undefined}
          >
            {compact ? (
              <>
                <span className="ui-steps__dot" />
                <span className="ui-steps__text">{s.short}</span>
              </>
            ) : (
              <>
                {i > 0 && <span className="ui-steps__arrow" aria-hidden="true" />}
                <div className="ui-steps__circle">
                  <img src={s.icon} alt="" />
                  <span>{s.label}</span>
                </div>
              </>
            )}
          </li>
        )
      })}
    </ol>
  )
}
