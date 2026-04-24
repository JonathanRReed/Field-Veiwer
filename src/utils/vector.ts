import type { Vec2 } from '../types/particle'

export const add = (a: Vec2, b: Vec2): Vec2 => ({
  x: a.x + b.x,
  y: a.y + b.y
})

export const sub = (a: Vec2, b: Vec2): Vec2 => ({
  x: a.x - b.x,
  y: a.y - b.y
})

export const scale = (v: Vec2, s: number): Vec2 => ({
  x: v.x * s,
  y: v.y * s
})

export const magnitude = (v: Vec2): number => Math.hypot(v.x, v.y)

export const magnitudeSquared = (v: Vec2): number => v.x * v.x + v.y * v.y

export const normalize = (v: Vec2): Vec2 => {
  const mag = magnitude(v)
  if (mag === 0) {
    return { x: 0, y: 0 }
  }
  return { x: v.x / mag, y: v.y / mag }
}

export const dot = (a: Vec2, b: Vec2): number => a.x * b.x + a.y * b.y

export const distance = (a: Vec2, b: Vec2): number => magnitude(sub(a, b))

export const distanceSquared = (a: Vec2, b: Vec2): number => magnitudeSquared(sub(a, b))

export const wrap01 = (value: number): number => {
  const wrapped = value % 1
  return wrapped < 0 ? wrapped + 1 : wrapped
}

export const wrapVec01 = (value: Vec2): Vec2 => ({
  x: wrap01(value.x),
  y: wrap01(value.y)
})

export const lerp = (start: Vec2, end: Vec2, t: number): Vec2 => ({
  x: start.x + (end.x - start.x) * t,
  y: start.y + (end.y - start.y) * t
})

export const minSignedWrapOffset = (delta: number): number => {
  const wrapped = delta % 1
  if (wrapped > 0.5) {
    return wrapped - 1
  }

  if (wrapped < -0.5) {
    return wrapped + 1
  }

  return wrapped
}

export const equals = (a: Vec2, b: Vec2): boolean => a.x === b.x && a.y === b.y

export const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
