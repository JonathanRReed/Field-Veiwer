import { describe, expect, test } from 'vitest'
import { moveExcitation, spawnExcitation, stepSimulation, updateExcitationMomentum } from '../src/simulation/engine'
import { computeEnergy, computeTotalEnergyMomentum } from '../src/simulation/physics'
import { MIN_PHOTON_MOMENTUM } from '../src/simulation/constants'
import type { AnnihilationMode, Excitation, SimulationState, Vec2 } from '../src/types/particle'

const empty: SimulationState = { time: 0, nextId: 1, lastAnnihilation: null, excitations: [] }

const place = (
  state: SimulationState,
  tool: 'spawn-electron' | 'spawn-positron' | 'spawn-photon',
  position: Vec2,
  momentum: Vec2
) =>
  spawnExcitation(
    state,
    tool,
    tool === 'spawn-photon' ? 'photon' : 'electron',
    position,
    momentum
  )

const pair = (electronP: Vec2, positronP: Vec2, at: Vec2 = { x: 0.5, y: 0.5 }) =>
  place(place(empty, 'spawn-electron', at, electronP), 'spawn-positron', at, positronP)

const modes: AnnihilationMode[] = ['center-of-momentum', 'collinear']
const angles = [0, 30, 90, 150, 180].map((d) => (d * Math.PI) / 180)

describe('adversarial: what annihilates', () => {
  test('two electrons on top of each other do not annihilate', () => {
    const state = place(place(empty, 'spawn-electron', { x: 0.5, y: 0.5 }, { x: 0, y: 0 }), 'spawn-electron', { x: 0.5, y: 0.5 }, { x: 0, y: 0 })
    const next = stepSimulation(state, 1 / 120, { annihilationDistance: 0.075 })
    expect(next.lastAnnihilation).toBeNull()
    expect(next.excitations.filter((e) => e.field === 'electron')).toHaveLength(2)
  })

  test('two positrons do not annihilate', () => {
    const state = place(place(empty, 'spawn-positron', { x: 0.5, y: 0.5 }, { x: 0, y: 0 }), 'spawn-positron', { x: 0.5, y: 0.5 }, { x: 0, y: 0 })
    expect(stepSimulation(state, 1 / 120, { annihilationDistance: 0.075 }).lastAnnihilation).toBeNull()
  })

  test('a photon passing through an electron changes nothing', () => {
    const state = place(place(empty, 'spawn-electron', { x: 0.5, y: 0.5 }, { x: 0, y: 0 }), 'spawn-photon', { x: 0.5, y: 0.5 }, { x: 1, y: 0 })
    const next = stepSimulation(state, 1 / 120, { annihilationDistance: 0.075 })
    expect(next.lastAnnihilation).toBeNull()
    expect(next.excitations.filter((e) => e.alive)).toHaveLength(2)
  })

  test('a pair moving in parallel at the same speed never meets', () => {
    let state = pair({ x: 1, y: 0 }, { x: 1, y: 0 }, { x: 0.2, y: 0.2 })
    state = moveExcitation(state, '2', { x: 0.2, y: 0.6 })
    for (let i = 0; i < 600; i += 1) state = stepSimulation(state, 1 / 120, { annihilationDistance: 0.075 })
    expect(state.lastAnnihilation).toBeNull()
  })

  test('one positron facing two electrons annihilates with exactly one of them', () => {
    let state = place(empty, 'spawn-electron', { x: 0.5, y: 0.5 }, { x: 0, y: 0 })
    state = place(state, 'spawn-electron', { x: 0.5, y: 0.5 }, { x: 0, y: 0 })
    state = place(state, 'spawn-positron', { x: 0.5, y: 0.5 }, { x: 0, y: 0 })
    const next = stepSimulation(state, 1 / 120, { annihilationDistance: 0.075 })
    expect(next.excitations.filter((e) => e.field === 'electron')).toHaveLength(1)
    expect(next.excitations.filter((e) => e.field === 'photon')).toHaveLength(2)
  })
})

describe('adversarial: conservation holds across the whole input space', () => {
  const momenta: Vec2[] = [
    { x: 0, y: 0 },
    { x: 2.3, y: 0 },
    { x: -2.3, y: 0 },
    { x: 0, y: 2.3 },
    { x: 1.6, y: 1.6 },
    { x: 0.01, y: -0.02 },
    { x: -1, y: 0.4 }
  ]

  for (const mode of modes) {
    for (const angle of angles) {
      test(`${mode} at ${Math.round((angle * 180) / Math.PI)} degrees conserves E and p for every pair of momenta`, () => {
        for (const pe of momenta) {
          for (const pp of momenta) {
            const next = stepSimulation(pair(pe, pp), 1 / 120, {
              annihilationDistance: 0.075,
              annihilationMode: mode,
              annihilationScatteringAngle: angle
            })
            const summary = next.lastAnnihilation
            expect(summary).not.toBeNull()
            expect(summary!.checks!.diagnostics.energyResidualPass).toBe(true)
            expect(summary!.checks!.diagnostics.momentumResidualPass).toBe(true)
            expect(summary!.checks!.diagnostics.photonAntiparallelPass).toBe(true)
            for (const photon of next.excitations.filter((e) => e.field === 'photon')) {
              expect(Math.hypot(photon.momentum.x, photon.momentum.y)).toBeCloseTo(computeEnergy(photon), 12)
            }
          }
        }
      })
    }
  }

  test('total energy and momentum of the whole state are unchanged by a long random run', () => {
    let seed = 7
    const random = () => {
      seed = (seed * 1664525 + 1013904223) % 4294967296
      return seed / 4294967296
    }
    let state: SimulationState = empty
    for (let i = 0; i < 12; i += 1) {
      const tool = i % 2 === 0 ? 'spawn-electron' : 'spawn-positron'
      state = place(state, tool, { x: random(), y: random() }, { x: (random() - 0.5) * 4.6, y: (random() - 0.5) * 4.6 })
    }
    const start = computeTotalEnergyMomentum(state.excitations.filter((e) => e.alive))
    let events = 0
    let last = state.lastAnnihilation
    for (let i = 0; i < 6000; i += 1) {
      state = stepSimulation(state, 1 / 120, { annihilationDistance: 0.075 })
      if (state.lastAnnihilation !== last) {
        events += 1
        last = state.lastAnnihilation
      }
    }
    const end = computeTotalEnergyMomentum(state.excitations.filter((e) => e.alive))
    expect(events).toBeGreaterThan(0)
    expect(end.energy).toBeCloseTo(start.energy, 9)
    expect(end.momentum.x).toBeCloseTo(start.momentum.x, 9)
    expect(end.momentum.y).toBeCloseTo(start.momentum.y, 9)
  })
})

describe('adversarial: what the event card reports', () => {
  test('a pair at rest in rest-frame mode reports the angle that was asked for', () => {
    const next = stepSimulation(pair({ x: 0, y: 0 }, { x: 0, y: 0 }), 1 / 120, {
      annihilationDistance: 0.075,
      annihilationMode: 'center-of-momentum',
      annihilationScatteringAngle: Math.PI / 3
    })
    expect(next.lastAnnihilation!.scattering!.scatteringAngleCm).toBeCloseTo(Math.PI / 3, 9)
  })

  test('a pair at rest gives two 1.0 photons back to back (511 keV each in real units)', () => {
    const next = stepSimulation(pair({ x: 0, y: 0 }, { x: 0, y: 0 }), 1 / 120, { annihilationDistance: 0.075 })
    const photons = next.excitations.filter((e) => e.field === 'photon')
    expect(photons.map((p) => computeEnergy(p))).toEqual([expect.closeTo(1, 12), expect.closeTo(1, 12)])
    expect(next.lastAnnihilation!.scattering!.photonOpeningAngleLab).toBeCloseTo(Math.PI, 9)
  })
})

describe('adversarial: photons cannot be stopped', () => {
  test('a photon dropped without a drag is not created', () => {
    const next = place(empty, 'spawn-photon', { x: 0.5, y: 0.5 }, { x: 0, y: 0 })
    expect(next.excitations).toHaveLength(0)
  })

  test('steering a photon down to zero momentum stops at the minimum, keeping its direction', () => {
    const state = place(empty, 'spawn-photon', { x: 0.5, y: 0.5 }, { x: 0, y: 1 })
    const id = state.excitations[0].id
    const next = updateExcitationMomentum(state, id, { x: 0, y: 0 })
    const photon = next.excitations[0] as Excitation
    expect(Math.hypot(photon.momentum.x, photon.momentum.y)).toBeCloseTo(MIN_PHOTON_MOMENTUM, 12)
  })

  test('electrons can still be brought to rest', () => {
    const state = place(empty, 'spawn-electron', { x: 0.5, y: 0.5 }, { x: 1, y: 0 })
    const next = updateExcitationMomentum(state, state.excitations[0].id, { x: 0, y: 0 })
    expect(next.excitations[0].momentum).toEqual({ x: 0, y: 0 })
  })
})
