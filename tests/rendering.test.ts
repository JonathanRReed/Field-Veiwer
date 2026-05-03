import { describe, expect, test } from 'vitest'
import { getMeshResolution } from '../src/rendering/fieldRenderer'

describe('field renderer performance scaling', () => {
  test('uses lower mesh density on compact screens', () => {
    expect(getMeshResolution(390)).toEqual({ cols: 40, rows: 20 })
    expect(getMeshResolution(820)).toEqual({ cols: 48, rows: 24 })
    expect(getMeshResolution(1200)).toEqual({ cols: 56, rows: 28 })
  })
})
