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

export interface LearnCell {
  row: number;
  col: number;
  ela: number;
  noise: number;
  edges: number;
}

export interface GridStats {
  min: number;
  max: number;
  mean: number;
  median: number;
  p90: number;
}

export type LearnMeaningTone = "normal" | "flagged";

export interface LearnMeaning {
  label: string;
  tone: LearnMeaningTone;
}

export interface LearnMeaningDetail extends LearnMeaning {
  value: number;
  localMedian: number;
  localMad: number;
  noiseFloor: number;
  denominator: number;
  deviation: number;
  threshold: number;
  neighborCount: number;
}

export const LOCAL_NEIGHBOR_RADIUS = 2;
export const LOCAL_DEVIATION_THRESHOLD = 4;

function median(sortedValues: number[]): number {
  return sortedValues[Math.floor(sortedValues.length / 2)];
}

/**
 * Flags a block "Flagged" only when it stands out from the blocks
 * immediately around it (a splice/edit boundary cue), not just when it's
 * high relative to the whole image — the top 10% of *any* photo's own
 * values would otherwise always get flagged, authentic or not. Returns
 * the full breakdown so callers can explain *why*, not just show a label.
 */
export function describeMeaningDetail(
  grid: number[][],
  row: number,
  col: number,
  stats: GridStats,
): LearnMeaningDetail {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const value = grid[row][col];
  const noiseFloor = (stats.max - stats.min) * 0.01;

  const neighbors: number[] = [];
  for (let dr = -LOCAL_NEIGHBOR_RADIUS; dr <= LOCAL_NEIGHBOR_RADIUS; dr++) {
    for (let dc = -LOCAL_NEIGHBOR_RADIUS; dc <= LOCAL_NEIGHBOR_RADIUS; dc++) {
      if (dr === 0 && dc === 0) continue;
      const r = row + dr;
      const c = col + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) {
        neighbors.push(grid[r][c]);
      }
    }
  }

  if (neighbors.length === 0) {
    return {
      label: "Normal",
      tone: "normal",
      value,
      localMedian: value,
      localMad: 0,
      noiseFloor,
      denominator: Math.max(noiseFloor, 1e-9),
      deviation: 0,
      threshold: LOCAL_DEVIATION_THRESHOLD,
      neighborCount: 0,
    };
  }

  const sortedNeighbors = [...neighbors].sort((a, b) => a - b);
  const localMedian = median(sortedNeighbors);
  const absoluteDeviations = sortedNeighbors
    .map((v) => Math.abs(v - localMedian))
    .sort((a, b) => a - b);
  const localMad = median(absoluteDeviations);

  // A noise floor (1% of this image's own value range) keeps near-flat
  // neighborhoods — where MAD is ~0 — from flagging on trivial jitter.
  const denominator = Math.max(localMad, noiseFloor, 1e-9);
  const deviation = Math.abs(value - localMedian) / denominator;
  const isFlagged = deviation >= LOCAL_DEVIATION_THRESHOLD;

  return {
    label: isFlagged ? "Flagged" : "Normal",
    tone: isFlagged ? "flagged" : "normal",
    value,
    localMedian,
    localMad,
    noiseFloor,
    denominator,
    deviation,
    threshold: LOCAL_DEVIATION_THRESHOLD,
    neighborCount: neighbors.length,
  };
}

export function describeMeaning(
  grid: number[][],
  row: number,
  col: number,
  stats: GridStats,
): LearnMeaning {
  const { label, tone } = describeMeaningDetail(grid, row, col, stats);
  return { label, tone };
}

export function gridForSignal(
  asset: LearnAsset,
  signal: LearnSignal,
): number[][] {
  if (signal === "ela") return asset.ela_grid;
  if (signal === "noise") return asset.noise_grid;
  return asset.edge_grid;
}

export interface MagnitudeComparison {
  phrase: string;
  higher: boolean;
}

/** Phrases how much larger/smaller one value is than another, e.g. "almost 5 times". */
export function compareMagnitude(
  a: number,
  b: number,
): MagnitudeComparison | null {
  const epsilon = 1e-6;
  const higher = a >= b;
  const small = Math.min(Math.abs(a), Math.abs(b));
  const large = Math.max(Math.abs(a), Math.abs(b));

  if (large < epsilon) return null;
  if (small < epsilon) return { phrase: "far", higher };

  const ratio = large / small;
  const rounded = Math.round(ratio);
  const phrase =
    Math.abs(ratio - rounded) <= 0.2 && rounded >= 2
      ? `almost ${rounded} times`
      : `about ${ratio.toFixed(1)} times`;
  return { phrase, higher };
}

export const LEARN_SIGNAL_LABELS: Record<LearnSignal, string> = {
  ela: "Error Level Analysis",
  noise: "Noise / block variance",
  edges: "Edge / gradient density",
};

// export const LEARN_SIGNAL_EXPLANATIONS: Record<LearnSignal, string> = {
//   ela: "Highlights regions resaved at a different compression level than the rest of the image — often a sign of local editing.",
//   noise:
//     "Highlights regions whose sensor-noise pattern is inconsistent with their surroundings — a classic splicing cue.",
//   edges:
//     "Highlights how sharp or busy an area is. Unnaturally soft or mismatched edges can suggest blending or AI generation.",
// };

export const LEARN_SIGNAL_EXPLANATIONS: Record<LearnSignal, string> = {
  ela: "Shows how different parts of an image change when image has been re-compressed.",

  noise: "Looks for differences in the tiny pixel variations across an image.",

  edges: "Looks at how sharp or smooth the boundaries and details are.",
};
