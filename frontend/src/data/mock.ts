import type { Detection } from '../detection/detector'

export interface AnalysisResult extends Detection {
  id: string
  fileName: string
  timestamp: string
  createdAt: string
}

export const DETAIL_SUMMARY =
  'Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.'

export const HISTORY_SEED: AnalysisResult[] = [
  {
    id: 'h1',
    fileName: 'interview_ss.png',
    verdict: 'fake',
    verdictLabel: 'Likely manipulated',
    confidence: 87,
    timestamp: 'Jul 20, 2026 · 3:42 PM',
    createdAt: '2026-07-20T15:42:00',
    summary: DETAIL_SUMMARY,
  },
  {
    id: 'h2',
    fileName: 'news_anchor_photo.jpg',
    verdict: 'warn',
    verdictLabel: 'Possible manipulation detected',
    confidence: 58,
    timestamp: 'Jul 19, 2026 · 6:18 PM',
    createdAt: '2026-07-19T18:18:00',
    summary: DETAIL_SUMMARY,
  },
  {
    id: 'h3',
    fileName: 'profile_photo.jpg',
    verdict: 'real',
    verdictLabel: 'No manipulation detected',
    confidence: 70,
    timestamp: 'Jun 04, 2026 · 1:30 AM',
    createdAt: '2026-06-04T01:30:00',
    summary: DETAIL_SUMMARY,
  },
]
export const TIPS = [
  'Clear, well lit images usually work best.',
  'Make sure your file is in a supported image format.',
  'Your image is processed securely and removed after analysis.',
  'Analysis results are there to help you make a better judgment.',
]

export const TIPS_LEAD = 'Please upload one image at a time.'
