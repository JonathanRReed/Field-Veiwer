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
    >
      <canvas ref={canvasRef} className="stage-canvas" aria-label="Field stage">
        Your browser cannot draw the field stage. It is a dark canvas split into two
        horizontal slabs: the electron field on top, carrying electron and positron packets,
        and the photon field below it. Each packet is a moving bump on its field, and an
        overlay reports energy, momentum, and the conservation checks after an electron and
        positron annihilate. The written explanation lower on this page covers the same ground.
      </canvas>
      <div className="stage-labels" aria-hidden="true">
        <span className="stage-label stage-label--electron">electron field</span>
        <span className="stage-label stage-label--photon">photon field</span>
      </div>
    </div>
  )
}
