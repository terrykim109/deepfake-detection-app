import React, { useState } from 'react'
import { Link } from 'react-router-dom'
import { PublicNav } from '../components/PublicNav'
import { Card } from '../components/ui'
import { TEAM, teamInitials } from '../data/team'
import { useAppState } from '../state/AppState'

/* Public About page — same shell/tokens as Landing; team roster lives in data/team.ts. */
export const About: React.FC = () => {
  const { user } = useAppState()
  const tryItPath = user ? '/upload' : '/create-account'
  const [membershipNote, setMembershipNote] = useState(false)

  return (
    <div className="landing about-page">
      <PublicNav />

      <main>
        <section className="about-intro" aria-labelledby="about-intro-title">
          <h1 id="about-intro-title" className="about-intro__title">
            Technology should make a difference.
          </h1>
          <p className="about-intro__lead">
            We&apos;re a team of student developers passionate about building practical
            applications that make a real-world difference.
          </p>
        </section>

        <section className="about-section" aria-labelledby="about-purpose-title">
          <h2 id="about-purpose-title" className="about-section__title">
            Why We&apos;re Building This
          </h2>
          <p className="about-section__body">
            AI-generated images are becoming harder to distinguish from authentic content.
            We want to make image screening more accessible, understandable, and available
            to everyone.
          </p>
        </section>

        <section className="about-section about-section--access" aria-labelledby="about-access-title">
          <h2 id="about-access-title" className="about-section__title">
            Built for Everyone.
          </h2>
          <p className="about-section__body">
            Our core image-screening experience is free and accessible to everyone.
          </p>
          <p className="about-section__body">
            An optional Premium membership is planned for access to additional AI models
            and expanded capabilities — including advanced options such as Claude Opus 5.5,
            subject to integration and availability. Membership is not available to purchase yet.
          </p>
          <div className="about-cta">
            <Link to={tryItPath} className="ui-btn ui-btn--primary ui-btn--lg">
              Try It Free
            </Link>
            <button
              type="button"
              className="ui-btn ui-btn--ghost ui-btn--lg"
              aria-expanded={membershipNote}
              aria-controls="membership-coming-soon"
              onClick={() => setMembershipNote((open) => !open)}
            >
              Explore Membership
            </button>
          </div>
          {membershipNote && (
            <p id="membership-coming-soon" className="about-membership-note" role="status">
              Premium membership is a future offering. There is no pricing or checkout yet —
              we&apos;ll share details when it becomes available.
            </p>
          )}
        </section>

        <section className="about-section about-section--team" aria-labelledby="about-team-title">
          <h2 id="about-team-title" className="about-section__title">
            Meet the People Behind the Project.
          </h2>
          <p className="about-section__body">
            A team of student developers working together to build technology with purpose.
          </p>
          <ul className="about-team">
            {TEAM.map((member) => (
              <li key={member.name}>
                <Card as="article" padding="md" className="about-team__card">
                  {member.photoSrc ? (
                    <img
                      className="about-team__photo"
                      src={member.photoSrc}
                      alt=""
                      width={72}
                      height={72}
                    />
                  ) : (
                    <span className="about-team__avatar" aria-hidden="true">
                      {teamInitials(member.name)}
                    </span>
                  )}
                  <div className="about-team__meta">
                    <h3 className="about-team__name">{member.name}</h3>
                    {member.role ? (
                      <p className="about-team__role">{member.role}</p>
                    ) : null}
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer className="landing-footer">
        <p>A screening tool, not forensic proof.</p>
        <p>© 2026 Deepfake Detection</p>
      </footer>
    </div>
  )
}
