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
