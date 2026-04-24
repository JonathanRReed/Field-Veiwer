import { describe, expect, test } from 'vitest'
import type { Excitation } from '../src/types/particle'
import {
  computeAnnihilationScattering,
  computeEnergy,
  computeAnnihilationResidual,
  buildFourVector,
  computeFourVectorCollinearity,
  computeFourVectorResidual,
  computeBetaVectorFromEnergyMomentum,
  buildTwoPhotonMomentaFromEnergyMomentum,
  computeDeBroglieWavelength,
  computeInvariantMassSquaredFromEnergyMomentum,
  computeKinematicsFromEnergyMomentum,
  computeInvariantMass,
  computeInvariantMassFromEnergyMomentum,
  computeLongitudinalRapidityFromEnergyMomentum,
  computeMandelstamS,
  computeMandelstamT,
  computeMandelstamU,
  computeMassShellError,
  computeLorentzGamma,
  computeMomentumFromSpeed,
  computeProperTimeRate,
  computeRapidityFromBeta,
  computeTwoBodyMomentumMagnitude,
  speedFromMomentum
} from '../src/simulation/physics'

describe('energy calculations', () => {
  test('electron energy follows sqrt(m^2 + |p|^2)', () => {
    const electron: Excitation = {
      id: 'e',
      field: 'electron',
      kind: 'particle',
      charge: -1,
      spinLabel: 0.5,
      mass: 1,
      position: { x: 0, y: 0 },
      momentum: { x: 3, y: 4 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }

    expect(computeEnergy(electron)).toBeCloseTo(Math.sqrt(26))
  })

  test('photon energy is |p| for massless field', () => {
    const photon: Excitation = {
      id: 'p',
      field: 'photon',
      kind: 'boson',
      charge: 0,
      spinLabel: 1,
      mass: 0,
      position: { x: 0, y: 0 },
      momentum: { x: 3, y: 4 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }

    expect(computeEnergy(photon)).toBeCloseTo(5)
  })

  test('electron displacement rate uses relativistic v = p/E with c=1', () => {
    const electron: Excitation = {
      id: 'e2',
      field: 'electron',
      kind: 'particle',
      charge: -1,
      spinLabel: 0.5,
      mass: 1,
      position: { x: 0, y: 0 },
      momentum: { x: 3, y: 4 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }

    const dt = 0.25
    const speed = computeMomentumFromSpeed(electron, dt)
    const speedMag = Math.hypot(speed.x, speed.y)

    expect(speedMag).toBeCloseTo((5 / Math.sqrt(26)) * dt)
  })

  test('photon displacement is unit-speed in direction of momentum', () => {
    const photon: Excitation = {
      id: 'p2',
      field: 'photon',
      kind: 'boson',
      charge: 0,
      spinLabel: 1,
      mass: 0,
      position: { x: 0, y: 0 },
      momentum: { x: 0, y: 5 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }

    const dt = 0.25
    const speed = computeMomentumFromSpeed(photon, dt)

    expect(speed.x).toBeCloseTo(0)
    expect(speed.y).toBeCloseTo(dt)
  })

  test('speedFromMomentum returns v = p/E for massive excitation', () => {
    const electron: Excitation = {
      id: 'e3',
      field: 'electron',
      kind: 'particle',
      charge: -1,
      spinLabel: 0.5,
      mass: 1,
      position: { x: 0.4, y: 0.5 },
      momentum: { x: 1, y: 2 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }

    expect(speedFromMomentum(electron)).toBeCloseTo(Math.sqrt(5) / Math.sqrt(6))
  })

  test('speedFromMomentum returns exactly 1 for non-zero photon excitation', () => {
    const photon: Excitation = {
      id: 'p3',
      field: 'photon',
      kind: 'boson',
      charge: 0,
      spinLabel: 1,
      mass: 0,
      position: { x: 0.1, y: 0.1 },
      momentum: { x: -4, y: -3 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }

    expect(speedFromMomentum(photon)).toBeCloseTo(1)
  })

  test('massive Lorentz gamma follows E/m', () => {
    const electron: Excitation = {
      id: 'e4',
      field: 'electron',
      kind: 'particle',
      charge: -1,
      spinLabel: 0.5,
      mass: 1,
      position: { x: 0.2, y: 0.3 },
      momentum: { x: 3, y: 4 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }

    expect(computeLorentzGamma(electron)).toBeCloseTo(Math.sqrt(26))
  })

  test('rapidity map is consistent with β', () => {
    expect(computeRapidityFromBeta(0.6)).toBeCloseTo(0.5 * Math.log((1 + 0.6) / (1 - 0.6)))
  })

  test('pair invariant mass uses E^2 - P^2 structure', () => {
    const electron: Excitation = {
      id: 'e5',
      field: 'electron',
      kind: 'particle',
      charge: -1,
      spinLabel: 0.5,
      mass: 1,
      position: { x: 0, y: 0 },
      momentum: { x: 0.8, y: 0.4 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }

    const positron: Excitation = {
      id: 'p5',
      field: 'electron',
      kind: 'antiparticle',
      charge: 1,
      spinLabel: 0.5,
      mass: 1,
      position: { x: 0, y: 0 },
      momentum: { x: -0.2, y: 0.1 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }

    const expectedEnergy = computeEnergy(electron) + computeEnergy(positron)
    const expectedMomentum = {
      x: electron.momentum.x + positron.momentum.x,
      y: electron.momentum.y + positron.momentum.y
    }
    const expectedMass = Math.sqrt(expectedEnergy * expectedEnergy - expectedMomentum.x * expectedMomentum.x - expectedMomentum.y * expectedMomentum.y)

    expect(computeInvariantMass(electron, positron)).toBeCloseTo(expectedMass)
    expect(computeInvariantMassFromEnergyMomentum(expectedEnergy, expectedMomentum)).toBeCloseTo(expectedMass)
  })

  test('invariant mass squared is computed explicitly', () => {
    const totalMomentum = { x: 0.3, y: 0.7 }
    const totalEnergy = 2.9
    const expectedInvariantSq = totalEnergy * totalEnergy - totalMomentum.x * totalMomentum.x - totalMomentum.y * totalMomentum.y
    expect(computeInvariantMassSquaredFromEnergyMomentum(totalEnergy, totalMomentum)).toBeCloseTo(expectedInvariantSq)
  })

  test('mass-shell residual is near zero for model electron excitation', () => {
    const electron: Excitation = {
      id: 'e-s',
      field: 'electron',
      kind: 'particle',
      charge: -1,
      spinLabel: 0.5,
      mass: 1,
      position: { x: 0, y: 0 },
      momentum: { x: 3, y: 4 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }

    expect(computeMassShellError(computeEnergy(electron), electron.momentum, electron.mass)).toBeCloseTo(0)
  })

  test('system snapshot uses relativistic invariants', () => {
    const totalMomentum = { x: 0.3, y: -0.4 }
    const totalEnergy = 2.75
    const snapshot = computeKinematicsFromEnergyMomentum(totalEnergy, totalMomentum)
    const beta = Math.hypot(totalMomentum.x, totalMomentum.y) / totalEnergy
    const betaVector = computeBetaVectorFromEnergyMomentum(totalEnergy, totalMomentum)
    const expectedInvariant = Math.sqrt(totalEnergy * totalEnergy - 0.3 ** 2 - 0.4 ** 2)

    expect(snapshot.betaVector.x).toBeCloseTo(betaVector.x)
    expect(snapshot.betaVector.y).toBeCloseTo(betaVector.y)
    expect(snapshot.invariantMass).toBeCloseTo(expectedInvariant)
    expect(snapshot.speed).toBeCloseTo(beta)
    expect(snapshot.gamma).toBeCloseTo(1 / Math.sqrt(1 - beta * beta))
    expect(snapshot.rapidity).toBeCloseTo(0.5 * Math.log((1 + beta) / (1 - beta)))
  })

  test('two-photon helper enforces invariant split', () => {
    const totalEnergy = 3.2
    const totalMomentum = { x: 0.4, y: 0.2 }
    const [k1, k2] = buildTwoPhotonMomentaFromEnergyMomentum(totalEnergy, totalMomentum)
    const totalOut = {
      x: k1.x + k2.x,
      y: k1.y + k2.y
    }
    const energyOut = Math.hypot(k1.x, k1.y) + Math.hypot(k2.x, k2.y)

    expect(totalOut.x).toBeCloseTo(totalMomentum.x)
    expect(totalOut.y).toBeCloseTo(totalMomentum.y)
    expect(energyOut).toBeCloseTo(totalEnergy)
  })

  test('four-vector residual detects exact aggregate drift', () => {
    const before = [
      {
        id: 'a',
        field: 'electron' as const,
        kind: 'particle' as const,
        charge: -1,
        spinLabel: 0.5,
        mass: 1,
        position: { x: 0, y: 0 },
        momentum: { x: 0.8, y: 0.2 },
        amplitude: 1,
        phase: 0,
        alive: true,
        selected: false
      },
      {
        id: 'b',
        field: 'electron' as const,
        kind: 'antiparticle' as const,
        charge: 1,
        spinLabel: 0.5,
        mass: 1,
        position: { x: 0, y: 0 },
        momentum: { x: -0.2, y: 0.1 },
        amplitude: 1,
        phase: 0,
        alive: true,
        selected: false
      }
    ] as Excitation[]

    const totalMomentum = before.reduce((acc, item) => ({ x: acc.x + item.momentum.x, y: acc.y + item.momentum.y }), { x: 0, y: 0 })
    const totalEnergy = before.reduce((acc, item) => acc + computeEnergy(item), 0)
    const beforeVector = buildFourVector(totalEnergy, totalMomentum)
    const afterVector = buildFourVector(totalEnergy, { x: totalMomentum.x + 1e-12, y: totalMomentum.y - 1e-12 })
    const residual = computeFourVectorResidual(beforeVector, afterVector)

    expect(residual.energy).toBeCloseTo(0)
    expect(residual.momentum.x).toBeCloseTo(1e-12)
    expect(residual.momentum.y).toBeCloseTo(-1e-12)
  })

  test('two emitted momenta are anti-parallel in this simplified model', () => {
    const totalEnergy = 3.2
    const totalMomentum = { x: 0.6, y: -0.2 }
    const [k1, k2] = buildTwoPhotonMomentaFromEnergyMomentum(totalEnergy, totalMomentum)
    const collinearity = computeFourVectorCollinearity(k1, k2)

    expect(collinearity).toBeLessThan(-0.99)
  })

  test('annihilation residual helper reports exact conservation drift', () => {
    const beforeMomentum = { x: 0.6, y: -0.2 }
    const afterMomentum = { x: 0.6, y: -0.2 }
    const beforeEnergy = 4.1
    const afterEnergy = 4.1
    const residual = computeAnnihilationResidual(beforeEnergy, beforeMomentum, afterEnergy, afterMomentum)

    expect(residual.momentum.x).toBeCloseTo(0)
    expect(residual.momentum.y).toBeCloseTo(0)
    expect(residual.energy).toBeCloseTo(0)
    expect(residual.invariantMass).toBeCloseTo(0)
  })

  test('snapshot remains finite for rest frame and diverges at light-like speed', () => {
    const rest = computeKinematicsFromEnergyMomentum(2, { x: 0, y: 0 })
    const light = computeKinematicsFromEnergyMomentum(1, { x: 1, y: 0 })

    expect(rest.speed).toBeCloseTo(0)
    expect(rest.rapidity).toBeCloseTo(0)
    expect(rest.gamma).toBe(1)
    expect(light.gamma).toBe(Number.POSITIVE_INFINITY)
    expect(light.rapidity).toBe(Number.POSITIVE_INFINITY)
  })

  test('proper-time rate matches 1/gamma for massive packets', () => {
    const electron: Excitation = {
      id: 'tau',
      field: 'electron',
      kind: 'particle',
      charge: -1,
      spinLabel: 0.5,
      mass: 1,
      position: { x: 0, y: 0 },
      momentum: { x: 0.8, y: 0.6 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }

    expect(computeProperTimeRate(electron)).toBeCloseTo(1 / computeLorentzGamma(electron))
  })

  test('de Broglie wavelength uses 2π/|p| in simulation units', () => {
    const electron: Excitation = {
      id: 'lambda',
      field: 'electron',
      kind: 'particle',
      charge: -1,
      spinLabel: 0.5,
      mass: 1,
      position: { x: 0, y: 0 },
      momentum: { x: 3, y: 4 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }

    expect(computeDeBroglieWavelength(electron)).toBeCloseTo((2 * Math.PI) / 5)
  })

  test('longitudinal rapidity matches 0.5 ln[(E+p)/(E-p)] along a chosen axis', () => {
    const energy = 3
    const momentum = { x: 1.2, y: 0.4 }
    const expected = 0.5 * Math.log((energy + 1.2) / (energy - 1.2))

    expect(computeLongitudinalRapidityFromEnergyMomentum(energy, momentum, { x: 1, y: 0 })).toBeCloseTo(expected)
  })

  test('mandelstam invariants satisfy s + t + u = sum masses squared', () => {
    const p1 = buildFourVector(Math.sqrt(2), { x: 1, y: 0 })
    const p2 = buildFourVector(Math.sqrt(2), { x: -1, y: 0 })
    const p3 = buildFourVector(Math.sqrt(2), { x: Math.sqrt(2), y: 0 })
    const p4 = buildFourVector(Math.sqrt(2), { x: -Math.sqrt(2), y: 0 })

    const s = computeMandelstamS(p1, p2)
    const t = computeMandelstamT(p1, p3)
    const u = computeMandelstamU(p1, p4)

    expect(s + t + u).toBeCloseTo(2)
  })

  test('two-body momentum magnitude reproduces the COM momentum formula', () => {
    const s = 9
    const momentum = computeTwoBodyMomentumMagnitude(s, 1, 1)

    expect(momentum).toBeCloseTo(Math.sqrt(9 - 4) / 2)
  })

  test('annihilation scattering summary reports exact COM and invariant relations', () => {
    const electron: Excitation = {
      id: 'e6',
      field: 'electron',
      kind: 'particle',
      charge: -1,
      spinLabel: 0.5,
      mass: 1,
      position: { x: 0, y: 0 },
      momentum: { x: 0.8, y: 0.2 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }
    const positron: Excitation = {
      id: 'p6',
      field: 'electron',
      kind: 'antiparticle',
      charge: 1,
      spinLabel: 0.5,
      mass: 1,
      position: { x: 0, y: 0 },
      momentum: { x: -0.15, y: -0.1 },
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }

    const [k1, k2] = buildTwoPhotonMomentaFromEnergyMomentum(
      computeEnergy(electron) + computeEnergy(positron),
      {
        x: electron.momentum.x + positron.momentum.x,
        y: electron.momentum.y + positron.momentum.y
      }
    )

    const photonOne: Excitation = {
      id: 'g1',
      field: 'photon',
      kind: 'boson',
      charge: 0,
      spinLabel: 1,
      mass: 0,
      position: { x: 0, y: 0 },
      momentum: k1,
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }
    const photonTwo: Excitation = {
      id: 'g2',
      field: 'photon',
      kind: 'boson',
      charge: 0,
      spinLabel: 1,
      mass: 0,
      position: { x: 0, y: 0 },
      momentum: k2,
      amplitude: 1,
      phase: 0,
      alive: true,
      selected: false
    }

    const scattering = computeAnnihilationScattering(
      electron,
      positron,
      photonOne,
      photonTwo,
      'collinear',
      [1, -1],
      0
    )

    expect(scattering.sumRuleResidual).toBeCloseTo(0)
    expect(scattering.incomingMomentumCmResidual).toBeCloseTo(0)
    expect(scattering.outgoingMomentumCmResidual).toBeCloseTo(0)
    expect(scattering.photonOpeningAngleCm).toBeCloseTo(Math.PI)
    expect(scattering.sqrtS).toBeCloseTo(computeInvariantMass(electron, positron))
  })
})
