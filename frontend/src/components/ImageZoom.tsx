import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Finding } from '../detection/detector'
import { Button } from './ui'

const MIN_SCALE = 1
const MAX_SCALE = 4
const STEP = 0.5

type ContentBox = { left: number; top: number; width: number; height: number }

type ImageZoomProps = {
  src: string
  alt: string
  findings?: Finding[]
}

function clampScale(value: number) {
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value))
}

function pointInFinding(nx: number, ny: number, finding: Finding) {
  return (
    nx >= finding.x &&
    nx <= finding.x + finding.w &&
    ny >= finding.y &&
    ny <= finding.y + finding.h
  )
}

export const ImageZoom: React.FC<ImageZoomProps> = ({ src, alt, findings = [] }) => {
  const [scale, setScale] = useState(MIN_SCALE)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [contentBox, setContentBox] = useState<ContentBox | null>(null)
  const [activeId, setActiveId] = useState<string | null>(null)
  const dragging = useRef(false)
  const lastPoint = useRef({ x: 0, y: 0 })
  const viewportRef = useRef<HTMLDivElement>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  const active = findings.find((f) => f.id === activeId) ?? null

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
  }, [src, measureContent])

  useEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return
    const ro = new ResizeObserver(() => measureContent())
    ro.observe(viewport)
    return () => ro.disconnect()
  }, [measureContent])

  const zoomIn = () => setScale((s) => clampScale(s + STEP))
  const zoomOut = () => {
    setScale((s) => {
      const next = clampScale(s - STEP)
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 })
      return next
    })
  }
  const reset = () => {
    setScale(MIN_SCALE)
    setOffset({ x: 0, y: 0 })
  }

  const onWheel = useCallback((e: WheelEvent) => {
    e.preventDefault()
    setScale((s) => {
      const next = clampScale(s + (e.deltaY < 0 ? STEP / 2 : -STEP / 2))
      if (next === MIN_SCALE) setOffset({ x: 0, y: 0 })
      return next
    })
  }, [])

  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [onWheel])

  // When zoomed, auto-select the finding under the viewport center.
  useEffect(() => {
    if (scale <= MIN_SCALE || !contentBox || findings.length === 0) return
    const viewport = viewportRef.current
    if (!viewport) return

    const vw = viewport.clientWidth
    const vh = viewport.clientHeight
    const stageX = vw / 2 - offset.x / scale
    const stageY = vh / 2 - offset.y / scale
    const nx = (stageX - contentBox.left) / contentBox.width
    const ny = (stageY - contentBox.top) / contentBox.height

    const hit = findings.find((f) => pointInFinding(nx, ny, f))
    if (hit) setActiveId(hit.id)
  }, [scale, offset, contentBox, findings])

  const onPointerDown = (e: React.PointerEvent) => {
    if (scale <= MIN_SCALE) return
    if ((e.target as HTMLElement).closest('.image-zoom__marker')) return
    dragging.current = true
    lastPoint.current = { x: e.clientX, y: e.clientY }
    viewportRef.current?.setPointerCapture?.(e.pointerId)
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return
    const dx = e.clientX - lastPoint.current.x
    const dy = e.clientY - lastPoint.current.y
    lastPoint.current = { x: e.clientX, y: e.clientY }
    setOffset((o) => ({ x: o.x + dx, y: o.y + dy }))
  }

  const onPointerUp = () => {
    dragging.current = false
  }

  return (
    <div className="image-zoom">
      <div
        ref={viewportRef}
        className={`image-zoom__viewport${scale > MIN_SCALE ? ' image-zoom__viewport--pannable' : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          className="image-zoom__stage"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          }}
        >
          <img
            ref={imgRef}
            className="image-zoom__img"
            src={src}
            alt={alt}
            draggable={false}
            onLoad={measureContent}
          />
          {contentBox && findings.length > 0 ? (
            <div
              className="image-zoom__findings"
              style={{
                left: contentBox.left,
                top: contentBox.top,
                width: contentBox.width,
                height: contentBox.height,
              }}
            >
              {findings.map((finding, index) => {
                const selected = finding.id === activeId
                return (
                  <button
                    key={finding.id}
                    type="button"
                    className={`image-zoom__marker${selected ? ' image-zoom__marker--active' : ''}`}
                    style={{
                      left: `${finding.x * 100}%`,
                      top: `${finding.y * 100}%`,
                      width: `${finding.w * 100}%`,
                      height: `${finding.h * 100}%`,
                    }}
                    aria-label={`Finding: ${finding.label}`}
                    aria-pressed={selected}
                    onClick={(e) => {
                      e.stopPropagation()
                      setActiveId(finding.id)
                    }}
                  >
                    <span className="image-zoom__marker-badge">{index + 1}</span>
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>
      </div>

      <div className="image-zoom__controls" role="group" aria-label="Zoom controls">
        <Button type="button" variant="ghost" size="sm" onClick={zoomOut} disabled={scale <= MIN_SCALE}>
          −
        </Button>
        <span className="image-zoom__level">{Math.round(scale * 100)}%</span>
        <Button type="button" variant="ghost" size="sm" onClick={zoomIn} disabled={scale >= MAX_SCALE}>
          +
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={reset} disabled={scale <= MIN_SCALE}>
          Reset
        </Button>
      </div>

      {findings.length > 0 ? (
        <div className="image-zoom__explain" aria-live="polite">
          {active ? (
            <>
              <p className="image-zoom__explain-label">{active.label}</p>
              <p className="image-zoom__explain-body">{active.explanation}</p>
              <p className="image-zoom__explain-note">
                Model-suggested cue — not definitive proof. Zoom into marked areas to inspect.
              </p>
            </>
          ) : (
            <p className="image-zoom__explain-body">
              Tap a numbered region or zoom into a marked area to see why it may look manipulated.
            </p>
          )}
        </div>
      ) : null}
    </div>
  )
}
