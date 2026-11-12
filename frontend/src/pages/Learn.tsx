import React from "react";
import { AppShell } from "../components/AppShell";
import { ForensicsMagnifier } from "../components/ForensicsMagnifier";
import { Alert, Card, PageHeader } from "../components/ui";
import type { LearnAsset } from "../learn/types";
import learnData from "../data/learn/teaching-sample.json";
import "../styles/forensicsTest.css";
import "../styles/learn.css";

const asset = learnData as LearnAsset;
const IMAGE_SRC = "/assets/learn/teaching-sample.jpg";

export const Learn: React.FC = () => {
  const { metadata, c2pa } = asset;

  return (
    <AppShell>
      <PageHeader
        title="Learn how image forensics works"
        subtitle="Move your cursor over the image below to inspect forensic signals region by region — no AI involved, just classic image processing."
      />

      <Card padding="lg">
        <ForensicsMagnifier asset={asset} imageSrc={IMAGE_SRC} />
      </Card>

      <Card padding="lg" className="learn-global-panel">
        <h3>Global metadata &amp; provenance</h3>
        <p className="learn-global-panel__note">
          Unlike the regional signals above, these facts describe the whole file
          and don&apos;t change as you scan the image.
        </p>

        <div className="forensics-section">
          <h4>Metadata / EXIF</h4>
          {metadata.available ? (
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
              <dt>GPS data present</dt>
              <dd>{metadata.has_gps ? "Yes" : "No"}</dd>
            </dl>
          ) : (
            <Alert tone="warning">
              Metadata extraction failed: {metadata.error ?? "unknown error"}
            </Alert>
          )}
        </div>

        <div className="forensics-section">
          <h4>Content provenance (C2PA)</h4>
          <Alert tone={c2pa.found ? "success" : "info"}>
            {c2pa.detail}
            {c2pa.claim_generator && <> — generator: {c2pa.claim_generator}</>}
          </Alert>
        </div>
      </Card>
    </AppShell>
  );
};
