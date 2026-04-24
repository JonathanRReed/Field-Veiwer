import type { Excitation, Vec2 } from '../types/particle'
import { computeEnergy, computeKinematicsFromExcitations } from '../simulation/physics'

export interface AggregatedStats {
  energy: number
  momentum: { x: number; y: number }
}

export interface AggregatedKinematics extends AggregatedStats {
  invariantMass: number
  invariantMassSquared: number
  betaVector: Vec2
  speed: number
  gamma: number
  rapidity: number
}

export const aggregateTotals = (
  excitations: Excitation[],
  predicate: (excitation: Excitation) => boolean = (excitation) => excitation.alive
): AggregatedStats => {
  let totalEnergy = 0
  let totalMomentumX = 0
  let totalMomentumY = 0

  for (const excitation of excitations) {
    if (!predicate(excitation)) {
      continue
    }

    totalMomentumX += excitation.momentum.x
    totalMomentumY += excitation.momentum.y
    totalEnergy += computeEnergy(excitation)
  }

  return {
    energy: totalEnergy,
    momentum: {
      x: totalMomentumX,
      y: totalMomentumY
    }
  }
}

export const aggregateKinematics = (
  excitations: Excitation[],
  predicate: (excitation: Excitation) => boolean = (excitation) => excitation.alive
): AggregatedKinematics => {
  const totals = aggregateTotals(excitations, predicate)
  const kinematics = computeKinematicsFromExcitations(
    excitations.filter((excitation) => predicate(excitation))
  )

  return {
    ...totals,
    invariantMass: kinematics.invariantMass,
    invariantMassSquared: kinematics.invariantMassSquared,
    betaVector: kinematics.betaVector,
    speed: kinematics.speed,
    gamma: kinematics.gamma,
    rapidity: kinematics.rapidity
  }
}

export const formatAggregateDiff = (a: AggregatedStats, b: AggregatedStats): AggregatedStats => ({
  energy: a.energy - b.energy,
  momentum: {
    x: a.momentum.x - b.momentum.x,
    y: a.momentum.y - b.momentum.y
  }
})
