import { useEffect, useState } from 'react'
import type { GameLoop, GameLoopUIState } from '../engine/gameLoop'

/** Counts, selection, and the last annihilation, refreshed about ten times a second while running. */
export const useLoopState = (loop: GameLoop): GameLoopUIState => {
  const [state, setState] = useState(() => loop.snapshot())
  useEffect(() => {
    setState(loop.snapshot())
    loop.onStateChange(setState)
    return () => loop.offStateChange(setState)
  }, [loop])
  return state
}

export const useLoopRunning = (loop: GameLoop): boolean => {
  const [running, setRunning] = useState(() => loop.isRunning())
  useEffect(() => {
    setRunning(loop.isRunning())
    loop.onRunningChange(setRunning)
    return () => loop.offRunningChange(setRunning)
  }, [loop])
  return running
}
