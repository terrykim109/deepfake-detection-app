export type LandingStepIcon = 'image' | 'shield-check' | 'shield' | string

export interface LandingStepContent {
  icon: LandingStepIcon
  label: string
}

export interface LandingContent {
  heroTitle: string
  heroTagline: string
  heroCtaLabel: string
  heroCtaHref: string
  heroImageSrc: string
  heroVisible: boolean
  explainerLead: string
  explainerSteps: LandingStepContent[]
  explainerCtaLabel: string
  explainerCtaHref: string
  explainerVisible: boolean
  footerDisclaimer: string
  footerCopyright: string
}

export interface AboutTeamMemberContent {
  id: string
  name: string
  role: string
  contribution: string
  photoSrc: string
}

export interface AboutContent {
  introHeading: string
  introDescription: string
  introVisible: boolean
  purposeHeading: string
  purposeDescription: string
  purposeVisible: boolean
  accessHeading: string
  accessDescription: string
  accessDescriptionSecondary: string
  tryItLabel: string
  tryItHref: string
  membershipLabel: string
  membershipNote: string
  accessVisible: boolean
  teamHeading: string
  teamDescription: string
  teamVisible: boolean
  team: AboutTeamMemberContent[]
  footerDisclaimer: string
  footerCopyright: string
}

export type SitePageId = 'landing' | 'about'

export interface PublishedContentResponse<T> {
  pageId: SitePageId
  content: T
  publishedAt: string | null
  source: 'published' | 'default'
}

export interface AdminContentResponse<T> {
  pageId: SitePageId
  draft: T
  published: T | null
  draftUpdatedAt: string | null
  publishedAt: string | null
  status: 'published' | 'unpublished'
  hasUnpublishedChanges: boolean
}
