import React from 'react'
import { Link } from 'react-router-dom'
import { PublicNav } from '../components/PublicNav'
import { StepIcon } from '../content/stepIcons'
import type { LandingContent } from '../content/types'

function ContentLink({
  href,
  className,
  children,
}: {
  href: string
  className?: string
  children: React.ReactNode
}) {
  if (/^https?:\/\//i.test(href) || href.startsWith('mailto:')) {
    return (
      <a href={href} className={className}>
        {children}
      </a>
    )
  }
  return (
    <Link to={href} className={className}>
      {children}
    </Link>
  )
}

export const LandingView: React.FC<{
  content: LandingContent
  /** Optional banner for draft preview pages. */
  previewBanner?: string
}> = ({ content, previewBanner }) => (
  <div className="landing">
    {previewBanner ? (
      <div className="content-preview-banner" role="status">
        {previewBanner}
      </div>
    ) : null}
    <PublicNav />

    <main>
      {content.heroVisible ? (
        <section className="landing-hero" aria-labelledby="landing-title">
          <img className="landing-hero__image" src={content.heroImageSrc} alt="" />
          <div className="landing-hero__copy">
            <h1 id="landing-title" className="landing-title">
              {content.heroTitle}
            </h1>
            <p className="landing-tagline">{content.heroTagline}</p>
            <ContentLink href={content.heroCtaHref} className="ui-btn ui-btn--lg landing-hero__cta">
              {content.heroCtaLabel}
            </ContentLink>
          </div>
        </section>
      ) : null}

      {content.explainerVisible ? (
        <section className="landing-explainer" aria-label="How it works">
          <p className="landing-lead">{content.explainerLead}</p>
          <ul className="landing-steps">
            {content.explainerSteps.map((step) => (
              <li key={`${step.icon}-${step.label}`}>
                <StepIcon icon={step.icon} />
                {step.label}
              </li>
            ))}
          </ul>
          <ContentLink
            href={content.explainerCtaHref}
            className="ui-btn ui-btn--primary ui-btn--lg landing-explainer__cta"
          >
            {content.explainerCtaLabel}
          </ContentLink>
        </section>
      ) : null}
    </main>

    <footer className="landing-footer">
      <p>{content.footerDisclaimer}</p>
      <p>{content.footerCopyright}</p>
    </footer>
  </div>
)
