import { describe, expect, test } from 'vitest'
import { GameLoop, type GameLoopUIState } from '../src/engine/gameLoop'

describe('game loop controls', () => {
  test('reset restores the active preset instead of the default preset', () => {
    const loop = new GameLoop()
    const states: GameLoopUIState[] = []
    loop.onStateChange((state) => states.push(state))

    loop.loadPreset('uniformity')
    loop.clearAll()
    loop.reset()

    expect(states.at(-1)?.aliveElectronCount).toBe(5)
    expect(states.at(-1)?.alivePhotonCount).toBe(0)
  })

  test('preset transitions clear stale selection state', () => {
    const loop = new GameLoop()
    const states: GameLoopUIState[] = []
    loop.onStateChange((state) => states.push(state))

    loop.loadPreset('uniformity')
    loop.select('1')
    loop.loadPreset('mirror')

    expect(states.at(-1)?.selected).toBeNull()
  })
})
