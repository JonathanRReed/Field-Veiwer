import { useEffect, useMemo, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { DragPreview, Excitation, Vec2 } from '../types/particle'
import {
  buildStageLayout,
  pickSlab,
  renderStage,
  unproject
} from '../rendering/fieldRenderer'
import type { ProjectedParticle, SlabKey } from '../rendering/fieldRenderer'

export interface StagePointerEvent {
  panel: SlabKey
  world: Vec2
  pixel: { x: number; y: number }
  hitId: string | null
}

interface FieldStageProps {
  excitations: Excitation[]
  time: number
  running: boolean
  selectedId: string | null
  preview: DragPreview | null
  traceMap: Map<string, Vec2[]>
  showTraces: boolean
  shockwave: { eventId: string; position: Vec2; panel: SlabKey } | null
  hoverPanel: SlabKey | null
  onHoverPanel: (panel: SlabKey | null) => void
  onPointerDown: (event: StagePointerEvent) => void
  onPointerMove: (event: StagePointerEvent) => void
  onPointerUp: (event: StagePointerEvent | null) => void
}

const SHOCKWAVE_DURATION = 1.6

export const FieldStage = ({
  excitations,
  time,
  running,
  selectedId,
  preview,
  traceMap,
  showTraces,
  shockwave,
  hoverPanel,
  onHoverPanel,
  onPointerDown,
  onPointerMove,
  onPointerUp
}: FieldStageProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const projectedRef = useRef<ProjectedParticle[]>([])
  const activePointerRef = useRef<number | null>(null)
  const activePanelRef = useRef<SlabKey | null>(null)
  const shockwaveStartRef = useRef<{ eventId: string; start: number } | null>(null)
  const completedShockwaveIdRef = useRef<string | null>(null)

  // Keep latest props accessible inside the single rAF loop without restarting it.
  const propsRef = useRef({
    excitations,
    time,
    running,
    selectedId,
    preview,
    traceMap,
    showTraces,
    shockwave,
    hoverPanel
  })
  propsRef.current = {
    excitations,
    time,
    running,
    selectedId,
    preview,
    traceMap,
    showTraces,
    shockwave,
    hoverPanel
  }

  useEffect(() => {
    let raf = 0
    const startWall = performance.now()
    let lastRender = 0
    const loop = (now: number) => {
      const canvas = canvasRef.current
      const host = containerRef.current
      if (canvas && host) {
        const rect = host.getBoundingClientRect()
        const width = rect.width
        const height = rect.height
        if (width > 2 && height > 2) {
          const p = propsRef.current
          const activeAnimation = p.running || p.preview !== null || p.shockwave !== null
          const targetInterval = activeAnimation ? 1000 / 60 : 1000 / 20
          if (now - lastRender < targetInterval) {
            raf = requestAnimationFrame(loop)
            return
          }
          lastRender = now
          const widthStyle = `${width}px`
          const heightStyle = `${height}px`
          if (canvas.style.width !== widthStyle) canvas.style.width = widthStyle
          if (canvas.style.height !== heightStyle) canvas.style.height = heightStyle
          const layout = buildStageLayout(width, height)
          const renderTime = (now - startWall) / 1000

          let activeShock: { panel: SlabKey; position: Vec2; age: number; duration: number } | null = null
          if (p.shockwave) {
            if (completedShockwaveIdRef.current !== p.shockwave.eventId) {
              if (!shockwaveStartRef.current || shockwaveStartRef.current.eventId !== p.shockwave.eventId) {
                shockwaveStartRef.current = { eventId: p.shockwave.eventId, start: now }
              }
              const age = (now - shockwaveStartRef.current.start) / 1000
              if (age <= SHOCKWAVE_DURATION) {
                activeShock = {
                  panel: p.shockwave.panel,
                  position: p.shockwave.position,
                  age,
                  duration: SHOCKWAVE_DURATION
                }
              } else {
                completedShockwaveIdRef.current = p.shockwave.eventId
                shockwaveStartRef.current = null
              }
            }
          } else {
            shockwaveStartRef.current = null
            completedShockwaveIdRef.current = null
          }

          renderStage({
            canvas,
            layout,
            excitations: p.excitations,
            time: p.time,
            renderTime,
            selectedId: p.selectedId,
            preview: p.preview,
            shockwave: activeShock,
            showTraces: p.showTraces,
            traces: p.traceMap,
            hoverPanel: p.hoverPanel,
            projectedParticles: projectedRef.current
          })
        }
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  // Guard: container ref exists, so we can resolve pointer→world.
  const resolve = (event: ReactPointerEvent, forcedPanel?: SlabKey): StagePointerEvent | null => {
    const host = containerRef.current
    if (!host) return null
    const rect = host.getBoundingClientRect()
    const px = event.clientX - rect.left
    const py = event.clientY - rect.top
    const layout = buildStageLayout(rect.width, rect.height)
    const slabKey = forcedPanel ?? pickSlab(py, layout)
    if (!slabKey) return null
    const slab = layout.slabs[slabKey]
    const world = unproject(px, py, slab, rect.width)
    if (!world) return null

    // Hit test projected particles (pixel space, radius).
    let hitId: string | null = null
    let bestDistSq = Number.POSITIVE_INFINITY
    for (const projected of projectedRef.current) {
      if (projected.panel !== slabKey) continue
      const dx = projected.x - px
      const dy = projected.y - py
      const dSq = dx * dx + dy * dy
      const r = projected.radius
      if (dSq < r * r && dSq < bestDistSq) {
        bestDistSq = dSq
        hitId = projected.id
      }
    }

    return {
      panel: slabKey,
      world,
      pixel: { x: px, y: py },
      hitId
    }
  }

  // Keep a tiny bit of state in a ref so we can update the cursor from
  // pointermove without triggering React re-renders every frame.
  const cursorRef = useRef<HTMLDivElement | null>(null)
  const cursorStyle = useMemo(() => {
    if (preview) return 'grabbing'
    return 'crosshair'
  }, [preview])

  const applyCursor = (cursor: string) => {
    const host = cursorRef.current
    if (host && host.style.cursor !== cursor) host.style.cursor = cursor
  }

  return (
    <div
      ref={(node) => {
        containerRef.current = node
        cursorRef.current = node
      }}
      className="stage"
      onPointerLeave={() => onHoverPanel(null)}
      style={{ cursor: cursorStyle }}
    >
      <canvas
        ref={canvasRef}
        className="stage-canvas"
        aria-label="Field stage"
        onPointerDown={(event) => {
          if (event.pointerType === 'mouse' && event.button !== 0) return
          event.preventDefault()
          const payload = resolve(event)
          if (!payload) return
          event.currentTarget.setPointerCapture(event.pointerId)
          activePointerRef.current = event.pointerId
          activePanelRef.current = payload.panel
          onPointerDown(payload)
        }}
        onPointerMove={(event) => {
          const payload = resolve(
            event,
            activePointerRef.current !== null ? activePanelRef.current ?? preview?.panel : undefined
          )
          if (payload) {
            onHoverPanel(payload.panel)
            // Surface drag-to-move and spawn affordance through the cursor.
            if (activePointerRef.current !== null && event.pointerId === activePointerRef.current) {
              applyCursor('grabbing')
              onPointerMove(payload)
            } else {
              applyCursor(payload.hitId ? 'grab' : 'crosshair')
            }
          }
        }}
        onPointerUp={(event) => {
          if (activePointerRef.current !== null && event.pointerId !== activePointerRef.current) {
            return
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          const payload = resolve(event, activePanelRef.current ?? preview?.panel)
          onPointerUp(payload)
          activePointerRef.current = null
          activePanelRef.current = null
        }}
        onPointerCancel={(event) => {
          if (activePointerRef.current !== null && event.pointerId !== activePointerRef.current) {
            return
          }
          if (event.currentTarget.hasPointerCapture(event.pointerId)) {
            event.currentTarget.releasePointerCapture(event.pointerId)
          }
          onPointerUp(null)
          activePointerRef.current = null
          activePanelRef.current = null
        }}
      />
      <div className="stage-labels" aria-hidden="true">
        <span className="stage-label stage-label--electron">electron field</span>
        <span className="stage-label stage-label--photon">photon field</span>
      </div>
    </div>
  )
}
