import { useEffect, useRef } from 'react'
import { gameLoop } from '../engine/gameLoopSingleton'

export const FieldStage = () => {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    gameLoop.mount(canvas, container)

    const onResize = () => {
      // Layout is computed inside the loop each frame from getBoundingClientRect
    }
    window.addEventListener('resize', onResize)

    return () => {
      window.removeEventListener('resize', onResize)
      gameLoop.unmount()
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className="stage"
      onPointerDown={(e) => {
        if (e.pointerType === 'mouse' && e.button !== 0) return
        e.preventDefault()
        const canvas = canvasRef.current
        if (canvas) canvas.setPointerCapture(e.pointerId)
        gameLoop.onPointerDown(e.clientX, e.clientY)
      }}
      onPointerMove={(e) => {
        gameLoop.onPointerMove(e.clientX, e.clientY)
      }}
      onPointerUp={(e) => {
        const canvas = canvasRef.current
        if (canvas && canvas.hasPointerCapture(e.pointerId)) {
          canvas.releasePointerCapture(e.pointerId)
        }
        gameLoop.onPointerUp(e.clientX, e.clientY)
      }}
      onPointerLeave={() => {
        gameLoop.onPointerLeave()
      }}
      onPointerCancel={() => {
        gameLoop.onPointerLeave()
      }}
      style={{ cursor: 'crosshair' }}
    >
      <canvas ref={canvasRef} className="stage-canvas" aria-label="Field stage" />
      <div className="stage-labels" aria-hidden="true">
        <span className="stage-label stage-label--electron">electron field</span>
        <span className="stage-label stage-label--photon">photon field</span>
      </div>
    </div>
  )
}
