import { describe, expect, test } from 'vitest'
import {
  buildTwoPhotonMomenta,
  buildTwoPhotonMomentaInCenterOfMomentumFrame,
  buildFourVector,
  boostFourVector,
  computeEnergy
} from '../src/simulation/physics'
import { moveExcitation, spawnExcitation, stepSimulation, updateExcitationMomentum } from '../src/simulation/engine'
import { add } from '../src/utils/vector'
import type { Excitation } from '../src/types/particle'
import {
  computeAnnihilationResidual,
  computeKinematicsFromEnergyMomentum,
  evaluateAnnihilationChecks
} from '../src/simulation/physics'

describe('annihilation conservation rule', () => {
  test('step simulation conserves momentum and energy through annihilation event', () => {
    const initialState = {
      time: 0,
      nextId: 3,
      lastAnnihilation: null,
      excitations: [
        {
          id: 'e1',
          field: 'electron' as const,
          kind: 'particle' as const,
          charge: -1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.5, y: 0.5 },
          momentum: { x: 0.8, y: 0.2 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        },
        {
          id: 'p1',
          field: 'electron' as const,
          kind: 'antiparticle' as const,
          charge: 1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.5, y: 0.5 },
          momentum: { x: -0.15, y: -0.1 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        }
      ] as Excitation[]
    }

    const nextState = stepSimulation(initialState, 0.001, { annihilationDistance: 1 })

    expect(nextState.lastAnnihilation).not.toBeNull()
    expect(nextState.excitations.filter((excitation) => excitation.field === 'electron')).toHaveLength(0)

    const summary = nextState.lastAnnihilation!
    const expectedBeforeSpeed = Math.hypot(summary.beforeMomentum.x, summary.beforeMomentum.y) / summary.beforeEnergy
    const expectedAfterSpeed = Math.hypot(summary.afterMomentum.x, summary.afterMomentum.y) / summary.afterEnergy
    const photonEnergyTotal = nextState.excitations
      .filter((excitation) => excitation.field === 'photon')
      .reduce((total, photon) => total + computeEnergy(photon), 0)

    expect(photonEnergyTotal).toBeCloseTo(summary.beforeEnergy)
    expect(summary.beforeMomentum.x).toBeCloseTo(summary.afterMomentum.x)
    expect(summary.beforeMomentum.y).toBeCloseTo(summary.afterMomentum.y)
    expect(summary.beforeEnergy).toBeCloseTo(summary.afterEnergy)
    expect(summary.beforeKinematics.invariantMass).toBeCloseTo(summary.beforeInvariantMass)
    expect(summary.afterKinematics.invariantMass).toBeCloseTo(summary.afterInvariantMass)
    expect(summary.beforeKinematics.speed).toBeCloseTo(expectedBeforeSpeed)
    expect(summary.afterKinematics.speed).toBeCloseTo(expectedAfterSpeed)
    expect(summary.residual?.energy ?? 0).toBeCloseTo(0)
    expect(summary.residual?.momentum.x ?? 0).toBeCloseTo(0)
    expect(summary.residual?.momentum.y ?? 0).toBeCloseTo(0)
    expect(summary.residual?.invariantMass ?? 0).toBeCloseTo(0)
    expect(summary.residual?.invariantMassSquared ?? 0).toBeCloseTo(0)
    expect(summary.checks?.collinearityCom ?? 0).toBeLessThan(-0.99)
    expect(summary.checks?.antiParallelError ?? 1).toBeLessThan(0.01)
    expect(summary.scattering?.sumRuleResidual ?? 1).toBeCloseTo(0)
    expect(summary.scattering?.incomingMomentumCmResidual ?? 1).toBeCloseTo(0)
    expect(summary.scattering?.outgoingMomentumCmResidual ?? 1).toBeCloseTo(0)
  })

  test('preserves total momentum with opposite charge pair', () => {
    const p1 = { x: 0.8, y: 0.3 }
    const p2 = { x: -0.2, y: 0.1 }
    const [k1, k2] = buildTwoPhotonMomenta(p1, p2)
    const totalIn = add(p1, p2)
    const totalOut = add(k1, k2)

    expect(totalOut.x).toBeCloseTo(totalIn.x)
    expect(totalOut.y).toBeCloseTo(totalIn.y)
  })

  test('preserves total energy in two-photon model', () => {
    const p1 = { x: 0.5, y: 0.2 }
    const p2 = { x: -0.15, y: -0.18 }
    const eIn = Math.sqrt(1 + 0.5 ** 2 + 0.2 ** 2) + Math.sqrt(1 + (-0.15) ** 2 + (-0.18) ** 2)
    const [k1, k2] = buildTwoPhotonMomenta(p1, p2)
    const eOut = Math.hypot(k1.x, k1.y) + Math.hypot(k2.x, k2.y)

    expect(eOut).toBeCloseTo(eIn)
  })

  test('handles near-zero net momentum along stable +x axis', () => {
    const p1 = { x: 0.000001, y: 0 }
    const p2 = { x: -0.000001, y: 0 }
    const [k1] = buildTwoPhotonMomenta(p1, p2)

    expect(k1.x).toBeGreaterThan(0)
    expect(k1.y).toBeCloseTo(0, 12)
  })

  test('center-of-momentum photon builder preserves total momentum and energy', () => {
    const p1 = { x: 0.8, y: 0.3 }
    const p2 = { x: -0.2, y: 0.1 }
    const eIn = Math.sqrt(1 + 0.8 ** 2 + 0.3 ** 2) + Math.sqrt(1 + (-0.2) ** 2 + 0.1 ** 2)
    const [k1, k2] = buildTwoPhotonMomentaInCenterOfMomentumFrame(p1, p2, Math.PI / 2)
    const totalOut = add(k1, k2)
    const eOut = Math.hypot(k1.x, k1.y) + Math.hypot(k2.x, k2.y)

    expect(totalOut.x).toBeCloseTo(p1.x + p2.x)
    expect(totalOut.y).toBeCloseTo(p1.y + p2.y)
    expect(eOut).toBeCloseTo(eIn)
  })

  test('increments nextId after annihilation photon spawn', () => {
    const initialState = {
      time: 0,
      nextId: 3,
      lastAnnihilation: null,
      excitations: [
        {
          id: 'e1',
          field: 'electron' as const,
          kind: 'particle' as const,
          charge: -1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.5, y: 0.5 },
          momentum: { x: 0.3, y: 0.1 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        },
        {
          id: 'p1',
          field: 'electron' as const,
          kind: 'antiparticle' as const,
          charge: 1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.5, y: 0.5 },
          momentum: { x: -0.2, y: -0.1 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        }
      ] as Excitation[]
    }

    const nextState = stepSimulation(initialState, 0.001, { annihilationDistance: 1 })
    const photonIds = nextState.excitations.filter((excitation) => excitation.field === 'photon').map((excitation) => excitation.id)

    expect(nextState.nextId).toBe(5)
    expect(photonIds).toContain('3')
    expect(photonIds).toContain('4')
  })

  test('records COM-frame annihilation geometry and helicity tags', () => {
    const initialState = {
      time: 0,
      nextId: 3,
      lastAnnihilation: null,
      excitations: [
        {
          id: 'e1',
          field: 'electron' as const,
          kind: 'particle' as const,
          charge: -1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.5, y: 0.5 },
          momentum: { x: 0.8, y: 0.2 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        },
        {
          id: 'p1',
          field: 'electron' as const,
          kind: 'antiparticle' as const,
          charge: 1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.5, y: 0.5 },
          momentum: { x: -0.15, y: -0.1 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        }
      ] as Excitation[]
    }

    const nextState = stepSimulation(initialState, 0.001, {
      annihilationDistance: 1,
      annihilationMode: 'center-of-momentum',
      annihilationScatteringAngle: Math.PI / 2
    })

    const summary = nextState.lastAnnihilation!
    const photons = nextState.excitations.filter((excitation) => excitation.field === 'photon')
    const comBeta = summary.scattering!.comBetaVector
    const photonOneCom = boostFourVector(buildFourVector(computeEnergy(photons[0]), photons[0].momentum), comBeta)
    const photonTwoCom = boostFourVector(buildFourVector(computeEnergy(photons[1]), photons[1].momentum), comBeta)

    expect(summary.mode).toBe('center-of-momentum')
    expect(summary.scattering?.targetScatteringAngleCm).toBeCloseTo(Math.PI / 2)
    expect(summary.scattering?.photonOpeningAngleCm).toBeCloseTo(Math.PI)
    expect(summary.scattering?.photonHelicities).toEqual([1, -1])
    expect(photons[0].helicity).toBe(1)
    expect(photons[1].helicity).toBe(-1)
    expect(photonOneCom.energy).toBeCloseTo(photonTwoCom.energy)
    expect(photonOneCom.momentum.x + photonTwoCom.momentum.x).toBeCloseTo(0)
    expect(photonOneCom.momentum.y + photonTwoCom.momentum.y).toBeCloseTo(0)
  })

  test('uses a monotonic nextId for subsequent manual spawns', () => {
    const initialState = {
      time: 0,
      nextId: 3,
      lastAnnihilation: null,
      excitations: [
        {
          id: 'e1',
          field: 'electron' as const,
          kind: 'particle' as const,
          charge: -1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.5, y: 0.5 },
          momentum: { x: 0.3, y: 0.1 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        },
        {
          id: 'p1',
          field: 'electron' as const,
          kind: 'antiparticle' as const,
          charge: 1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.5, y: 0.5 },
          momentum: { x: -0.2, y: -0.1 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        }
      ] as Excitation[]
    }

    const afterAnnihilation = stepSimulation(initialState, 0.001, { annihilationDistance: 1 })
    const withSpawn = spawnExcitation(
      afterAnnihilation,
      'spawn-photon',
      'photon',
      { x: 0.2, y: 0.2 },
      { x: 0.7, y: 0.1 }
    )
    const manualPhotonId = withSpawn.excitations.find((entry) => entry.id === '5')

    expect(withSpawn.nextId).toBe(6)
    expect(manualPhotonId).toBeDefined()
  })

  test('manual spawn selects the new packet and momentum editing updates it', () => {
    const initialState = {
      time: 0,
      nextId: 1,
      lastAnnihilation: null,
      excitations: []
    }

    const withSpawn = spawnExcitation(
      initialState,
      'spawn-electron',
      'electron',
      { x: 0.25, y: 0.35 },
      { x: 0.4, y: 0.1 }
    )
    const spawned = withSpawn.excitations[0]

    expect(spawned.selected).toBe(true)

    const steered = updateExcitationMomentum(withSpawn, spawned.id, { x: -0.2, y: 0.7 })
    expect(steered.excitations[0].momentum).toEqual({ x: -0.2, y: 0.7 })
    expect(steered.excitations[0].selected).toBe(true)
  })

  test('moving a selected packet preserves momentum and wraps position', () => {
    const initialState = {
      time: 0,
      nextId: 2,
      lastAnnihilation: null,
      excitations: [
        {
          id: 'e1',
          field: 'electron' as const,
          kind: 'particle' as const,
          charge: -1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.25, y: 0.35 },
          momentum: { x: 0.4, y: 0.1 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: true
        }
      ] as Excitation[]
    }

    const moved = moveExcitation(initialState, 'e1', { x: 1.2, y: -0.15 })

    expect(moved.excitations[0].position.x).toBeCloseTo(0.2)
    expect(moved.excitations[0].position.y).toBeCloseTo(0.85)
    expect(moved.excitations[0].momentum).toEqual({ x: 0.4, y: 0.1 })
    expect(moved.excitations[0].selected).toBe(true)
  })

  test('preserves the last event when overlap is too small for annihilation', () => {
    const initialState = {
      time: 0,
      nextId: 3,
      lastAnnihilation: {
        eventId: 'x',
        time: 0,
        mode: 'collinear' as const,
        incoming: {
          electron: { id: 'x', momentum: { x: 0, y: 0 } },
          positron: { id: 'y', momentum: { x: 0, y: 0 } }
        },
        photonMomenta: [{ x: 0, y: 0 }, { x: 0, y: 0 }],
        beforeMomentum: { x: 0, y: 0 },
        afterMomentum: { x: 0, y: 0 },
        beforeEnergy: 0,
        afterEnergy: 0,
        beforeInvariantMass: 0,
        afterInvariantMass: 0,
        beforeKinematics: {
          energy: 0,
          momentum: { x: 0, y: 0 },
          invariantMass: 0,
          invariantMassSquared: 0,
          betaVector: { x: 0, y: 0 },
          speed: 0,
          gamma: 1,
          rapidity: 0
        },
        afterKinematics: {
          energy: 0,
          momentum: { x: 0, y: 0 },
          invariantMass: 0,
          invariantMassSquared: 0,
          betaVector: { x: 0, y: 0 },
          speed: 0,
          gamma: 1,
          rapidity: 0
        },
        spawnPosition: { x: 0, y: 0 }
      },
      excitations: [
        {
          id: 'e1',
          field: 'electron' as const,
          kind: 'particle' as const,
          charge: -1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.2, y: 0.2 },
          momentum: { x: 0.0, y: 0.0 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        },
        {
          id: 'p1',
          field: 'electron' as const,
          kind: 'antiparticle' as const,
          charge: 1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.5, y: 0.5 },
          momentum: { x: 0.0, y: 0.0 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        }
      ] as Excitation[]
    }

    const nextState = stepSimulation(initialState, 0.001, { annihilationDistance: 0.2 })
    const electronCount = nextState.excitations.filter((entry) => entry.field === 'electron').length

    expect(nextState.lastAnnihilation?.eventId).toBe('x')
    expect(electronCount).toBe(2)
    expect(nextState.nextId).toBe(3)
  })

  test('keeps the annihilation summary visible after the next photon-only tick', () => {
    const initialState = {
      time: 0,
      nextId: 3,
      lastAnnihilation: null,
      excitations: [
        {
          id: 'e1',
          field: 'electron' as const,
          kind: 'particle' as const,
          charge: -1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.5, y: 0.5 },
          momentum: { x: 0.4, y: 0 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        },
        {
          id: 'p1',
          field: 'electron' as const,
          kind: 'antiparticle' as const,
          charge: 1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.5, y: 0.5 },
          momentum: { x: -0.2, y: 0 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        }
      ] as Excitation[]
    }

    const afterEvent = stepSimulation(initialState, 0.001, { annihilationDistance: 1 })
    const afterPhotonTick = stepSimulation(afterEvent, 0.001, { annihilationDistance: 1 })

    expect(afterEvent.lastAnnihilation).not.toBeNull()
    expect(afterPhotonTick.lastAnnihilation?.eventId).toBe(afterEvent.lastAnnihilation?.eventId)
  })

  test('handles two independent electron-positron pairs in one tick', () => {
    const initialState = {
      time: 0,
      nextId: 5,
      lastAnnihilation: null,
      excitations: [
        {
          id: 'e1',
          field: 'electron' as const,
          kind: 'particle' as const,
          charge: -1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.22, y: 0.5 },
          momentum: { x: 0.3, y: 0.05 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        },
        {
          id: 'p1',
          field: 'electron' as const,
          kind: 'antiparticle' as const,
          charge: 1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.23, y: 0.51 },
          momentum: { x: -0.14, y: 0.01 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        },
        {
          id: 'e2',
          field: 'electron' as const,
          kind: 'particle' as const,
          charge: -1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.72, y: 0.72 },
          momentum: { x: -0.22, y: -0.05 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        },
        {
          id: 'p2',
          field: 'electron' as const,
          kind: 'antiparticle' as const,
          charge: 1,
          spinLabel: 0.5,
          mass: 1,
          position: { x: 0.715, y: 0.73 },
          momentum: { x: 0.19, y: -0.08 },
          amplitude: 1,
          phase: 0,
          alive: true,
          selected: false
        }
      ] as Excitation[]
    }

    const nextState = stepSimulation(initialState, 0.001, { annihilationDistance: 1 })
    const electronsLeft = nextState.excitations.filter((entry) => entry.field === 'electron')
    const photons = nextState.excitations.filter((entry) => entry.field === 'photon')

    expect(electronsLeft).toHaveLength(0)
    expect(photons).toHaveLength(4)
    expect(nextState.nextId).toBe(9)
    expect(nextState.lastAnnihilation).not.toBeNull()

    const photonIds = photons.map((entry) => entry.id).sort()
    expect(photonIds).toEqual(['5', '6', '7', '8'])
  })

  test('annihilation diagnostics flags report exact pass/fail states', () => {
    const electronMomentum = { x: 0.2, y: -0.05 }
    const positronMomentum = { x: 0.15, y: -0.07 }
    const beforeMomentum = add(electronMomentum, positronMomentum)
    const photonMomenta = buildTwoPhotonMomenta(electronMomentum, positronMomentum)
    const afterMomentum = add(photonMomenta[0], photonMomenta[1])
    const beforeEnergy =
      Math.sqrt(1 + electronMomentum.x ** 2 + electronMomentum.y ** 2) +
      Math.sqrt(1 + positronMomentum.x ** 2 + positronMomentum.y ** 2)
    const afterEnergy =
      Math.hypot(photonMomenta[0].x, photonMomenta[0].y) + Math.hypot(photonMomenta[1].x, photonMomenta[1].y)
    const residual = computeAnnihilationResidual(beforeEnergy, beforeMomentum, afterEnergy, afterMomentum)
    const summary = {
      eventId: 'diag-pass',
      time: 1,
      mode: 'collinear' as const,
      incoming: {
        electron: { id: 'e', momentum: electronMomentum },
        positron: { id: 'p', momentum: positronMomentum }
      },
      photonMomenta,
      beforeMomentum,
      afterMomentum,
      beforeEnergy,
      afterEnergy,
      beforeInvariantMass: computeKinematicsFromEnergyMomentum(beforeEnergy, beforeMomentum).invariantMass,
      afterInvariantMass: computeKinematicsFromEnergyMomentum(afterEnergy, afterMomentum).invariantMass,
      residual,
      beforeKinematics: computeKinematicsFromEnergyMomentum(beforeEnergy, beforeMomentum),
      afterKinematics: computeKinematicsFromEnergyMomentum(afterEnergy, afterMomentum),
      spawnPosition: { x: 0.5, y: 0.5 }
    }

    const checks = evaluateAnnihilationChecks(summary)
    expect(checks.diagnostics.energyResidualPass).toBe(true)
    expect(checks.diagnostics.momentumResidualPass).toBe(true)
    expect(checks.diagnostics.invariantMassSqResidualPass).toBe(true)
    expect(checks.diagnostics.comResidualPass).toBe(true)
    expect(checks.diagnostics.photonAntiparallelPass).toBe(true)

    const driftedSummary = {
      ...summary,
      afterEnergy: afterEnergy + 0.04,
      afterMomentum: {
        x: afterMomentum.x + 0.02,
        y: afterMomentum.y - 0.018
      },
      afterKinematics: computeKinematicsFromEnergyMomentum(afterEnergy + 0.04, {
        x: afterMomentum.x + 0.02,
        y: afterMomentum.y - 0.018
      }),
      afterInvariantMass: computeKinematicsFromEnergyMomentum(afterEnergy + 0.04, {
        x: afterMomentum.x + 0.02,
        y: afterMomentum.y - 0.018
      }).invariantMass,
      residual: computeAnnihilationResidual(
        beforeEnergy,
        beforeMomentum,
        afterEnergy + 0.04,
        {
          x: afterMomentum.x + 0.02,
          y: afterMomentum.y - 0.018
        }
      )
    }

    const driftChecks = evaluateAnnihilationChecks(driftedSummary)
    expect(driftChecks.diagnostics.energyResidualPass).toBe(false)
    expect(driftChecks.diagnostics.momentumResidualPass).toBe(false)
    expect(driftChecks.diagnostics.comResidualPass).toBe(false)
  })
})
