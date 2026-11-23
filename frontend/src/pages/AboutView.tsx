import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicNav } from '../components/PublicNav'
import { Card } from '../components/ui'
import { teamInitials } from '../content/teamInitials'
import type { AboutContent } from '../content/types'
import { useAppState } from '../state/AppState'

export const AboutView: React.FC<{
  content: AboutContent
  previewBanner?: string
}> = ({ content, previewBanner }) => {
  const { user } = useAppState()
  const [membershipNote, setMembershipNote] = useState(false)
  const tryItPath =
    user && content.tryItHref === '/create-account' ? '/upload' : content.tryItHref

  return (
    <div className="landing about-page">
      {previewBanner ? (
        <div className="content-preview-banner" role="status">
          {previewBanner}
        </div>
      ) : null}
      <PublicNav />

      <main>
        {content.introVisible ? (
          <section className="about-intro" aria-labelledby="about-intro-title">
            <h1 id="about-intro-title" className="about-intro__title">
              {content.introHeading}
            </h1>
            <p className="about-intro__lead">{content.introDescription}</p>
          </section>
        ) : null}

        {content.purposeVisible ? (
          <section className="about-section" aria-labelledby="about-purpose-title">
            <h2 id="about-purpose-title" className="about-section__title">
              {content.purposeHeading}
            </h2>
            <p className="about-section__body">{content.purposeDescription}</p>
          </section>
        ) : null}

        {content.accessVisible ? (
          <section
            className="about-section about-section--access"
            aria-labelledby="about-access-title"
          >
            <h2 id="about-access-title" className="about-section__title">
              {content.accessHeading}
            </h2>
            <p className="about-section__body">{content.accessDescription}</p>
            {content.accessDescriptionSecondary ? (
              <p className="about-section__body">{content.accessDescriptionSecondary}</p>
            ) : null}
            <div className="about-cta">
              {/^https?:\/\//i.test(tryItPath) ? (
                <a href={tryItPath} className="ui-btn ui-btn--primary ui-btn--lg">
                  {content.tryItLabel}
                </a>
              ) : (
                <Link to={tryItPath} className="ui-btn ui-btn--primary ui-btn--lg">
                  {content.tryItLabel}
                </Link>
              )}
              <button
                type="button"
                className="ui-btn ui-btn--ghost ui-btn--lg"
                aria-expanded={membershipNote}
                aria-controls="membership-coming-soon"
                onClick={() => setMembershipNote((open) => !open)}
              >
                {content.membershipLabel}
              </button>
            </div>
            {membershipNote ? (
              <p id="membership-coming-soon" className="about-membership-note" role="status">
                {content.membershipNote}
              </p>
            ) : null}
          </section>
        ) : null}

        {content.teamVisible ? (
          <section
            className="about-section about-section--team"
            aria-labelledby="about-team-title"
          >
            <h2 id="about-team-title" className="about-section__title">
              {content.teamHeading}
            </h2>
            <p className="about-section__body">{content.teamDescription}</p>
            <ul className="about-team">
              {content.team.map((member) => (
                <li key={member.id}>
                  <Card as="article" padding="sm" className="about-team__card">
                    {member.photoSrc ? (
                      <img
                        className="about-team__photo"
                        src={member.photoSrc}
                        alt=""
                        width={64}
                        height={64}
                      />
                    ) : (
                      <span className="about-team__avatar" aria-hidden="true">
                        {teamInitials(member.name)}
                      </span>
                    )}
                    <div className="about-team__meta">
                      <h3 className="about-team__name">{member.name}</h3>
                      {member.role ? <p className="about-team__role">{member.role}</p> : null}
                      {member.contribution ? (
                        <p className="about-team__role">{member.contribution}</p>
                      ) : null}
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>

      <footer className="landing-footer">
        <p>{content.footerDisclaimer}</p>
        <p>{content.footerCopyright}</p>
      </footer>
    </div>
  )
}
