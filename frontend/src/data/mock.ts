import type { Detection } from '../detection/detector'

export interface AnalysisResult extends Detection {
  id: string
  fileName: string
  timestamp: string
  createdAt: string
  /** Privacy metadata — original image is never stored with history. */
  imageDeleted?: boolean
  imageStoredAt?: string | null
  imageDeletedAt?: string | null
  privacyMessage?: string
}

export const TIPS = [
  'Upload one image at a time — JPG, JPEG, PNG, or WEBP only.',
  'Keep files under 10 MB so analysis can start right away.',
  'Your image is stored only temporarily and deleted within 60 seconds after analysis.',
  'Saved history keeps the result only — never the original image.',
  'Analysis results are there to help you make a better judgment.',
]

export const TIPS_LEAD = 'Please upload one image at a time (JPG, JPEG, PNG, or WEBP under 10 MB).'
