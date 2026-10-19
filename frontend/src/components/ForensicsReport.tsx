import React from 'react'
import { Alert, Card } from './ui'
import type { ForensicsResult } from '../api/client'

/* Renders one completed forensics run (metadata/EXIF, ELA, noise, C2PA)
   inside the collapsed-by-default forensics card on the Results page. */
export const ForensicsReport: React.FC<{ forensics: ForensicsResult }> = ({ forensics }) => {
  const { metadata, ela, noise, c2pa } = forensics

  return (
    <>
      <Card padding="lg" className="forensics-section">
        <h3>Content provenance (C2PA)</h3>
        <Alert tone={c2pa.found ? 'success' : 'info'}>
          {c2pa.detail}
          {c2pa.claim_generator && <> — generator: {c2pa.claim_generator}</>}
        </Alert>
      </Card>

      <Card padding="lg" className="forensics-section">
        <h3>Metadata / EXIF</h3>
        {metadata.available ? (
          <>
            <dl className="forensics-kv">
              <dt>Format</dt>
              <dd>{metadata.file_info?.format ?? '—'}</dd>
              <dt>Dimensions</dt>
              <dd>
                {metadata.file_info
                  ? `${metadata.file_info.width} × ${metadata.file_info.height}`
                  : '—'}
              </dd>
              <dt>Camera make</dt>
              <dd>{metadata.camera_make ?? '—'}</dd>
              <dt>Camera model</dt>
              <dd>{metadata.camera_model ?? '—'}</dd>
              <dt>Software</dt>
              <dd>{metadata.software ?? '—'}</dd>
              <dt>Date taken</dt>
              <dd>{metadata.date_taken ?? '—'}</dd>
              <dt>GPS data present</dt>
              <dd>{metadata.has_gps ? 'Yes' : 'No'}</dd>
            </dl>
            {metadata.exif && Object.keys(metadata.exif).length > 0 && (
              <details className="forensics-raw">
                <summary>All EXIF tags ({Object.keys(metadata.exif).length})</summary>
                <pre>{JSON.stringify(metadata.exif, null, 2)}</pre>
              </details>
            )}
          </>
        ) : (
          <Alert tone="warning">
            Metadata extraction failed: {metadata.error ?? 'unknown error'}
          </Alert>
        )}
      </Card>

      <Card padding="lg" className="forensics-section">
        <h3>Error Level Analysis (ELA)</h3>
        {ela.available ? (
          <div className="forensics-image-row">
            <img
              className="forensics-result-image"
              src={ela.image_base64}
              alt="Error level analysis heatmap"
            />
            <dl className="forensics-kv">
              <dt>Mean error</dt>
              <dd>{ela.mean_error?.toFixed(2)}</dd>
              <dt>Max error</dt>
              <dd>{ela.max_error?.toFixed(2)}</dd>
              <dt>JPEG quality used</dt>
              <dd>{ela.jpeg_quality}</dd>
            </dl>
          </div>
        ) : (
          <Alert tone="warning">ELA failed: {ela.error ?? 'unknown error'}</Alert>
        )}
      </Card>

      <Card padding="lg" className="forensics-section">
        <h3>Noise analysis</h3>
        {noise.available ? (
          <div className="forensics-image-row">
            <img
              className="forensics-result-image"
              src={noise.image_base64}
              alt="Noise variance heatmap"
            />
            <dl className="forensics-kv">
              <dt>Mean block variance</dt>
              <dd>{noise.mean_block_variance?.toFixed(2)}</dd>
              <dt>Std block variance</dt>
              <dd>{noise.std_block_variance?.toFixed(2)}</dd>
              <dt>Outlier blocks</dt>
              <dd>{noise.outlier_block_count}</dd>
            </dl>
          </div>
        ) : (
          <Alert tone="warning">Noise analysis failed: {noise.error ?? 'unknown error'}</Alert>
        )}
      </Card>
    </>
  )
}
