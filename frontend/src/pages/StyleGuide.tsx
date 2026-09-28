import React, { useState } from 'react'
import { Logo } from '../components/AppShell'
import { Modal } from '../components/Modal'
import { StepIndicator } from '../components/StepIndicator'
import {
  Alert,
  Button,
  Card,
  EmptyState,
  IconButton,
  PageHeader,
  ScoreDial,
  Select,
  Spinner,
  TextField,
  Toast,
  VerdictBadge,
  type VerdictState,
} from '../components/ui'
import { useIsMobile } from '../hooks/useMediaQuery'

/* Living reference for the shared UI kit. Every example here renders the
   real component, so this page doubles as a visual regression check. */

const COLORS = [
  ['--primary', 'Primary'],
  ['--secondary', 'Secondary'],
  ['--accent', 'Accent'],
  ['--background', 'Background'],
  ['--text', 'Text'],
  ['--secondary-text', 'Secondary text'],
  ['--borders', 'Borders'],
  ['--successful', 'Successful'],
  ['--warning', 'Warning'],
  ['--error', 'Error'],
  ['--btn-dark', 'Button dark'],
  ['--placeholder', 'Placeholder'],
]

const TYPE_SCALE = ['--fs-3xl', '--fs-2xl', '--fs-xl', '--fs-lg', '--fs-md', '--fs-sm', '--fs-xs']
const SPACING = ['--space-1', '--space-2', '--space-3', '--space-4', '--space-5', '--space-6', '--space-7', '--space-8']
const RADII = ['--radius-sm', '--radius-md', '--radius-lg', '--radius-pill']
const VERDICTS: VerdictState[] = ['real', 'fake', 'warn', 'failed']

const Section: React.FC<{ id: string; title: string; usage?: string; children: React.ReactNode }> = ({
  id,
  title,
  usage,
  children,
}) => (
  <Card as="section" padding="md" className="sg-section" aria-labelledby={`sg-${id}`}>
    <h2 id={`sg-${id}`} className="sg-section-title">{title}</h2>
    <div className="sg-demo">{children}</div>
    {usage && (
      <pre className="sg-code" tabIndex={0} aria-label={`${title} usage example`}>
        <code>{usage}</code>
      </pre>
    )}
  </Card>
)

export const StyleGuide: React.FC = () => {
  const isMobile = useIsMobile()
  const [modalOpen, setModalOpen] = useState(false)
  const [toast, setToast] = useState(false)
  const [sort, setSort] = useState('newest')
  const [step, setStep] = useState<1 | 2 | 3>(1)

  const flashToast = () => {
    setToast(true)
    window.setTimeout(() => setToast(false), 2000)
  }

  return (
    <div className="ui-container">
      <header className="app-header">
        <Logo to="/" />
      </header>

      <main>
        <PageHeader
          title="Style guide"
          subtitle={`Tokens and reusable components from src/components/ui. Viewing the ${isMobile ? 'mobile' : 'desktop'} layout.`}
        />

        <div className="sg-grid">
          <Section id="colors" title="Colour tokens">
            <div className="sg-swatches">
              {COLORS.map(([token, name]) => (
                <div className="sg-swatch" key={token}>
                  <span className="sg-swatch-chip" style={{ background: `var(${token})` }} />
                  <span className="sg-swatch-name">{name}</span>
                  <code>{token}</code>
                </div>
              ))}
            </div>
          </Section>

          <Section id="type" title="Type scale">
            <div className="sg-stack">
              {TYPE_SCALE.map((t) => (
                <p key={t} style={{ fontSize: `var(${t})`, fontWeight: 700, lineHeight: 1.2 }}>
                  {t} — Not everything you see is real
                </p>
              ))}
            </div>
          </Section>

          <Section id="spacing" title="Spacing & radius">
            <div className="sg-stack">
              {SPACING.map((t) => (
                <div className="sg-space-row" key={t}>
                  <code>{t}</code>
                  <span className="sg-space-bar" style={{ width: `var(${t})` }} />
                </div>
              ))}
            </div>
            <div className="sg-row">
              {RADII.map((r) => (
                <div className="sg-radius" key={r} style={{ borderRadius: `var(${r})` }}>
                  <code>{r}</code>
                </div>
              ))}
            </div>
          </Section>

          <Section
            id="button"
            title="Button"
            usage={`<Button>Analyze image</Button>
  <Button variant="ghost" size="sm">Clear</Button>
  <Button variant="danger" loading>Deleting…</Button>`}
          >
            <div className="sg-row">
              <Button>Primary</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="success">Success</Button>
              <Button variant="danger">Danger</Button>
              <Button variant="link">Link</Button>
            </div>
            <div className="sg-row">
              <Button size="sm">Small</Button>
              <Button size="md">Medium</Button>
              <Button size="lg">Large</Button>
            </div>
            <div className="sg-row">
              <Button disabled>Disabled</Button>
              <Button loading>Loading</Button>
              <Button variant="ghost" loading>Loading</Button>
            </div>
            <Button fullWidth>Full width</Button>
          </Section>

          <Section
            id="icon-button"
            title="IconButton"
            usage={`<IconButton icon="/assets/icon-save.svg" label="Save result" />`}
          >
            <div className="sg-row">
              <IconButton icon="/assets/icon-save.svg" label="Save result" size="sm" />
              <IconButton icon="/assets/icon-x-octagon.svg" label="Delete" />
              <IconButton icon="/assets/account-circle.svg" label="Account" size="lg" />
            </div>
          </Section>

          <Section
            id="text-field"
            title="TextField"
            usage={`<TextField name="email" type="email" label="Email Address" hideLabel placeholder="Email Address" />
  <TextField variant="filled" label="First Name" value={v} onChange={…} />
  <TextField type="password" label="Password" error="Passwords do not match." />`}
          >
            <div className="sg-stack">
              <TextField label="Email Address" hideLabel placeholder="Email Address (underline)" />
              <TextField type="password" label="Password" hideLabel placeholder="Password" hint="At least 12 characters." />
              <TextField variant="filled" label="First Name" placeholder="Jane" />
              <TextField variant="filled" label="Email" defaultValue="not-an-email" error="Enter a valid email address." />
              <TextField variant="filled" label="Disabled" defaultValue="Read only" disabled />
            </div>
          </Section>

          <Section
            id="select"
            title="Select"
            usage={`<Select label="Sort by" value={sort} onChange={…} options={[{ value: 'newest', label: 'Newest' }]} />`}
          >
            <Select
              label="Sort by"
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              options={[
                { value: 'newest', label: 'Newest' },
                { value: 'oldest', label: 'Oldest' },
              ]}
            />
          </Section>

          <Section id="alert" title="Alert" usage={`<Alert tone="error">Choose a JPG, PNG or WEBP under 10 MB.</Alert>`}>
            <div className="sg-stack">
              <Alert tone="error">This photo is too big. Please choose one under 10 MB.</Alert>
              <Alert tone="success">Your original image has been permanently deleted from our servers.</Alert>
              <Alert tone="info">You have been logged out due to inactivity.</Alert>
              <Alert tone="warning" title="Daily limit reached">
                You can run 20 analyses per 24 hours.
              </Alert>
            </div>
          </Section>

          <Section
            id="verdict"
            title="VerdictBadge & ScoreDial"
            usage={`<VerdictBadge verdict="fake" />
  <ScoreDial value={87} verdict="fake" />`}
          >
            <div className="sg-row">
              {VERDICTS.map((v) => (
                <VerdictBadge key={v} verdict={v} />
              ))}
            </div>
            <div className="sg-row">
              {VERDICTS.map((v) => (
                <VerdictBadge key={v} verdict={v} size="sm" />
              ))}
            </div>
            <div className="sg-row">
              <ScoreDial value={85} verdict="real" />
              <ScoreDial value={87} verdict="fake" />
              <ScoreDial value={null} verdict="warn" />
              <ScoreDial value={null} verdict="failed" label="N/A" />
            </div>
          </Section>

          <Section id="spinner" title="Spinner" usage={`<Spinner size="lg" label="Analyzing" />`}>
            <div className="sg-row">
              <Spinner size="sm" label="Loading" />
              <Spinner size="md" label="Loading" />
              <Spinner size="lg" label="Loading" />
            </div>
          </Section>

          <Section
            id="feedback"
            title="Modal & Toast"
            usage={`<Modal title="Delete Result?" subtitle="…" onClose={close}
    actions={<><Button variant="success">Confirm</Button><Button variant="danger">Cancel</Button></>} />
  {show && <Toast message="Successfully Deleted!" />}`}
          >
            <div className="sg-row">
              <Button onClick={() => setModalOpen(true)}>Open modal</Button>
              <Button variant="ghost" onClick={flashToast}>Show toast</Button>
            </div>
          </Section>

          <Section id="empty" title="EmptyState" usage={`<EmptyState icon="/assets/icon-file.svg" message="No saved results yet." />`}>
            <EmptyState
              icon="/assets/icon-file.svg"
              message="No saved results yet."
              action={<Button size="sm">Analyze an image</Button>}
            />
          </Section>

          <Section id="steps" title="StepIndicator" usage={`<StepIndicator step={2} />`}>
            <StepIndicator step={step} />
            <div className="sg-row">
              {([1, 2, 3] as const).map((n) => (
                <Button key={n} size="sm" variant={n === step ? 'primary' : 'ghost'} onClick={() => setStep(n)}>
                  Step {n}
                </Button>
              ))}
            </div>
          </Section>
        </div>
      </main>

      {modalOpen && (
        <Modal
          title="Delete Result?"
          subtitle="Result will be permanently deleted"
          onClose={() => setModalOpen(false)}
          actions={
            <>
              <Button variant="success" onClick={() => setModalOpen(false)}>Confirm</Button>
              <Button variant="danger" onClick={() => setModalOpen(false)}>Cancel</Button>
            </>
          }
        />
      )}
      {toast && <Toast message="Successfully Deleted!" />}
    </div>
  )
}
