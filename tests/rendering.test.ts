import { describe, expect, test } from 'vitest'
import { buildStageLayout, getMeshResolution, unproject } from '../src/rendering/fieldRenderer'

describe('field renderer performance scaling', () => {
  test('uses lower mesh density on compact screens', () => {
    expect(getMeshResolution(390)).toEqual({ cols: 40, rows: 20 })
    expect(getMeshResolution(820)).toEqual({ cols: 48, rows: 24 })
    expect(getMeshResolution(1200)).toEqual({ cols: 56, rows: 28 })
  })
})

describe('stage coordinates', () => {
  const layout = buildStageLayout(1200, 800)
  const slab = layout.slabs.electron

  test('field +y points away from the viewer, so higher on screen means larger y', () => {
    const high = unproject(600, slab.top + slab.height * 0.3, slab, layout.width)
    const low = unproject(600, slab.top + slab.height * 0.8, slab, layout.width)
    expect(high && low).toBeTruthy()
    expect(high!.y).toBeGreaterThan(low!.y)
  })

  test('the centre column maps to x = 0.5 at every depth', () => {
    for (const fraction of [0.2, 0.5, 0.9]) {
      expect(unproject(600, slab.top + slab.height * fraction, slab, layout.width)!.x).toBeCloseTo(0.5, 6)
    }
  })
})
