/* The seam between the app and whatever performs deepfake detection.
   httpDetector calls the backend /api/analysis/run path (DFD-02). */

import type { ForensicsResult } from "../api/client";
export type Verdict = "real" | "warn" | "fake";

export type AnalysisStage =
  | "idle"
  | "validating"
  | "connecting"
  | "processing"
  | "analyzing"
  | "finalizing"
  | "completed"
  | "failed";

export const ANALYSIS_STAGE_LABELS: Record<AnalysisStage, string> = {
  idle: "",
  validating: "Checking your image…",
  connecting: "Connecting to analysis service…",
  processing: "Preparing a secure temporary copy…",
  analyzing: "Running detection and online search…",
  finalizing: "Removing the temporary image…",
  completed: "Analysis complete",
  failed: "Analysis could not be completed",
};

/** Normalized 0–1 region cue from vision analysis (session-only). */
export interface Finding {
  id: string;
  label: string;
  explanation: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Detection {
  verdict: Verdict;
  verdictLabel: string;
  confidence: number;
  summary: string;
  /** Optional server-issued id / privacy fields from /analysis/run */
  id?: string;
  provider?: string;
  imageDeleted?: boolean;
  imageStoredAt?: string | null;
  imageDeletedAt?: string | null;
  privacyMessage?: string;
  createdAt?: string;
  /** Region hotspots for Results zoom; not persisted to History. */
  findings?: Finding[];
  /** Scrappa reverse image search; session-only on Results. */
  onlineSearch?: OnlineSearchInfo | null;
  detectionError?: string | null;
  /** Independent forensics engine (metadata/EXIF, ELA, noise, C2PA); session-only on Results. */
  forensics?: ForensicsResult | null;
}

export type OnlineMatchType = "exact" | "visual" | "related";

export interface OnlineSearchHit {
  title: string;
  link: string;
  source: string;
  thumbnail: string | null;
  matchType: OnlineMatchType;
  position: number | null;
}

export interface OnlineSearchInfo {
  status: "ok" | "empty" | "error";
  totalCount: number;
  exactCount: number;
  visualCount: number;
  relatedCount: number;
  results: OnlineSearchHit[];
  error: string | null;
  disclaimer: string;
}

export type StatusCallback = (stage: AnalysisStage) => void;

export interface Detector {
  analyze(
    file: File,
    signal?: AbortSignal,
    onStatus?: StatusCallback,
  ): Promise<Detection>;
}

export const abortError = (): DOMException =>
  new DOMException("Analysis aborted", "AbortError");
