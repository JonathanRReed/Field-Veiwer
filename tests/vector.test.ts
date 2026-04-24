import { describe, expect, test } from 'vitest'
import {
  add,
  clamp,
  distance,
  distanceSquared,
  dot,
  magnitude,
  minSignedWrapOffset,
  normalize,
  scale,
  sub,
  wrap01,
  wrapVec01
} from '../src/utils/vector'

describe('vector math', () => {
  test('add and sub are inverse for finite vectors', () => {
    const a = { x: 0.4, y: -0.2 }
    const b = { x: -0.1, y: 0.9 }
    const sum = add(a, b)
    const recovered = sub(sum, b)

    expect(sum).toEqual({ x: 0.30000000000000004, y: 0.7 })
    expect(recovered.x).toBeCloseTo(a.x)
    expect(recovered.y).toBeCloseTo(a.y)
  })

  test('scale preserves direction and scales norm linearly', () => {
    const original = { x: 1, y: 2 }
    const scaled = scale(original, 2.5)

    expect(scaled).toEqual({ x: 2.5, y: 5 })
    expect(magnitude(scaled)).toBeCloseTo(magnitude(original) * 2.5)
  })

  test('normalize gives unit vector for non-zero input', () => {
    const normalized = normalize({ x: 3, y: 4 })

    expect(normalized).toEqual({ x: 0.6, y: 0.8 })
    expect(magnitude(normalized)).toBeCloseTo(1)
  })

  test('distance equals Euclidean norm of difference', () => {
    const start = { x: 1, y: 2 }
    const end = { x: 3, y: 5 }

    expect(distance(start, end)).toBeCloseTo(Math.hypot(2, 3))
    expect(distanceSquared(start, end)).toBeCloseTo(13)
  })

  test('dot product is rotationally consistent with angle identity', () => {
    const a = { x: 1, y: 0 }
    const b = { x: 0, y: 1 }
    const c = { x: 1, y: 1 }

    expect(dot(a, b)).toBe(0)
    expect(dot(a, c) ** 2 + dot(b, c) ** 2).toBeCloseTo(magnitude(c) ** 2)
  })

  test('clamp and wrap01 keep values on a torus interval', () => {
    expect(clamp(1.3, 0, 1)).toBe(1)
    expect(clamp(-0.2, 0, 1)).toBe(0)

    expect(wrap01(-0.1)).toBeCloseTo(0.9)
    expect(wrap01(1.2)).toBeCloseTo(0.2)
    const wrapped = wrapVec01({ x: 1.2, y: -0.3 })
    expect(wrapped.x).toBeCloseTo(0.2)
    expect(wrapped.y).toBeCloseTo(0.7)
  })

  test('minSignedWrapOffset gives shortest displacement on torus', () => {
    expect(minSignedWrapOffset(0.6)).toBe(-0.4)
    expect(minSignedWrapOffset(-0.6)).toBe(0.4)
    expect(minSignedWrapOffset(0.2)).toBe(0.2)
  })
})
