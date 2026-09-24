import { abortError, type Detection, type Detector, type StatusCallback } from './detector'
import { analysisApi } from '../api/client'
import { validateUploadSelection } from '../upload/validateUpload'

/**
 * DFD-02 HTTP adapter: client validation → POST /api/analysis/run
 * (server validates again, temp-stores, runs the configured detector, deletes).
 */
export function createHttpDetector(getUserId: () => string | null): Detector {
  return {
    async analyze(file, signal, onStatus?: StatusCallback) {
      const report = (stage: Parameters<NonNullable<StatusCallback>>[0]) => {
        onStatus?.(stage)
      }

      if (signal?.aborted) throw abortError()

      report('validating')
      const local = await validateUploadSelection([file])
      if (!local.ok) {
        report('failed')
        throw new Error(local.message)
      }

      const userId = getUserId()
      if (!userId) {
        report('failed')
        throw new Error('Please log in before uploading an image for analysis.')
      }

      if (signal?.aborted) throw abortError()

      report('connecting')
      // Brief beat so the user sees "connecting" before the long request
      await new Promise((r) => setTimeout(r, 200))

      report('processing')
      // Server will: validate → temp store → analyze → delete
      // While the request is in flight we advance to analyzing shortly after
      const analyzingTimer = window.setTimeout(() => {
        if (!signal?.aborted) report('analyzing')
      }, 450)

      try {
        const res = await analysisApi.run(userId, file, signal)
        window.clearTimeout(analyzingTimer)

        if (signal?.aborted) throw abortError()

        if (res.error || !res.data?.ok || !res.data.result) {
          report('failed')
          throw new Error(
            res.error ||
              'The analysis service could not complete this request. Your image was deleted — please try uploading again.',
          )
        }

        report('finalizing')
        const { result, privacy } = res.data
        const verdict = (result.verdict || 'warn') as Detection['verdict']

        report('completed')
        return {
          id: result.id,
          verdict,
          verdictLabel: result.verdict_label,
          confidence: result.confidence,
          summary: result.summary,
          provider: result.provider || res.data.provider,
          createdAt: result.created_at,
          imageDeleted: privacy?.image_deleted ?? true,
          imageStoredAt: privacy?.stored_at ?? null,
          imageDeletedAt: privacy?.deleted_at ?? null,
          privacyMessage: privacy?.message,
        }
      } catch (err) {
        window.clearTimeout(analyzingTimer)
        if (err instanceof DOMException && err.name === 'AbortError') throw err
        report('failed')
        if (err instanceof TypeError || (err instanceof Error && /failed to fetch|network/i.test(err.message))) {
          throw new Error(
            'The analysis service is unavailable right now. Your image was not kept — please try uploading again when the service is available.',
          )
        }
        throw err
      }
    },
  }
}
