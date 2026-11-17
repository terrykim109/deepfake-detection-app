import React, {
  useCallback,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useEffect,
} from "react";
import {
  describeMeaning,
  gridForSignal,
  LEARN_SIGNAL_LABELS,
  type GridStats,
  type LearnAsset,
  type LearnCell,
  type LearnSignal,
} from "../learn/types";

const LENS_SIZE = 140;

type ContentBox = { left: number; top: number; width: number; height: number };

interface ForensicsMagnifierProps {
  asset: LearnAsset;
  imageSrc: string;
  /** Called whenever the hovered block changes, including with null on pointer-leave. */
  onCellChange?: (cell: LearnCell | null) => void;
  /** Called whenever a block is clicked, to be pinned by the caller. */
  onCellClick?: (cell: LearnCell) => void;
  /** The currently pinned block, if any — drawn as a blue outline on the image. */
  pinnedCell?: LearnCell | null;
  /** Which signal's grid to outline/read out — the toggle buttons live in the caller now. */
  activeSignal: LearnSignal;
  stats: { ela: GridStats; noise: GridStats; edges: GridStats };
}

export const ForensicsMagnifier: React.FC<ForensicsMagnifierProps> = ({
  asset,
  imageSrc,
  onCellChange,
  onCellClick,
  pinnedCell,
  activeSignal,
  stats,
}) => {
  const viewportRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);
  const [contentBox, setContentBox] = useState<ContentBox | null>(null);
  const [lensPos, setLensPos] = useState<{ x: number; y: number } | null>(null);
  const [cell, setCell] = useState<LearnCell | null>(null);

  const activeGrid = gridForSignal(asset, activeSignal);
  const activeStats = stats[activeSignal];

  const outlierBlocks = useMemo(() => {
    const blocks: { row: number; col: number }[] = [];
    for (let r = 0; r < asset.rows; r++) {
      for (let c = 0; c < asset.cols; c++) {
        if (describeMeaning(activeGrid, r, c, activeStats).tone === "flagged") {
          blocks.push({ row: r, col: c });
        }
      }
    }
    return blocks;
  }, [activeGrid, activeStats, asset.rows, asset.cols]);

  const measureContent = useCallback(() => {
    const viewport = viewportRef.current;
    const img = imgRef.current;
    if (!viewport || !img || !img.naturalWidth || !img.naturalHeight) {
      setContentBox(null);
      return;
    }
    const vw = viewport.clientWidth;
    const vh = viewport.clientHeight;
    const fit = Math.min(vw / img.naturalWidth, vh / img.naturalHeight);
    const width = img.naturalWidth * fit;
    const height = img.naturalHeight * fit;
    setContentBox({
      left: (vw - width) / 2,
      top: (vh - height) / 2,
      width,
      height,
    });
  }, []);

  useLayoutEffect(() => {
    measureContent();
  }, [imageSrc, measureContent]);

  useEffect(() => {
    onCellChange?.(cell);
  }, [cell, onCellChange]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const ro = new ResizeObserver(() => measureContent());
    ro.observe(viewport);
    return () => ro.disconnect();
  }, [measureContent]);

  const updateFromPoint = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current;
    if (!viewport || !contentBox) return;

    const rect = viewport.getBoundingClientRect();
    const px = clientX - rect.left;
    const py = clientY - rect.top;

    const nx = (px - contentBox.left) / contentBox.width;
    const ny = (py - contentBox.top) / contentBox.height;

    if (nx < 0 || nx >= 1 || ny < 0 || ny >= 1) {
      setLensPos(null);
      setCell(null);
      return;
    }

    const col = Math.min(
      asset.cols - 1,
      Math.max(0, Math.floor(nx * asset.cols)),
    );
    const row = Math.min(
      asset.rows - 1,
      Math.max(0, Math.floor(ny * asset.rows)),
    );

    setCell({
      row,
      col,
      ela: asset.ela_grid[row][col],
      noise: asset.noise_grid[row][col],
      edges: asset.edge_grid[row][col],
    });

    // Lens follows the raw cursor position, clamped so it never sits outside the image.
    const clampedX = Math.min(
      contentBox.left + contentBox.width,
      Math.max(contentBox.left, px),
    );
    const clampedY = Math.min(
      contentBox.top + contentBox.height,
      Math.max(contentBox.top, py),
    );
    setLensPos({ x: clampedX, y: clampedY });
  };

  const onPointerMove = (e: React.PointerEvent) => {
    updateFromPoint(e.clientX, e.clientY);
  };

  const onPointerLeave = () => {
    setLensPos(null);
    setCell(null);
  };

  const onViewportClick = (e: React.MouseEvent) => {
    const viewport = viewportRef.current;
    if (!viewport || !contentBox) return;

    const rect = viewport.getBoundingClientRect();
    const px = e.clientX - rect.left;
    const py = e.clientY - rect.top;

    const nx = (px - contentBox.left) / contentBox.width;
    const ny = (py - contentBox.top) / contentBox.height;
    if (nx < 0 || nx >= 1 || ny < 0 || ny >= 1) return;

    const col = Math.min(
      asset.cols - 1,
      Math.max(0, Math.floor(nx * asset.cols)),
    );
    const row = Math.min(
      asset.rows - 1,
      Math.max(0, Math.floor(ny * asset.rows)),
    );

    onCellClick?.({
      row,
      col,
      ela: asset.ela_grid[row][col],
      noise: asset.noise_grid[row][col],
      edges: asset.edge_grid[row][col],
    });
  };

  return (
    <div className="forensics-magnifier">
      <div
        ref={viewportRef}
        className="forensics-magnifier__viewport"
        style={{ aspectRatio: `${asset.image_width} / ${asset.image_height}` }}
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
        onClick={onViewportClick}
      >
        <img
          ref={imgRef}
          className="forensics-magnifier__img"
          src={imageSrc}
          alt="Teaching sample for forensic inspection"
          draggable={false}
          onLoad={measureContent}
        />
        {contentBox &&
          outlierBlocks.map(({ row, col }) => {
            const blockW = contentBox.width / asset.cols;
            const blockH = contentBox.height / asset.rows;
            return (
              <div
                key={`${row}-${col}`}
                className="forensics-magnifier__outlier"
                style={{
                  left: contentBox.left + col * blockW,
                  top: contentBox.top + row * blockH,
                  width: blockW,
                  height: blockH,
                }}
                aria-hidden="true"
              />
            );
          })}
        {contentBox && pinnedCell && (
          <div
            className="forensics-magnifier__pin"
            style={{
              left:
                contentBox.left +
                pinnedCell.col * (contentBox.width / asset.cols),
              top:
                contentBox.top +
                pinnedCell.row * (contentBox.height / asset.rows),
              width: contentBox.width / asset.cols,
              height: contentBox.height / asset.rows,
            }}
            aria-hidden="true"
          />
        )}
        {lensPos && (
          <div
            className="forensics-magnifier__lens"
            style={{
              left: lensPos.x - LENS_SIZE / 2,
              top: lensPos.y - LENS_SIZE / 2,
              width: LENS_SIZE,
              height: LENS_SIZE,
            }}
            aria-hidden="true"
          />
        )}
      </div>

      <p className="forensics-magnifier__outlier-hint">
        Red outlines mark blocks flagged for{" "}
        <strong>{LEARN_SIGNAL_LABELS[activeSignal]}</strong> (
        {outlierBlocks.length} of {asset.rows * asset.cols} blocks). Click any
        block to see why.
      </p>
    </div>
  );
};
