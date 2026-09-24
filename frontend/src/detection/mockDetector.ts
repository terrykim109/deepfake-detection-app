import { abortError, type Detection, type Detector } from './detector'
import { DETAIL_SUMMARY } from '../data/mock'

/* The fixed verdict shown on the Figma "Image Results" frame (node 61:42).
   Same numbers the hardcoded ANALYZED_RESULT used to carry. */
const FIXED: Detection = {
  verdict: 'fake',
  verdictLabel: 'Likely manipulated',
  confidence: 87,
  summary: DETAIL_SUMMARY,
}

/* Held so the step tracker visibly passes through step 2. This used to
   be a setTimeout in the Upload page; latency belongs to the detector. */
const LATENCY_MS = 1600

export const mockDetector: Detector = {
  analyze: (_file, signal, onStatus) =>
    new Promise<Detection>((resolve, reject) => {
      if (signal?.aborted) {
        reject(abortError())
        return
      }

      onStatus?.('analyzing')

      const timer = setTimeout(() => {
        signal?.removeEventListener('abort', onAbort)
        onStatus?.('completed')
        resolve(FIXED)
      }, LATENCY_MS)

      function onAbort() {
        clearTimeout(timer)
        onStatus?.('failed')
        reject(abortError())
      }

      signal?.addEventListener('abort', onAbort, { once: true })
    }),
}
