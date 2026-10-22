import { describe, expect, test } from 'vitest'
import { makeExcitation, stepSimulation } from '../src/simulation/engine'
import { electronDefaults, positronDefaults } from '../src/simulation/physics'
import type { Excitation, SimulationState, Vec2 } from '../src/types/particle'

const electron = (id: string, position: Vec2, momentum: Vec2): Excitation =>
  makeExcitation({ id, field: 'electron', ...electronDefaults, position, momentum })

const positron = (id: string, position: Vec2, momentum: Vec2): Excitation =>
  makeExcitation({ id, field: 'electron', ...positronDefaults, position, momentum })

const stateOf = (excitations: Excitation[]): SimulationState => ({
  time: 0,
  nextId: excitations.length + 1,
  lastAnnihilation: null,
  excitations
})

const wrappedGap = (a: number, b: number): number => {
  const raw = a - b
  return raw - Math.round(raw)
}

describe('annihilation sweep across the torus seam', () => {
  test('catches an electron that crosses the x = 1 seam through a resting positron', () => {
    // p = 2 gives v = 0.894, so one 0.03 s step moves the electron 0.027:
    // 0.99 -> 1.017, which passes the positron at 1.005 and lands 0.012 beyond it.
    const start = stateOf([
      electron('e', { x: 0.99, y: 0.5 }, { x: 2, y: 0 }),
      positron('p', { x: 0.005, y: 0.5 }, { x: 0, y: 0 })
    ])

    const next = stepSimulation(start, 0.03, { annihilationDistance: 0.01 })

    expect(next.lastAnnihilation).not.toBeNull()
    expect(next.excitations.filter((e) => e.field === 'electron')).toHaveLength(0)
  })

  test('does not annihilate a pair whose closest approach stays outside the threshold', () => {
    const start = stateOf([
      electron('e', { x: 0.99, y: 0.5 }, { x: 2, y: 0 }),
      positron('p', { x: 0.005, y: 0.56 }, { x: 0, y: 0 })
    ])

    const next = stepSimulation(start, 0.03, { annihilationDistance: 0.01 })

    expect(next.lastAnnihilation).toBeNull()
    expect(next.excitations).toHaveLength(2)
  })

  test('places the event at the closest approach of the swept paths', () => {
    const start = stateOf([
      electron('e', { x: 0.99, y: 0.5 }, { x: 2, y: 0 }),
      positron('p', { x: 0.005, y: 0.5 }, { x: 0, y: 0 })
    ])

    const next = stepSimulation(start, 0.03, { annihilationDistance: 0.01 })
    const spawn = next.lastAnnihilation!.spawnPosition

    expect(Math.abs(wrappedGap(spawn.x, 0.005))).toBeLessThan(1e-9)
    expect(spawn.y).toBeCloseTo(0.5, 9)
  })
})

describe('photons born mid-step', () => {
  test('advance for the part of the step that remains after the event', () => {
    const start = stateOf([
      electron('e', { x: 0.47, y: 0.5 }, { x: 0.7, y: 0 }),
      positron('p', { x: 0.53, y: 0.5 }, { x: -0.7, y: 0 })
    ])

    const next = stepSimulation(start, 0.08, { annihilationDistance: 0.02 })
    const event = next.lastAnnihilation!
    const remaining = next.time - event.time

    expect(remaining).toBeGreaterThan(0)
    expect(remaining).toBeLessThan(0.08)

    const photons = next.excitations.filter((e) => e.field === 'photon')
    expect(photons).toHaveLength(2)
    for (const photon of photons) {
      const speed = Math.hypot(photon.momentum.x, photon.momentum.y)
      const expectedX = event.spawnPosition.x + (photon.momentum.x / speed) * remaining
      const expectedY = event.spawnPosition.y + (photon.momentum.y / speed) * remaining
      expect(Math.abs(wrappedGap(photon.position.x, expectedX))).toBeLessThan(1e-9)
      expect(Math.abs(wrappedGap(photon.position.y, expectedY))).toBeLessThan(1e-9)
    }
  })

  test('start at the event point when the pair meets on the last instant of the step', () => {
    const start = stateOf([
      electron('e', { x: 0.4, y: 0.5 }, { x: 0, y: 0 }),
      positron('p', { x: 0.4, y: 0.5 }, { x: 0, y: 0 })
    ])

    const next = stepSimulation(start, 0.01, { annihilationDistance: 0.02 })
    const event = next.lastAnnihilation!

    expect(event.time).toBeCloseTo(0, 12)
    expect(next.excitations.filter((e) => e.field === 'photon')).toHaveLength(2)
  })
})
