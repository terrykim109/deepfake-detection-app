import type {
  ForensicsC2paResult,
  ForensicsMetadataResult,
} from "../api/client";

export interface LearnAsset {
  image_width: number;
  image_height: number;
  block_size: number;
  rows: number;
  cols: number;
  ela_grid: number[][];
  noise_grid: number[][];
  edge_grid: number[][];
  metadata: ForensicsMetadataResult;
  c2pa: ForensicsC2paResult;
}

export type LearnSignal = "ela" | "noise" | "edges";

export const LEARN_SIGNAL_LABELS: Record<LearnSignal, string> = {
  ela: "Error Level Analysis",
  noise: "Noise / block variance",
  edges: "Edge / gradient density",
};

export const LEARN_SIGNAL_EXPLANATIONS: Record<LearnSignal, string> = {
  ela: "Highlights regions resaved at a different compression level than the rest of the image — often a sign of local editing.",
  noise:
    "Highlights regions whose sensor-noise pattern is inconsistent with their surroundings — a classic splicing cue.",
  edges:
    "Highlights how sharp or busy an area is. Unnaturally soft or mismatched edges can suggest blending or AI generation.",
};
