import { abortError, type Detection, type Detector, type OnlineSearchInfo, type StatusCallback } from './detector'
import { analysisApi, type OnlineSearchPayload } from '../api/client'
import { validateUploadSelection } from '../upload/validateUpload'

function mapOnlineSearch(payload?: OnlineSearchPayload | null): OnlineSearchInfo | null {
  if (!payload) return null
  return {
    status: payload.status,
    totalCount: payload.total_count ?? 0,
    exactCount: payload.exact_count ?? 0,
    visualCount: payload.visual_count ?? 0,
    relatedCount: payload.related_count ?? 0,
    results: Array.isArray(payload.results)
      ? payload.results.map((row) => ({
          title: row.title,
          link: row.link,
          source: row.source,
          thumbnail: row.thumbnail,
          matchType: row.match_type,
          position: row.position,
        }))
      : [],
    error: payload.error,
    disclaimer:
      payload.disclaimer ||
      'Online search results do not establish whether an image is authentic.',
  }
}

/**
 * DFD-02 HTTP adapter: client validation → POST /api/analysis/run
 * (server validates again, temp-stores, runs detection + reverse search, deletes).
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
      await new Promise((r) => setTimeout(r, 200))

      report('processing')
      const analyzingTimer = window.setTimeout(() => {
        if (!signal?.aborted) report('analyzing')
      }, 450)

      try {
        const res = await analysisApi.run(userId, file, signal)
        window.clearTimeout(analyzingTimer)

        if (signal?.aborted) throw abortError()

        if (res.error || !res.data?.ok) {
          report('failed')
          throw new Error(
            res.error ||
              'The analysis service could not complete this request. Your image was deleted — please try uploading again.',
          )
        }

        const onlineSearch = mapOnlineSearch(res.data.online_search)
        const forensics = res.data.forensics ?? null
        const { result, privacy, detection_error: detectionError } = res.data

        // A 200 response with no detection result and a failed online search is
        // only a hard failure if forensics also has nothing to show — otherwise
        // the forensics-only result below still has something worth surfacing.
        if (!result && onlineSearch?.status === 'error' && !forensics) {
          report('failed')
          throw new Error(
            detectionError ||
              onlineSearch.error ||
              'The analysis service could not complete this request. Your image was deleted — please try uploading again.',
          )
        }

        report('finalizing')

        if (!result) {
          report('completed')
          return {
            id: `r_${Date.now()}`,
            verdict: 'warn',
            verdictLabel: 'Detection unavailable',
            confidence: 0,
            summary:
              detectionError ||
              'Deepfake detection could not be completed for this image. Online search results are shown below when available.',
            provider: res.data.provider,
            createdAt: new Date().toISOString(),
            imageDeleted: privacy?.image_deleted ?? true,
            imageStoredAt: privacy?.stored_at ?? null,
            imageDeletedAt: privacy?.deleted_at ?? null,
            privacyMessage: privacy?.message,
            findings: [],
            onlineSearch,
            detectionError: detectionError ?? null,
            forensics,
          }
        }

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
          findings: Array.isArray(result.findings) ? result.findings : [],
          onlineSearch,
          detectionError: detectionError ?? null,
          forensics,
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
