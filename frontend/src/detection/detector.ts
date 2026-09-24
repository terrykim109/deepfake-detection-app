/* The seam between the app and whatever performs deepfake detection.
   httpDetector calls the backend /api/analysis/run path (DFD-02).
   mockDetector remains for offline UI work. */

export type Verdict = 'real' | 'warn' | 'fake'

export type AnalysisStage =
  | 'idle'
  | 'validating'
  | 'connecting'
  | 'processing'
  | 'analyzing'
  | 'finalizing'
  | 'completed'
  | 'failed'

export const ANALYSIS_STAGE_LABELS: Record<AnalysisStage, string> = {
  idle: '',
  validating: 'Checking your image…',
  connecting: 'Connecting to analysis service…',
  processing: 'Preparing a secure temporary copy…',
  analyzing: 'Analyzing your image…',
  finalizing: 'Removing the temporary image…',
  completed: 'Analysis complete',
  failed: 'Analysis could not be completed',
}

export interface Detection {
  verdict: Verdict
  verdictLabel: string
  confidence: number
  summary: string
  /** Optional server-issued id / privacy fields from /analysis/run */
  id?: string
  provider?: string
  imageDeleted?: boolean
  imageStoredAt?: string | null
  imageDeletedAt?: string | null
  privacyMessage?: string
  createdAt?: string
}

export type StatusCallback = (stage: AnalysisStage) => void

export interface Detector {
  analyze(
    file: File,
    signal?: AbortSignal,
    onStatus?: StatusCallback,
  ): Promise<Detection>
}

export const abortError = (): DOMException =>
  new DOMException('Analysis aborted', 'AbortError')
