import {
  DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE,
  ELECTRON_MASS_SIM,
  PHOTON_MASS_SIM,
  STABLE_AXIS
} from './constants'
import { add, dot, magnitude, magnitudeSquared, normalize, scale, sub } from '../utils/vector'
import type {
  AnnihilationMode,
  AnnihilationResidual,
  AnnihilationChecks,
  AnnihilationScattering,
  Excitation,
  FourVector,
  FourVectorResidual,
  PhotonHelicity,
  RelativisticKinematics,
  Vec2
} from '../types/particle'

const EPSILON = 1e-10
const MASSLESS_BETA = 1
const SMALL_VALUE = 1e-16
const SPEED_EPSILON = 1e-14
const MAX_GAMMA_DENOMINATOR = 1 - 1e-15
const ANNIHILATION_TOLERANCE = {
  momentumResidual: 1e-10,
  energyResidual: 1e-10,
  invariantMassSqResidual: 1e-10,
  comMomentumResidual: 1e-10,
  comEnergyResidual: 1e-10,
  collinearity: 1e-10
}

const safePositive = (value: number, fallback = 0): number => (value > fallback ? value : fallback)
const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))
const clampBeta = (value: number): number => clamp(value, 0, 1)
const perpendicular = (vector: Vec2): Vec2 => ({ x: -vector.y, y: vector.x })

const totalEnergyFromMassAndMomentum = (mass: number, momentum: Vec2): number =>
  Math.sqrt(Math.max(SMALL_VALUE, mass * mass + magnitude(momentum) ** 2))

export const computeEnergyFromMassAndMomentum = (mass: number, momentum: Vec2): number =>
  totalEnergyFromMassAndMomentum(mass, momentum)

export const computeEnergy = (excitation: Excitation): number => {
  if (excitation.field === 'photon') {
    return magnitude(excitation.momentum)
  }

  return totalEnergyFromMassAndMomentum(excitation.mass, excitation.momentum)
}

export const computeMomentumMagnitude = (excitation: Excitation): number => {
  return magnitude(excitation.momentum)
}

export const computeInvariantMassFromEnergyMomentum = (
  totalEnergy: number,
  totalMomentum: Vec2
): number => {
  const invariantSq = totalEnergy * totalEnergy - magnitude(totalMomentum) ** 2
  return Math.sqrt(safePositive(invariantSq))
}

export const computeInvariantMassSquaredFromEnergyMomentum = (
  totalEnergy: number,
  totalMomentum: Vec2
): number => totalEnergy * totalEnergy - magnitude(totalMomentum) ** 2

export const computeMassShellError = (
  totalEnergy: number,
  totalMomentum: Vec2,
  expectedMass: number
): number => computeInvariantMassSquaredFromEnergyMomentum(totalEnergy, totalMomentum) - expectedMass * expectedMass

export const computeExcitationMassShellError = (excitation: Excitation): number =>
  computeMassShellError(computeEnergy(excitation), excitation.momentum, excitation.mass)

export const computeBetaVectorFromEnergyMomentum = (
  totalEnergy: number,
  totalMomentum: Vec2
): Vec2 => {
  if (totalEnergy <= 0) {
    return { x: 0, y: 0 }
  }

  return scale(totalMomentum, 1 / totalEnergy)
}

export const computeEnergyMomentumDot = (energy: number, momentum: Vec2): number =>
  energy * energy - magnitude(momentum) ** 2

export const computeInvariantMassSquaredFromFourVector = (vector: FourVector): number =>
  computeEnergyMomentumDot(vector.energy, vector.momentum)

export const computeInvariantFromFourVectorDifference = (
  left: FourVector,
  right: FourVector
): number => computeInvariantMassSquaredFromFourVector(subFourVectors(left, right))

export const buildFourVector = (energy: number, momentum: Vec2): FourVector => ({
  energy,
  momentum
})

export const addFourVectors = (left: FourVector, right: FourVector): FourVector => ({
  energy: left.energy + right.energy,
  momentum: add(left.momentum, right.momentum)
})

export const subFourVectors = (left: FourVector, right: FourVector): FourVector => ({
  energy: left.energy - right.energy,
  momentum: sub(left.momentum, right.momentum)
})

export const computeFourVectorFromExcitations = (excitations: Excitation[]): FourVector =>
  excitations.reduce<FourVector>(
    (accum, item) => addFourVectors(accum, buildFourVector(computeEnergy(item), item.momentum)),
    { energy: 0, momentum: { x: 0, y: 0 } }
  )

export const computeFourVectorResidual = (
  before: FourVector,
  after: FourVector
): FourVectorResidual => ({
  energy: after.energy - before.energy,
  momentum: sub(after.momentum, before.momentum),
  invariantMassSquared:
    computeInvariantMassSquaredFromFourVector(after) - computeInvariantMassSquaredFromFourVector(before)
})

export const computeFourVectorCollinearity = (first: Vec2, second: Vec2): number => {
  const firstMagSq = magnitudeSquared(first)
  const secondMagSq = magnitudeSquared(second)
  if (firstMagSq === 0 || secondMagSq === 0) {
    return 1
  }

  return dot(first, second) / Math.sqrt(firstMagSq * secondMagSq)
}

export const computeOpeningAngle = (first: Vec2, second: Vec2): number => {
  const collinearity = computeFourVectorCollinearity(first, second)
  const safe = clamp(collinearity, -1, 1)
  return Math.acos(safe)
}

export const boostFourVector = (vector: FourVector, beta: Vec2): FourVector => {
  const betaSq = magnitudeSquared(beta)
  if (betaSq === 0 || !Number.isFinite(betaSq) || !Number.isFinite(vector.energy)) {
    return vector
  }

  if (betaSq >= 1) {
    const cappedMag = clamp(1 - SPEED_EPSILON, 0, 1 - SPEED_EPSILON)
    const betaMag = Math.sqrt(betaSq)
    if (betaMag === 0) {
      return vector
    }

    return boostFourVector(vector, scale(beta, cappedMag / betaMag))
  }

  const betaDotMomentum = dot(beta, vector.momentum)
  const betaMag = Math.sqrt(betaSq)
  const gamma = computeLorentzGammaFromBeta(betaMag)
  const coeff = ((gamma - 1) / betaSq) * betaDotMomentum - gamma * vector.energy

  return {
    energy: gamma * (vector.energy - betaDotMomentum),
    momentum: {
      x: vector.momentum.x + coeff * beta.x,
      y: vector.momentum.y + coeff * beta.y
    }
  }
}

export const computeAnnihilationResidual = (
  beforeEnergy: number,
  beforeMomentum: Vec2,
  afterEnergy: number,
  afterMomentum: Vec2
): AnnihilationResidual => ({
  energy: afterEnergy - beforeEnergy,
  momentum: sub(afterMomentum, beforeMomentum),
  invariantMass:
    computeInvariantMassFromEnergyMomentum(afterEnergy, afterMomentum) -
    computeInvariantMassFromEnergyMomentum(beforeEnergy, beforeMomentum),
  invariantMassSquared:
    computeInvariantMassSquaredFromEnergyMomentum(afterEnergy, afterMomentum) -
    computeInvariantMassSquaredFromEnergyMomentum(beforeEnergy, beforeMomentum)
})

export const evaluateAnnihilationChecks = (summary: {
  beforeEnergy: number
  beforeMomentum: Vec2
  afterEnergy: number
  afterMomentum: Vec2
  photonMomenta: readonly Vec2[]
  residual?: AnnihilationResidual
}): AnnihilationChecks => {
  const residual = summary.residual ?? {
    energy: 0,
    momentum: { x: 0, y: 0 },
    invariantMass: 0,
    invariantMassSquared: 0
  }

  const photonOne = summary.photonMomenta[0]
  const photonTwo = summary.photonMomenta[1]
  const collinearity = computeFourVectorCollinearity(photonOne, photonTwo)

  const beforeVector = buildFourVector(summary.beforeEnergy, summary.beforeMomentum)
  const afterVector = buildFourVector(summary.afterEnergy, summary.afterMomentum)

  const comBeta = computeBetaVectorFromEnergyMomentum(summary.beforeEnergy, summary.beforeMomentum)
  const beforeCom = boostFourVector(beforeVector, comBeta)
  const afterCom = boostFourVector(afterVector, comBeta)

  const photonOneCom = boostFourVector({ energy: magnitude(photonOne), momentum: photonOne }, comBeta)
  const photonTwoCom = boostFourVector({ energy: magnitude(photonTwo), momentum: photonTwo }, comBeta)

  const residualMomentumMagnitude = magnitude(residual.momentum)
  const invariantMassSqResidual = residual.invariantMassSquared ?? 0
  const energyResidualMagnitude = Math.abs(residual.energy)
  const comMomentumResidual = Math.max(magnitude(beforeCom.momentum), magnitude(afterCom.momentum))
  const comEnergyResidual = Math.abs(beforeCom.energy - afterCom.energy)
  const photonEnergySymmetry = Math.abs(photonOneCom.energy - photonTwoCom.energy)
  const collinearityCom = computeFourVectorCollinearity(photonOneCom.momentum, photonTwoCom.momentum)
  const antiParallelError = collinearityCom + 1

  return {
    diagnostics: {
      energyResidualPass: energyResidualMagnitude <= ANNIHILATION_TOLERANCE.energyResidual,
      momentumResidualPass: residualMomentumMagnitude <= ANNIHILATION_TOLERANCE.momentumResidual,
      invariantMassSqResidualPass:
        Math.abs(invariantMassSqResidual) <= ANNIHILATION_TOLERANCE.invariantMassSqResidual,
      comResidualPass:
        comMomentumResidual <= ANNIHILATION_TOLERANCE.comMomentumResidual &&
        comEnergyResidual <= ANNIHILATION_TOLERANCE.comEnergyResidual,
      photonAntiparallelPass: Math.abs(antiParallelError) <= ANNIHILATION_TOLERANCE.collinearity,
      photonAntiparallelTarget: -1
    },
    momentumResidualMagnitude: residualMomentumMagnitude,
    energyResidualMagnitude,
    invariantMassSqResidual,
    invariantMassResidual: residual.invariantMass ?? 0,
    comMomentumResidual,
    comEnergyBefore: beforeCom.energy,
    comEnergyAfter: afterCom.energy,
    photonRestEnergyAsymmetry: photonEnergySymmetry,
    comPhotonEnergySpread: photonEnergySymmetry,
    collinearity,
    antiParallelError,
    collinearityCom
  }
}

export const computeInvariantMass = (first: Excitation, second: Excitation): number => {
  const totalMomentum = add(first.momentum, second.momentum)
  const totalEnergy = computeEnergy(first) + computeEnergy(second)
  return computeInvariantMassFromEnergyMomentum(totalEnergy, totalMomentum)
}

export const computeTotalEnergyMomentum = (excitations: Excitation[]): {
  energy: number
  momentum: Vec2
} => {
  let energy = 0
  let momentumX = 0
  let momentumY = 0

  for (let i = 0; i < excitations.length; i += 1) {
    const excitation = excitations[i]
    energy += computeEnergy(excitation)
    momentumX += excitation.momentum.x
    momentumY += excitation.momentum.y
  }

  return {
    energy,
    momentum: {
      x: momentumX,
      y: momentumY
    }
  }
}

export const computeInvariantMassFromExcitations = (
  excitations: Excitation[]
): number => {
  const { energy, momentum } = computeTotalEnergyMomentum(excitations)
  return computeInvariantMassFromEnergyMomentum(energy, momentum)
}

export const computeMinkowskiSpeed = (totalEnergy: number, totalMomentum: Vec2): number => {
  if (totalEnergy <= 0) {
    return 0
  }

  const beta = magnitude(totalMomentum) / totalEnergy
  return Math.abs(beta)
}

export const computeLorentzGammaFromBeta = (beta: number): number => {
  if (!Number.isFinite(beta)) {
    return Number.POSITIVE_INFINITY
  }

  const absBeta = Math.abs(beta)
  if (absBeta < SPEED_EPSILON) {
    return 1
  }

  if (absBeta >= 1) {
    return Number.POSITIVE_INFINITY
  }

  const oneMinusBetaSq = clamp(1 - absBeta * absBeta, 0, MAX_GAMMA_DENOMINATOR)
  return 1 / Math.sqrt(oneMinusBetaSq)
}

export const computeKinematicsFromEnergyMomentum = (
  totalEnergy: number,
  totalMomentum: Vec2
): RelativisticKinematics => {
  const speedRaw = computeMinkowskiSpeed(totalEnergy, totalMomentum)
  const betaVector = computeBetaVectorFromEnergyMomentum(totalEnergy, totalMomentum)
  const speed = clampBeta(speedRaw)
  const gamma = speed >= 1 - SPEED_EPSILON ? Number.POSITIVE_INFINITY : computeLorentzGammaFromBeta(speed)

  return {
    energy: totalEnergy,
    momentum: totalMomentum,
    invariantMass: computeInvariantMassFromEnergyMomentum(totalEnergy, totalMomentum),
    invariantMassSquared: computeInvariantMassSquaredFromEnergyMomentum(totalEnergy, totalMomentum),
    speed,
    betaVector,
    gamma,
    rapidity: computeRapidityFromBeta(speed)
  }
}

export const computeKinematicsFromExcitations = (excitations: Excitation[]): RelativisticKinematics => {
  const { energy, momentum } = computeTotalEnergyMomentum(excitations)
  return computeKinematicsFromEnergyMomentum(energy, momentum)
}

export const computeKineticEnergy = (excitation: Excitation): number =>
  excitation.field === 'photon' ? 0 : computeEnergy(excitation) - excitation.mass

export const computeProperTimeRate = (excitation: Excitation): number => {
  if (excitation.field === 'photon') {
    return 0
  }

  const gamma = computeLorentzGamma(excitation)
  if (!Number.isFinite(gamma) || gamma === 0) {
    return 0
  }

  return 1 / gamma
}

export const computeDeBroglieWavelength = (excitation: Excitation): number => {
  const momentumMagnitude = magnitude(excitation.momentum)
  if (momentumMagnitude <= EPSILON) {
    return Number.POSITIVE_INFINITY
  }

  return (2 * Math.PI) / momentumMagnitude
}

export const computeElectronTemplate = (): Excitation => {
  return {
    id: '',
    field: 'electron',
    kind: 'particle',
    charge: -1,
    spinLabel: 0.5,
    mass: ELECTRON_MASS_SIM,
    position: { x: 0, y: 0 },
    momentum: { x: 0, y: 0 },
    amplitude: 1,
    phase: 0,
    alive: true,
    selected: false
  }
}

export const buildTwoPhotonMomenta = (p1: Vec2, p2: Vec2): [Vec2, Vec2] => {
  const totalEnergy = Math.sqrt(ELECTRON_MASS_SIM ** 2 + p1.x * p1.x + p1.y * p1.y) + Math.sqrt(ELECTRON_MASS_SIM ** 2 + p2.x * p2.x + p2.y * p2.y)
  return buildTwoPhotonMomentaFromEnergyMomentum(totalEnergy, add(p1, p2))
}

export const computeMomentumFromSpeed = (excitation: Excitation, dt: number): Vec2 => {
  if (excitation.field === 'photon') {
    const pMag = magnitude(excitation.momentum)
    if (pMag === 0) {
      return { x: 0, y: 0 }
    }
    return scale(excitation.momentum, dt / pMag)
  }

  const energy = computeEnergy(excitation)
  if (energy === 0) {
    return { x: 0, y: 0 }
  }

  return {
    x: (excitation.momentum.x / energy) * dt,
    y: (excitation.momentum.y / energy) * dt
  }
}

export const speedFromMomentum = (excitation: Excitation): number => {
  const mag = magnitude(excitation.momentum)
  if (mag === 0) {
    return 0
  }

  if (excitation.field === 'photon') {
    return MASSLESS_BETA
  }

  const energy = computeEnergy(excitation)
  if (energy === 0) {
    return 0
  }

  return mag / energy
}

export const computeBeta = (excitation: Excitation): number => speedFromMomentum(excitation)

export const computeLorentzGamma = (excitation: Excitation): number => {
  if (excitation.field === 'photon') {
    return Number.POSITIVE_INFINITY
  }

  const mass = safePositive(excitation.mass)
  if (mass <= 0) {
    return Number.POSITIVE_INFINITY
  }

  const energy = computeEnergy(excitation)
  if (!Number.isFinite(energy) || energy === 0) {
    return Number.POSITIVE_INFINITY
  }

  return energy / mass
}

export const computeBetaVector = (excitation: Excitation): Vec2 =>
  computeBetaVectorFromEnergyMomentum(computeEnergy(excitation), excitation.momentum)

export const computeMomentumProjection = (momentum: Vec2, axis: Vec2): number => {
  const axisMagnitude = magnitude(axis)
  if (axisMagnitude === 0) {
    return 0
  }

  const normalizedAxis = scale(axis, 1 / axisMagnitude)
  return momentum.x * normalizedAxis.x + momentum.y * normalizedAxis.y
}

export const computeLongitudinalRapidityFromEnergyMomentum = (
  totalEnergy: number,
  totalMomentum: Vec2,
  axis: Vec2 = STABLE_AXIS
): number => {
  if (totalEnergy <= 0) {
    return 0
  }

  const pParallel = computeMomentumProjection(totalMomentum, axis)
  const denominator = totalEnergy - pParallel
  const numerator = totalEnergy + pParallel

  if (numerator <= 0) {
    return Number.NEGATIVE_INFINITY
  }

  if (denominator <= 0) {
    return Number.POSITIVE_INFINITY
  }

  return 0.5 * Math.log(numerator / denominator)
}

export const computeLongitudinalRapidity = (
  excitation: Excitation,
  axis: Vec2 = STABLE_AXIS
): number => computeLongitudinalRapidityFromEnergyMomentum(computeEnergy(excitation), excitation.momentum, axis)

export const computeKallenLambda = (x: number, y: number, z: number): number =>
  x * x + y * y + z * z - 2 * x * y - 2 * x * z - 2 * y * z

export const computeTwoBodyMomentumMagnitude = (
  invariantMassSquared: number,
  massOne: number,
  massTwo: number
): number => {
  if (invariantMassSquared <= 0) {
    return 0
  }

  const sqrtS = Math.sqrt(invariantMassSquared)
  if (sqrtS <= EPSILON) {
    return 0
  }

  const lambda = computeKallenLambda(
    invariantMassSquared,
    massOne * massOne,
    massTwo * massTwo
  )

  return Math.sqrt(Math.max(0, lambda)) / (2 * sqrtS)
}

export const buildTwoPhotonMomentaFromEnergyMomentum = (
  totalEnergy: number,
  totalMomentum: Vec2
): [Vec2, Vec2] => {
  const totalMomentumMag = magnitude(totalMomentum)
  const safeTotalEnergy = safePositive(totalEnergy, SMALL_VALUE)
  const physicalMomentumMag = Math.min(totalMomentumMag, safeTotalEnergy)
  const axis = totalMomentumMag > EPSILON ? normalize(totalMomentum) : STABLE_AXIS

  return [
    scale(axis, (safeTotalEnergy + physicalMomentumMag) / 2),
    scale(axis, -(safeTotalEnergy - physicalMomentumMag) / 2)
  ]
}

export const buildTwoPhotonMomentaInCenterOfMomentumFrame = (
  p1: Vec2,
  p2: Vec2,
  scatteringAngle = DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE
): [Vec2, Vec2] => {
  const electronEnergy = totalEnergyFromMassAndMomentum(ELECTRON_MASS_SIM, p1)
  const positronEnergy = totalEnergyFromMassAndMomentum(ELECTRON_MASS_SIM, p2)
  const totalEnergy = electronEnergy + positronEnergy
  const totalMomentum = add(p1, p2)
  const totalVector = buildFourVector(totalEnergy, totalMomentum)
  const comBeta = computeBetaVectorFromEnergyMomentum(totalEnergy, totalMomentum)
  const electronCom = boostFourVector(buildFourVector(electronEnergy, p1), comBeta)
  const invariantMassSquared = computeInvariantMassSquaredFromFourVector(totalVector)
  const outgoingMagnitude = computeTwoBodyMomentumMagnitude(
    invariantMassSquared,
    PHOTON_MASS_SIM,
    PHOTON_MASS_SIM
  )
  if (outgoingMagnitude <= EPSILON) {
    return [
      { x: 0, y: 0 },
      { x: 0, y: 0 }
    ]
  }
  const incomingAxis =
    magnitude(electronCom.momentum) > EPSILON ? normalize(electronCom.momentum) : STABLE_AXIS
  const transverseAxis = perpendicular(incomingAxis)
  const clampedAngle = clamp(scatteringAngle, 0, Math.PI)
  const outgoingDirectionCom = normalize(
    add(scale(incomingAxis, Math.cos(clampedAngle)), scale(transverseAxis, Math.sin(clampedAngle)))
  )
  const photonOneCom = buildFourVector(outgoingMagnitude, scale(outgoingDirectionCom, outgoingMagnitude))
  const photonTwoCom = buildFourVector(outgoingMagnitude, scale(outgoingDirectionCom, -outgoingMagnitude))
  const inverseComBeta = scale(comBeta, -1)
  const photonOneLab = boostFourVector(photonOneCom, inverseComBeta)
  const photonTwoLab = boostFourVector(photonTwoCom, inverseComBeta)

  return [photonOneLab.momentum, photonTwoLab.momentum]
}

export const buildTwoPhotonMomentaForMode = (
  p1: Vec2,
  p2: Vec2,
  mode: AnnihilationMode,
  scatteringAngle = DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE
): [Vec2, Vec2] =>
  mode === 'center-of-momentum'
    ? buildTwoPhotonMomentaInCenterOfMomentumFrame(p1, p2, scatteringAngle)
    : buildTwoPhotonMomenta(p1, p2)

export const computeRapidityFromBeta = (beta: number): number => {
  const mag = Math.abs(beta)
  if (mag >= 1) {
    return Number.POSITIVE_INFINITY
  }

  if (mag === 0) {
    return 0
  }

  return 0.5 * Math.log((1 + beta) / (1 - beta))
}

export const computeRapidity = (excitation: Excitation): number => {
  if (excitation.field === 'photon') {
    return Number.POSITIVE_INFINITY
  }

  return computeRapidityFromBeta(computeBeta(excitation))
}

export const computeMandelstamS = (first: FourVector, second: FourVector): number =>
  computeInvariantMassSquaredFromFourVector(addFourVectors(first, second))

export const computeMandelstamT = (first: FourVector, third: FourVector): number =>
  computeInvariantFromFourVectorDifference(first, third)

export const computeMandelstamU = (first: FourVector, fourth: FourVector): number =>
  computeInvariantFromFourVectorDifference(first, fourth)

export const computeAnnihilationScattering = (
  electron: Excitation,
  positron: Excitation,
  photonOne: Excitation,
  photonTwo: Excitation,
  mode: AnnihilationMode,
  photonHelicities: readonly [PhotonHelicity, PhotonHelicity],
  targetScatteringAngleCm: number
): AnnihilationScattering => {
  const electronVector = buildFourVector(computeEnergy(electron), electron.momentum)
  const positronVector = buildFourVector(computeEnergy(positron), positron.momentum)
  const photonOneVector = buildFourVector(computeEnergy(photonOne), photonOne.momentum)
  const photonTwoVector = buildFourVector(computeEnergy(photonTwo), photonTwo.momentum)

  const s = computeMandelstamS(electronVector, positronVector)
  const t = computeMandelstamT(electronVector, photonOneVector)
  const u = computeMandelstamU(electronVector, photonTwoVector)
  const sqrtS = Math.sqrt(Math.max(0, s))
  const totalVector = addFourVectors(electronVector, positronVector)
  const comBetaVector = computeBetaVectorFromEnergyMomentum(totalVector.energy, totalVector.momentum)
  const comGamma = computeLorentzGammaFromBeta(magnitude(comBetaVector))

  const electronCom = boostFourVector(electronVector, comBetaVector)
  const positronCom = boostFourVector(positronVector, comBetaVector)
  const photonOneCom = boostFourVector(photonOneVector, comBetaVector)
  const photonTwoCom = boostFourVector(photonTwoVector, comBetaVector)

  const incomingMomentumCm = magnitude(electronCom.momentum)
  const outgoingMomentumCm = magnitude(photonOneCom.momentum)
  const expectedIncomingMomentumCm = computeTwoBodyMomentumMagnitude(
    s,
    electron.mass,
    positron.mass
  )
  const expectedOutgoingMomentumCm = computeTwoBodyMomentumMagnitude(
    s,
    photonOne.mass,
    photonTwo.mass
  )

  return {
    mode,
    s,
    t,
    u,
    sqrtS,
    thresholdOffset: sqrtS - (electron.mass + positron.mass),
    sumRuleResidual:
      s + t + u - (electron.mass * electron.mass + positron.mass * positron.mass + photonOne.mass * photonOne.mass + photonTwo.mass * photonTwo.mass),
    comBetaVector,
    comGamma,
    incomingMomentumCm,
    outgoingMomentumCm,
    expectedIncomingMomentumCm,
    expectedOutgoingMomentumCm,
    incomingMomentumCmResidual: incomingMomentumCm - expectedIncomingMomentumCm,
    outgoingMomentumCmResidual: outgoingMomentumCm - expectedOutgoingMomentumCm,
    electronEnergyCm: electronCom.energy,
    positronEnergyCm: positronCom.energy,
    photonEnergyCm: [photonOneCom.energy, photonTwoCom.energy],
    photonHelicities,
    targetScatteringAngleCm,
    scatteringAngleCm: computeOpeningAngle(electronCom.momentum, photonOneCom.momentum),
    photonOpeningAngleLab: computeOpeningAngle(photonOne.momentum, photonTwo.momentum),
    photonOpeningAngleCm: computeOpeningAngle(photonOneCom.momentum, photonTwoCom.momentum)
  }
}

export const conservedMomentum = (first: Vec2, second: Vec2): Vec2 => add(first, second)

export const electronDefaults = {
  mass: ELECTRON_MASS_SIM,
  charge: -1,
  spinLabel: 0.5,
  helicity: null,
  kind: 'particle' as const
}

export const positronDefaults = {
  mass: ELECTRON_MASS_SIM,
  charge: 1,
  spinLabel: 0.5,
  helicity: null,
  kind: 'antiparticle' as const
}

export const photonDefaults = {
  mass: PHOTON_MASS_SIM,
  charge: 0,
  spinLabel: 1,
  helicity: null,
  kind: 'boson' as const
}
