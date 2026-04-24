import { describe, expect, test } from 'vitest'
import { aggregateKinematics, aggregateTotals } from '../src/utils/simulationStats'
import type { Excitation } from '../src/types/particle'
import { computeInvariantMassFromEnergyMomentum } from '../src/simulation/physics'

describe('simulation aggregate stats', () => {
  const excitations: Excitation[] = [
    {
      id: 'e1',
      field: 'electron',
      kind: 'particle',
      charge: -1,
      spinLabel: 0.5,
      mass: 1,
      position: { x: 0.2, y: 0.2 },
      momentum: { x: 1, y: 1 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    },
    {
      id: 'p1',
      field: 'photon',
      kind: 'boson',
      charge: 0,
      spinLabel: 1,
      mass: 0,
      position: { x: 0.5, y: 0.5 },
      momentum: { x: 2, y: 0 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    },
    {
      id: 'e2',
      field: 'electron',
      kind: 'particle',
      charge: -1,
      spinLabel: 0.5,
      mass: 1,
      position: { x: 0.6, y: 0.6 },
      momentum: { x: 0, y: -1 },
      amplitude: 1,
      phase: 0,
      alive: false,
      selected: false
    }
  ]

  test('aggregates only alive packets when predicate provided', () => {
    const totals = aggregateTotals(excitations, (entry) => entry.alive)
    expect(totals.momentum.x).toBeCloseTo(3)
    expect(totals.momentum.y).toBeCloseTo(1)
  })

  test('aggregates by a custom predicate', () => {
    const electronOnly = aggregateTotals(
      excitations,
      (entry) => entry.alive && entry.field === 'electron'
    )

    expect(electronOnly.momentum.x).toBeCloseTo(1)
    expect(electronOnly.momentum.y).toBeCloseTo(1)
    expect(electronOnly.energy).toBeCloseTo(Math.sqrt(3))
  })

  test('aggregates kinematics with invariant mass, speed, and rapidity', () => {
    const result = aggregateKinematics(excitations)
    const expectedTotalMomentum = { x: 3, y: 1 }
    const expectedInvariant = computeInvariantMassFromEnergyMomentum(result.energy, expectedTotalMomentum)
    const expectedInvariantSq = expectedInvariant * expectedInvariant
    const expectedBeta = { x: expectedTotalMomentum.x / result.energy, y: expectedTotalMomentum.y / result.energy }

    expect(result.invariantMass).toBeCloseTo(expectedInvariant)
    expect(result.invariantMassSquared).toBeCloseTo(expectedInvariantSq)
    expect(result.speed).toBeCloseTo(Math.hypot(expectedTotalMomentum.x, expectedTotalMomentum.y) / result.energy)
    expect(result.gamma).toBeCloseTo(1 / Math.sqrt(1 - result.speed * result.speed))
    expect(result.betaVector.x).toBeCloseTo(expectedBeta.x)
    expect(result.betaVector.y).toBeCloseTo(expectedBeta.y)
  })
})
