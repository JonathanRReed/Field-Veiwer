import { useEffect, useRef } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import type { GameLoop } from '../engine/gameLoop'

interface FieldStageProps {
  loop: GameLoop
  /** Read-only stages ignore the pointer, like the demo on the About page. */
  interactive?: boolean
}

export const FieldStage = ({ loop, interactive = true }: FieldStageProps) => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const observer = new ResizeObserver(([entry]) => {
      loop.resize(entry.contentRect.width, entry.contentRect.height)
    })
    observer.observe(container)
    loop.mount(canvas, container)

    return () => {
      observer.disconnect()
      loop.unmount()
    }
  }, [loop])

  const pointerHandlers = interactive
    ? {
        onPointerDown: (e: ReactPointerEvent) => {
          if (e.pointerType === 'mouse' && e.button !== 0) return
          e.preventDefault()
          canvasRef.current?.setPointerCapture(e.pointerId)
          loop.onPointerDown(e.clientX, e.clientY)
        },
        onPointerMove: (e: ReactPointerEvent) => loop.onPointerMove(e.clientX, e.clientY),
        onPointerUp: (e: ReactPointerEvent) => {
          const canvas = canvasRef.current
          if (canvas?.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId)
          loop.onPointerUp(e.clientX, e.clientY)
        },
        onPointerLeave: () => loop.onPointerLeave(),
        onPointerCancel: () => loop.onPointerLeave()
      }
    : {}

  return (
    <div
      ref={containerRef}
      className={interactive ? 'stage' : 'stage stage--static'}
      {...pointerHandlers}
    >
      <canvas ref={canvasRef} className="stage-canvas" aria-label="Field stage">
        Your browser cannot draw the field stage. It shows two horizontal slabs, the electron
        field on top and the photon field below. Each packet is a moving bump on its field.
        After an electron and a positron annihilate, a panel reports energy, momentum, and
        the conservation checks. The text on this page covers the same ground.
      </canvas>
      <div className="stage-labels" aria-hidden="true">
        <span className="stage-label stage-label--electron">electron field</span>
        <span className="stage-label stage-label--photon">photon field</span>
      </div>
    </div>
  )
}
