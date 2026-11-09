import React, { useCallback, useLayoutEffect, useRef, useState, useEffect } from 'react'
import { Button } from './ui'
import {
  LEARN_SIGNAL_EXPLANATIONS,
  LEARN_SIGNAL_LABELS,
  type LearnAsset,
  type LearnSignal,
} from '../learn/types'

const LENS_SIZE = 140
const SIGNALS: LearnSignal[] = ['ela', 'noise', 'edges']

type ContentBox = { left: number; top: number; width: number; height: number }

type Cell = { row: number; col: number; ela: number; noise: number; edges: number }

interface ForensicsMagnifierProps {
  asset: LearnAsset
  imageSrc: string
}

export const ForensicsMagnifier: React.FC<ForensicsMagnifierProps> = ({ asset, imageSrc }) => {
  const viewportRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)
  const [contentBox, setContentBox] = useState<ContentBox | null>(null)
  const [lensPos, setLensPos] = useState<{ x: number; y: number } | null>(null)
  const [cell, setCell] = useState<Cell | null>(null)
  const [activeSignal, setActiveSignal] = useState<LearnSignal>('ela')

  const measureContent = useCallback(() => {
    const viewport = viewportRef.current
    const img = imgRef.current
    if (!viewport || !img || !img.naturalWidth || !img.naturalHeight) {
      setContentBox(null)
      return
    }
    const vw = viewport.clientWidth
    const vh = viewport.clientHeight
    const fit = Math.min(vw / img.naturalWidth, vh / img.naturalHeight)
    const width = img.naturalWidth * fit
    const height = img.naturalHeight * fit
    setContentBox({
      left: (vw - width) / 2,
      top: (vh - height) / 2,
      width,
      height,
    })
  }, [])

  useLayoutEffect(() => {
    measureContent()
  }, [imageSrc, measureContent])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const ro = new ResizeObserver(() => measureContent())
    ro.observe(viewport)
    return () => ro.disconnect()
  }, [measureContent])

  const updateFromPoint = (clientX: number, clientY: number) => {
    const viewport = viewportRef.current
    if (!viewport || !contentBox) return

    const rect = viewport.getBoundingClientRect()
    const px = clientX - rect.left
    const py = clientY - rect.top

    const nx = (px - contentBox.left) / contentBox.width
    const ny = (py - contentBox.top) / contentBox.height

    if (nx < 0 || nx >= 1 || ny < 0 || ny >= 1) {
      setLensPos(null)
      setCell(null)
      return
    }

    const col = Math.min(asset.cols - 1, Math.max(0, Math.floor(nx * asset.cols)))
    const row = Math.min(asset.rows - 1, Math.max(0, Math.floor(ny * asset.rows)))

    setCell({
      row,
      col,
      ela: asset.ela_grid[row][col],
      noise: asset.noise_grid[row][col],
      edges: asset.edge_grid[row][col],
    })

    // Lens follows the raw cursor position, clamped so it never sits outside the image.
    const clampedX = Math.min(contentBox.left + contentBox.width, Math.max(contentBox.left, px))
    const clampedY = Math.min(contentBox.top + contentBox.height, Math.max(contentBox.top, py))
    setLensPos({ x: clampedX, y: clampedY })
  }

  const onPointerMove = (e: React.PointerEvent) => {
    updateFromPoint(e.clientX, e.clientY)
  }

  const onPointerLeave = () => {
    setLensPos(null)
    setCell(null)
  }

  return (
    <div className="forensics-magnifier">
      <div
        ref={viewportRef}
        className="forensics-magnifier__viewport"
        onPointerMove={onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        <img
          ref={imgRef}
          className="forensics-magnifier__img"
          src={imageSrc}
          alt="Teaching sample for forensic inspection"
          draggable={false}
          onLoad={measureContent}
        />
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

      <div className="forensics-magnifier__controls" role="group" aria-label="Signal to emphasize">
        {SIGNALS.map((signal) => (
          <Button
            key={signal}
            type="button"
            variant={activeSignal === signal ? 'primary' : 'ghost'}
            size="sm"
            aria-pressed={activeSignal === signal}
            onClick={() => setActiveSignal(signal)}
          >
            {LEARN_SIGNAL_LABELS[signal]}
          </Button>
        ))}
      </div>

      <div className="forensics-magnifier__readout" aria-live="polite">
        {cell ? (
          <>
            <dl className="learn-kv">
              <dt>Region</dt>
              <dd>
                row {cell.row + 1} / col {cell.col + 1}
              </dd>
              <dt>ELA (block mean diff)</dt>
              <dd>{cell.ela.toFixed(2)}</dd>
              <dt>Noise (block variance)</dt>
              <dd>{cell.noise.toFixed(2)}</dd>
              <dt>Edge density (gradient magnitude)</dt>
              <dd>{cell.edges.toFixed(2)}</dd>
            </dl>
            <p className="forensics-magnifier__explain">
              <strong>{LEARN_SIGNAL_LABELS[activeSignal]}:</strong>{' '}
              {LEARN_SIGNAL_EXPLANATIONS[activeSignal]}
            </p>
          </>
        ) : (
          <p className="forensics-magnifier__hint">
            Move your cursor over the image to inspect a region.
          </p>
        )}
      </div>
    </div>
  )
}
