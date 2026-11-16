import React, { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ForensicsMagnifier } from "../components/ForensicsMagnifier";
import { Button, PageHeader } from "../components/ui";
import {
  compareMagnitude,
  describeMeaning,
  describeMeaningDetail,
  gridForSignal,
  LEARN_SIGNAL_EXPLANATIONS,
  LEARN_SIGNAL_LABELS,
  type GridStats,
  type LearnAsset,
  type LearnCell,
  type LearnSignal,
} from "../learn/types";
import deepfakeData from "../data/learn/fake-image.json";
import "../styles/forensicsTest.css";
import "../styles/learn.css";

const asset = deepfakeData as LearnAsset;
const IMAGE_SRC = "/assets/learn/fake-image.jpg";
const SIGNALS: LearnSignal[] = ["ela", "noise", "edges"];

function gridStats(grid: number[][]): GridStats {
  const flat = grid.flat();
  const sorted = [...flat].sort((a, b) => a - b);
  const n = sorted.length;
  const mean = flat.reduce((sum, v) => sum + v, 0) / n;
  return {
    min: sorted[0],
    max: sorted[n - 1],
    mean,
    median: sorted[Math.floor(n / 2)],
    p90: sorted[Math.floor(n * 0.9)],
  };
}

const stats = {
  ela: gridStats(asset.ela_grid),
  noise: gridStats(asset.noise_grid),
  edges: gridStats(asset.edge_grid),
};

export const Learn: React.FC = () => {
  const [pinnedCell, setPinnedCell] = useState<LearnCell | null>(null);
  const [hoverCell, setHoverCell] = useState<LearnCell | null>(null);
  const [activeSignal, setActiveSignal] = useState<LearnSignal>("ela");

  return (
    <AppShell>
      <PageHeader
        title="Interactive Forensics"
        subtitle="Learn how to understand the flagged areas in the forensics section."
      />

      <div className="learn-layout">
        <div className="learn-layout__image">
          <ForensicsMagnifier
            asset={asset}
            imageSrc={IMAGE_SRC}
            onCellChange={setHoverCell}
            onCellClick={setPinnedCell}
            pinnedCell={pinnedCell}
            activeSignal={activeSignal}
            stats={stats}
          />

          {/* <div className="learn-explain">
            <div className="forensics-section">
              <h4>ELA (block mean diff)</h4>
              <p>
                ELA (Error Level Analysis) measures how much a region's
                brightness shifts when the photo is resaved at a slightly
                different JPEG quality. An untouched camera photo usually shows
                this near zero almost everywhere. Here, though, the typical
                block sits at {fmt(stats.ela.median)}, and 90% of the image is
                below {fmt(stats.ela.p90)} — a consistently elevated baseline
                across most of the frame, rather than just a few edited patches,
                which can mean this file went through an extra recompression or
                regeneration pass that a single genuine camera capture wouldn't
                show.
              </p>
            </div>

            <div className="forensics-section">
              <h4>Noise (block variance)</h4>
              <p>
                In this image, noise variance tops out at {fmt(stats.noise.max)}{" "}
                (mean {fmt(stats.noise.mean)}, median {fmt(stats.noise.median)}
                ). Real camera photos typically show much higher peaks in richly
                textured areas — hair, fabric, skin pores — often reaching into
                the tens of thousands for a detailed photo. A ceiling this low
                across an entire image is a common side effect of AI image
                generation or heavy smoothing: generative models tend to
                under-produce the fine sensor-level texture a real camera
                captures.
              </p>
            </div>

            <div className="forensics-section">
              <h4>Edge density (gradient magnitude)</h4>
              <p>
                Edge density here ({fmt(stats.edges.min)} to{" "}
                {fmt(stats.edges.max)}, averaging {fmt(stats.edges.mean)}) looks
                like a normal photo on this signal — sharp boundaries like the
                hairline and eyes still read as sharp. That&apos;s a useful
                reminder that no single signal lights up for every kind of
                manipulation: this image&apos;s biggest tell is the ELA pattern
                above, not its edges.
              </p>
            </div>
          </div> */}
        </div>

        <div className="learn-layout__teach">
          <div className="learn-teach">
            <h3>Selected block</h3>

            <div
              className="learn-teach__signal-controls"
              role="group"
              aria-label="Signal to emphasize"
            >
              {SIGNALS.map((signal) => (
                <div className="learn-tooltip-wrap" key={signal}>
                  <Button
                    type="button"
                    variant={activeSignal === signal ? "primary" : "ghost"}
                    size="sm"
                    aria-pressed={activeSignal === signal}
                    onClick={() => setActiveSignal(signal)}
                  >
                    {LEARN_SIGNAL_LABELS[signal]}
                  </Button>
                  <span className="learn-tooltip" role="tooltip">
                    {LEARN_SIGNAL_EXPLANATIONS[signal]}
                  </span>
                </div>
              ))}
            </div>

            {pinnedCell ? (
              (() => {
                const detail = describeMeaningDetail(
                  gridForSignal(asset, activeSignal),
                  pinnedCell.row,
                  pinnedCell.col,
                  stats[activeSignal],
                );
                const flagged = detail.tone === "flagged";
                const vsNeighbors = compareMagnitude(
                  detail.value,
                  detail.localMedian,
                );

                return (
                  <>
                    <div className="learn-teach__why-stats">
                      <div className="learn-teach__why-stat">
                        <div className="learn-teach__why-label">
                          Selected area: {detail.value.toFixed(2)}
                        </div>
                      </div>
                      <div className="learn-teach__why-stat">
                        <div className="learn-teach__why-label">
                          Typical nearby area: {detail.localMedian.toFixed(2)}
                        </div>
                      </div>
                      <br />
                    </div>
                    <p className="learn-teach__why-summary">
                      {vsNeighbors && (
                        <>
                          That's {vsNeighbors.phrase}{" "}
                          {vsNeighbors.higher ? "higher" : "lower"} than its
                          neighbours.
                        </>
                      )}
                    </p>

                    <h4
                      className={`learn-teach__flag-status learn-teach__flag-status--${
                        flagged ? "flagged" : "not-flagged"
                      }`}
                    >
                      {flagged ? "Flagged" : "Not flagged"}
                    </h4>
                    <p>
                      Nearby areas naturally have small differences, with a
                      typical variation of about {detail.denominator.toFixed(2)}
                      .
                    </p>
                    {flagged ? (
                      <>
                        <p>
                          However, this area's value is{" "}
                          {detail.deviation.toFixed(1)} times greater than what
                          we would normally expect.
                        </p>
                        <p>
                          Our system flags areas when this number reaches{" "}
                          {detail.threshold} times or more.
                        </p>
                        <p>
                          <strong>IMPORTANT NOTE: </strong>This makes the area
                          worth a closer look, but it does not necessarily mean
                          the image has been edited.
                        </p>
                      </>
                    ) : (
                      <>
                        <p>
                          This area's value is close to what we would normally
                          expect from its neighbours since the difference is
                          only {detail.deviation.toFixed(1)} times the typical
                          variation.
                        </p>
                        <p>
                          Our system only flags areas when this number reaches{" "}
                          {detail.threshold} times or more.
                        </p>
                        <p>
                          This area does not stand out enough to need a closer
                          look.
                        </p>
                      </>
                    )}
                  </>
                );
              })()
            ) : (
              <p className="learn-teach__live learn-teach__live--hint">
                Click a block in the image (highlighted or not) to examine
                values for each forensics section.
              </p>
            )}
          </div>

          <div className="learn-teach__readout" aria-live="polite">
            {(() => {
              const displayCell = hoverCell ?? pinnedCell;
              if (!displayCell) {
                return (
                  <p className="learn-teach__hint">
                    Move your cursor over the image to inspect a region.
                  </p>
                );
              }

              const elaMeaning = describeMeaning(
                asset.ela_grid,
                displayCell.row,
                displayCell.col,
                stats.ela,
              );
              const noiseMeaning = describeMeaning(
                asset.noise_grid,
                displayCell.row,
                displayCell.col,
                stats.noise,
              );
              const edgesMeaning = describeMeaning(
                asset.edge_grid,
                displayCell.row,
                displayCell.col,
                stats.edges,
              );
              return (
                <>
                  <dl className="learn-kv">
                    <dt>Region</dt>
                    <dd>
                      row {displayCell.row + 1} / col {displayCell.col + 1}
                    </dd>
                    <dt>ELA (block mean diff)</dt>
                    <dd>
                      <span className="learn-kv__value">
                        {displayCell.ela.toFixed(2)}
                      </span>
                      <span
                        className={`learn-kv__meaning learn-kv__meaning--${elaMeaning.tone}`}
                      >
                        {elaMeaning.label}
                      </span>
                    </dd>
                    <dt>Noise (block variance)</dt>
                    <dd>
                      <span className="learn-kv__value">
                        {displayCell.noise.toFixed(2)}
                      </span>
                      <span
                        className={`learn-kv__meaning learn-kv__meaning--${noiseMeaning.tone}`}
                      >
                        {noiseMeaning.label}
                      </span>
                    </dd>
                    <dt>Edge density (gradient magnitude)</dt>
                    <dd>
                      <span className="learn-kv__value">
                        {displayCell.edges.toFixed(2)}
                      </span>
                      <span
                        className={`learn-kv__meaning learn-kv__meaning--${edgesMeaning.tone}`}
                      >
                        {edgesMeaning.label}
                      </span>
                    </dd>
                  </dl>
                  <p className="learn-teach__explain">
                    <strong>{LEARN_SIGNAL_LABELS[activeSignal]}:</strong>{" "}
                    {LEARN_SIGNAL_EXPLANATIONS[activeSignal]}
                  </p>
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </AppShell>
  );
};
