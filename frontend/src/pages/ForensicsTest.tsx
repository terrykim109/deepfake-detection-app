import React, { useEffect, useRef, useState } from "react";
import { AppShell } from "../components/AppShell";
import { Alert, Button, Card, PageHeader, Spinner } from "../components/ui";
import { validateUploadSelection } from "../upload/validateUpload";
import { forensicsApi, type ForensicsRunResponse } from "../api/client";
import "../styles/forensicsTest.css";

/* Manual test harness for the independent Digital Image Forensics
   module (metadata/EXIF, ELA, noise, C2PA) — reuses the same upload
   validation as the real Upload page, but calls /api/forensics/run
   directly instead of the deepfake detector. Not linked in the nav;
   visit /forensics-test directly. */
export const ForensicsTest: React.FC = () => {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewRef = useRef<string | null>(null);

  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ForensicsRunResponse | null>(null);

  useEffect(
    () => () => {
      if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    },
    [],
  );

  const setPreviewUrl = (next: string | null) => {
    if (previewRef.current && previewRef.current !== next) {
      URL.revokeObjectURL(previewRef.current);
    }
    previewRef.current = next;
    setPreview(next);
  };

  const accept = async (files: FileList | File[] | null | undefined) => {
    setError("");
    setResult(null);
    const validated = await validateUploadSelection(files);
    if (!validated.ok) {
      setFile(null);
      setPreviewUrl(null);
      if (inputRef.current) inputRef.current.value = "";
      setError(validated.message);
      return;
    }
    setFile(validated.file);
    setPreviewUrl(URL.createObjectURL(validated.file));
  };

  const clear = () => {
    setFile(null);
    setPreviewUrl(null);
    setResult(null);
    setError("");
    if (inputRef.current) inputRef.current.value = "";
  };

  const run = async () => {
    if (!file) {
      setError("Choose an image first.");
      return;
    }
    setRunning(true);
    setError("");
    setResult(null);

    const { data, error: apiError } = await forensicsApi.run(file);
    setRunning(false);

    if (apiError || !data) {
      setError(apiError || "The forensics service did not return a result.");
      return;
    }
    setResult(data);
  };

  const openPicker = () => inputRef.current?.click();

  return (
    <AppShell>
      <PageHeader
        title="Forensics Module Test"
        subtitle="Manual test harness for the Digital Image Forensics module — metadata/EXIF, ELA, noise analysis, and C2PA, independent of the deepfake model."
      />

      <Card padding="lg" className="forensics-upload-card">
        <div
          className={`forensics-drop-zone${dragging ? " dragging" : ""}`}
          role="button"
          tabIndex={0}
          aria-label={
            preview
              ? `Selected ${file?.name ?? "image"}. Choose a different image`
              : "Choose an image to upload"
          }
          onClick={openPicker}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openPicker();
            }
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            void accept(e.dataTransfer.files);
          }}
        >
          {preview ? (
            <>
              <img
                className="forensics-preview"
                src={preview}
                alt={file?.name ?? "Selected image"}
              />
              <p className="forensics-file-name">{file?.name}</p>
              <p className="forensics-hint">Click or drop to replace</p>
            </>
          ) : (
            <p className="forensics-hint">
              Drop an image here, or click to browse — JPG, JPEG, PNG or WEBP
              (max 10 MB)
            </p>
          )}
        </div>

        <input
          ref={inputRef}
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          hidden
          onChange={(e) => void accept(e.target.files)}
        />

        {error && (
          <Alert tone="error" className="forensics-error">
            {error}
          </Alert>
        )}

        <div className="forensics-actions">
          <Button
            onClick={() => void run()}
            disabled={!file || running}
            loading={running}
          >
            {running ? "Running forensics…" : "Run forensics"}
          </Button>
          {!running && (
            <Button variant="ghost" onClick={file ? clear : openPicker}>
              {file ? "Clear" : "Browse files"}
            </Button>
          )}
        </div>
      </Card>

      {running && (
        <Card padding="lg" className="forensics-loading-card">
          <Spinner size="lg" />
          <p>Running metadata, ELA, noise, and C2PA checks…</p>
        </Card>
      )}

      {result && <ForensicsResultPanel result={result} />}
    </AppShell>
  );
};

const ForensicsResultPanel: React.FC<{ result: ForensicsRunResponse }> = ({
  result,
}) => {
  const { metadata, ela, noise, c2pa } = result.forensics;

  return (
    <section className="forensics-results" aria-label="Forensics result">
      <h2 className="forensics-results-title">
        Forensics result — {result.file_name}
      </h2>

      <Card padding="lg" className="forensics-section">
        <h3>Content provenance (C2PA)</h3>
        <Alert tone={c2pa.found ? "success" : "info"}>
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
              <dd>{metadata.file_info?.format ?? "—"}</dd>
              <dt>Dimensions</dt>
              <dd>
                {metadata.file_info
                  ? `${metadata.file_info.width} × ${metadata.file_info.height}`
                  : "—"}
              </dd>
              <dt>Camera make</dt>
              <dd>{metadata.camera_make ?? "—"}</dd>
              <dt>Camera model</dt>
              <dd>{metadata.camera_model ?? "—"}</dd>
              <dt>Software</dt>
              <dd>{metadata.software ?? "—"}</dd>
              <dt>Date taken</dt>
              <dd>{metadata.date_taken ?? "—"}</dd>
              <dt>GPS data present</dt>
              <dd>{metadata.has_gps ? "Yes" : "No"}</dd>
            </dl>
            {metadata.exif && Object.keys(metadata.exif).length > 0 && (
              <details className="forensics-raw">
                <summary>
                  All EXIF tags ({Object.keys(metadata.exif).length})
                </summary>
                <pre>{JSON.stringify(metadata.exif, null, 2)}</pre>
              </details>
            )}
          </>
        ) : (
          <Alert tone="warning">
            Metadata extraction failed: {metadata.error ?? "unknown error"}
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
          <Alert tone="warning">
            ELA failed: {ela.error ?? "unknown error"}
          </Alert>
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
          <Alert tone="warning">
            Noise analysis failed: {noise.error ?? "unknown error"}
          </Alert>
        )}
      </Card>
    </section>
  );
};
