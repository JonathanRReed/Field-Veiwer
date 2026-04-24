import { add, distance } from '../utils/vector'
import type {
  AnnihilationSummary,
  Excitation,
  SimulationState,
  Vec2
} from '../types/particle'
import type { SimulationOptions } from '../types/simulation'
import {
  DEFAULT_ANNIHILATION_DISTANCE,
  DEFAULT_ANNIHILATION_MODE,
  DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE,
  PHOTON_MASS_SIM
} from './constants'
import {
  buildTwoPhotonMomentaForMode,
  buildFourVector,
  computeInvariantMass,
  computeAnnihilationResidual,
  computeInvariantMassFromEnergyMomentum,
  computeEnergy,
  computeKinematicsFromEnergyMomentum,
  computeMomentumFromSpeed,
  computeFourVectorResidual,
  computeFourVectorCollinearity,
  computeAnnihilationScattering,
  evaluateAnnihilationChecks,
  electronDefaults,
  photonDefaults,
  positronDefaults
} from './physics'

type SpawnedPair = {
  time: number
  electron: Excitation
  antiparticle: Excitation
  spawnPosition: Vec2
}

const WRAP_SHIFTS = [-1, 0, 1] as const
const EPSILON = 1e-10

const normalizeWrapped = (value: number): number => {
  const wrapped = value % 1
  return wrapped < 0 ? wrapped + 1 : wrapped
}

const clamp01 = (value: number): number => {
  const wrapped = value % 1
  return wrapped < 0 ? wrapped + 1 : wrapped
}

const clamp = (value: number, min: number, max: number): number => Math.min(max, Math.max(min, value))

const selectOnly = (excitations: Excitation[], targetId: string | null): Excitation[] =>
  excitations.map((item) => ({ ...item, selected: item.id === targetId }))

export const makeExcitation = (params: {
  field: 'electron' | 'photon'
  kind: 'particle' | 'antiparticle' | 'boson'
  charge: number
  spinLabel: number
  helicity?: -1 | 1 | null
  mass: number
  position: Vec2
  momentum: Vec2
  id: string
  amplitude?: number
  phase?: number
}): Excitation => ({
  id: params.id,
  field: params.field,
  kind: params.kind,
  charge: params.charge,
  spinLabel: params.spinLabel,
  helicity: params.helicity ?? null,
  mass: params.mass,
  position: params.position,
  momentum: params.momentum,
  amplitude: params.amplitude ?? 1,
  phase: params.phase ?? 0,
  alive: true,
  selected: false
})

export const initialState = (): SimulationState => ({
  excitations: [],
  nextId: 1,
  time: 0,
  lastAnnihilation: null
})

export const stepExcitation = (excitation: Excitation, dt: number): Excitation => {
  if (!excitation.alive) {
    return excitation
  }

  const displacement = computeMomentumFromSpeed(excitation, dt)
  const nextPosition = {
    x: clamp01(excitation.position.x + displacement.x),
    y: clamp01(excitation.position.y + displacement.y)
  }

  const nextPhase = excitation.phase + computeEnergy(excitation) * dt

  return {
    ...excitation,
    position: nextPosition,
    phase: nextPhase
  }
}

const areOppositeSpecies = (a: Excitation, b: Excitation): boolean => {
  return (
    a.field === 'electron' &&
    b.field === 'electron' &&
    a.alive &&
    b.alive &&
    ((a.kind === 'particle' && a.charge < 0 && b.kind === 'antiparticle' && b.charge > 0) ||
      (a.kind === 'antiparticle' && a.charge > 0 && b.kind === 'particle' && b.charge < 0))
  )
}

const createPhotonFromPair = (
  electron: Excitation,
  positron: Excitation,
  idStart: number,
  spawnPosition: Vec2,
  options: Required<Pick<SimulationOptions, 'annihilationMode' | 'annihilationScatteringAngle'>>
): { photons: Excitation[]; summary: Omit<AnnihilationSummary, 'time' | 'eventId'> } => {
  const photonMomenta = buildTwoPhotonMomentaForMode(
    electron.momentum,
    positron.momentum,
    options.annihilationMode,
    options.annihilationScatteringAngle
  )
  const photonHelicities = [1, -1] as const

  const finalSpawn = {
    x: normalizeWrapped(spawnPosition.x),
    y: normalizeWrapped(spawnPosition.y)
  }

  const photonA = makeExcitation({
    id: String(idStart),
    field: 'photon',
    kind: photonDefaults.kind,
    charge: photonDefaults.charge,
    spinLabel: photonDefaults.spinLabel,
    helicity: photonHelicities[0],
    mass: PHOTON_MASS_SIM,
    position: finalSpawn,
    momentum: photonMomenta[0],
    amplitude: 0.85,
    phase: 0
  })

  const photonB = makeExcitation({
    id: String(idStart + 1),
    field: 'photon',
    kind: photonDefaults.kind,
    charge: photonDefaults.charge,
    spinLabel: photonDefaults.spinLabel,
    helicity: photonHelicities[1],
    mass: PHOTON_MASS_SIM,
    position: finalSpawn,
    momentum: photonMomenta[1],
    amplitude: 0.85,
    phase: Math.PI / 2
  })

  const beforeEnergy = computeEnergy(electron) + computeEnergy(positron)
  const afterEnergy = Math.abs(computeEnergy(photonA)) + Math.abs(computeEnergy(photonB))
  const beforeMomentum = add(electron.momentum, positron.momentum)
  const afterMomentum = add(photonA.momentum, photonB.momentum)
  const beforeVector = buildFourVector(beforeEnergy, beforeMomentum)
  const afterVector = buildFourVector(afterEnergy, afterMomentum)
  const beforeInvariantMass = computeInvariantMass(electron, positron)
  const afterInvariantMass = computeInvariantMassFromEnergyMomentum(afterEnergy, afterMomentum)
  const beforeKinematics = computeKinematicsFromEnergyMomentum(beforeEnergy, beforeMomentum)
  const afterKinematics = computeKinematicsFromEnergyMomentum(afterEnergy, afterMomentum)
  const residual = computeAnnihilationResidual(beforeEnergy, beforeMomentum, afterEnergy, afterMomentum)
  const vectorResidual = computeFourVectorResidual(beforeVector, afterVector)
  const photonCollinearity = computeFourVectorCollinearity(photonA.momentum, photonB.momentum)
  const photonAntiparallelError = photonCollinearity + 1

  const residualWithDiagnostics = {
    ...residual,
    invariantMassSquared: vectorResidual.invariantMassSquared,
    photonCollinearity,
    photonAntiparallelError
  }

  const summary = {
    mode: options.annihilationMode,
    incoming: {
      electron: { id: electron.id, momentum: electron.momentum },
      positron: { id: positron.id, momentum: positron.momentum }
    },
    photonMomenta,
    beforeMomentum,
    afterMomentum,
    beforeEnergy,
    afterEnergy,
    beforeInvariantMass,
    afterInvariantMass,
    residual: residualWithDiagnostics,
    beforeKinematics,
    afterKinematics,
    scattering: computeAnnihilationScattering(
      electron,
      positron,
      photonA,
      photonB,
      options.annihilationMode,
      photonHelicities,
      options.annihilationScatteringAngle
    ),
    spawnPosition: finalSpawn
  }

  const checks = evaluateAnnihilationChecks(summary)

  return {
    photons: [photonA, photonB],
    summary: {
      ...summary,
      checks
    }
  }
}

const detectCrossing = (
  firstStart: Vec2,
  firstEnd: Vec2,
  secondStart: Vec2,
  secondEnd: Vec2,
  annihilationDistance: number
): { time: number; spawnPosition: Vec2 } | null => {
  const thresholdSq = annihilationDistance * annihilationDistance
  const best = {
    distanceSq: Number.POSITIVE_INFINITY,
    time: 0,
    spawnPosition: { x: 0, y: 0 }
  }

  for (const firstShiftX of WRAP_SHIFTS) {
    for (const firstShiftY of WRAP_SHIFTS) {
      for (const secondShiftX of WRAP_SHIFTS) {
        for (const secondShiftY of WRAP_SHIFTS) {
          const a0 = {
            x: firstStart.x + firstShiftX,
            y: firstStart.y + firstShiftY
          }
          const a1 = {
            x: firstEnd.x + firstShiftX,
            y: firstEnd.y + firstShiftY
          }
          const b0 = {
            x: secondStart.x + secondShiftX,
            y: secondStart.y + secondShiftY
          }
          const b1 = {
            x: secondEnd.x + secondShiftX,
            y: secondEnd.y + secondShiftY
          }

          const rel0 = {
            x: a0.x - b0.x,
            y: a0.y - b0.y
          }

          const rel1 = {
            x: a1.x - b1.x,
            y: a1.y - b1.y
          }

          const relDelta = {
            x: rel1.x - rel0.x,
            y: rel1.y - rel0.y
          }

          const relDeltaSq = relDelta.x * relDelta.x + relDelta.y * relDelta.y
          let time = 0

          if (relDeltaSq > EPSILON) {
            time = -(rel0.x * relDelta.x + rel0.y * relDelta.y) / relDeltaSq
          }

          time = clamp(time, 0, 1)

          const relative = {
            x: rel0.x + relDelta.x * time,
            y: rel0.y + relDelta.y * time
          }

          const distanceSq = relative.x * relative.x + relative.y * relative.y

          if (distanceSq < best.distanceSq) {
            best.distanceSq = distanceSq
            best.time = time

            best.spawnPosition = {
              x: (a0.x + (a1.x - a0.x) * time + b0.x + (b1.x - b0.x) * time) / 2,
              y: (a0.y + (a1.y - a0.y) * time + b0.y + (b1.y - b0.y) * time) / 2
            }
          }
        }
      }
    }
  }

  if (best.distanceSq <= thresholdSq) {
    return {
      time: best.time,
      spawnPosition: {
        x: normalizeWrapped(best.spawnPosition.x),
        y: normalizeWrapped(best.spawnPosition.y)
      }
    }
  }

  return null
}

export const stepSimulation = (
  state: SimulationState,
  dt: number,
  options: SimulationOptions = { annihilationDistance: DEFAULT_ANNIHILATION_DISTANCE }
): SimulationState => {
  if (dt <= 0 || state.excitations.length === 0) {
    return {
      ...state,
      time: state.time + Math.max(0, dt)
    }
  }

  const resolvedOptions = {
    annihilationDistance: options.annihilationDistance,
    annihilationMode: options.annihilationMode ?? DEFAULT_ANNIHILATION_MODE,
    annihilationScatteringAngle:
      options.annihilationScatteringAngle ?? DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE
  }
  const safeDt = Math.max(0, dt)
  const moved = state.excitations.map((excitation) => stepExcitation(excitation, safeDt))

  const electronCandidates = state.excitations
    .map((excitation, index) => ({
      start: excitation,
      moved: moved[index]
    }))
    .filter(({ start }) => start.field === 'electron' && start.alive)

  const pendingPairs: SpawnedPair[] = []
  const idsToRemove = new Set<string>()
  const spawnedPhotons: Excitation[] = []
  let summary: AnnihilationSummary | null = null
  let nextId = state.nextId

  for (let i = 0; i < electronCandidates.length; i += 1) {
    const first = electronCandidates[i]

    for (let j = i + 1; j < electronCandidates.length; j += 1) {
      const second = electronCandidates[j]

      if (!areOppositeSpecies(first.start, second.start)) {
        continue
      }

      const collision = detectCrossing(
        first.start.position,
        first.moved.position,
        second.start.position,
        second.moved.position,
        resolvedOptions.annihilationDistance
      )

      if (!collision) {
        continue
      }

      pendingPairs.push({
        time: collision.time,
        electron: first.start.charge < 0 ? first.moved : second.moved,
        antiparticle: first.start.charge < 0 ? second.moved : first.moved,
        spawnPosition: collision.spawnPosition
      })
    }
  }

  const sortedPairs = [...pendingPairs].sort((left, right) => {
    if (left.time === right.time) {
      return left.electron.id.localeCompare(right.electron.id)
    }

    return left.time - right.time
  })

  for (const pair of sortedPairs) {
    if (idsToRemove.has(pair.electron.id) || idsToRemove.has(pair.antiparticle.id)) {
      continue
    }

    const spawn = createPhotonFromPair(
      pair.electron,
      pair.antiparticle,
      nextId,
      pair.spawnPosition,
      resolvedOptions
    )

    idsToRemove.add(pair.electron.id)
    idsToRemove.add(pair.antiparticle.id)
    spawnedPhotons.push(...spawn.photons)
    nextId += 2

    if (!summary) {
      summary = {
        eventId: `a-${state.time.toFixed(4)}-${spawnedPhotons.length}`,
        time: state.time + pair.time * safeDt,
        ...spawn.summary
      }
    }
  }

  const survivors = moved
    .filter((excitation) => !idsToRemove.has(excitation.id))
    .map((excitation) => (idsToRemove.has(excitation.id) ? { ...excitation, alive: false } : excitation))

  return {
    time: state.time + safeDt,
    nextId,
    excitations: [...survivors, ...spawnedPhotons],
    lastAnnihilation: summary ?? state.lastAnnihilation
  }
}

export const selectExcitation = (state: SimulationState, id: string | null): SimulationState => ({
  ...state,
  excitations: selectOnly(state.excitations, id)
})

export const findClosestExcitation = (
  state: SimulationState,
  point: Vec2,
  field: 'electron' | 'photon',
  threshold = 0.05
): Excitation | undefined => {
  let best: Excitation | undefined
  let bestDist = Infinity

  for (let i = 0; i < state.excitations.length; i += 1) {
    const excitation = state.excitations[i]
    if (!excitation.alive || excitation.field !== field) {
      continue
    }

    const hit = distance(excitation.position, point)
    if (hit < threshold && hit < bestDist) {
      bestDist = hit
      best = excitation
    }
  }

  return best
}

const buildSpawnTemplate = (
  tool: 'spawn-electron' | 'spawn-positron' | 'spawn-photon'
) => {
  if (tool === 'spawn-electron') {
    return {
      ...electronDefaults,
      field: 'electron',
      kind: 'particle' as const
    }
  }

  if (tool === 'spawn-positron') {
    return {
      ...positronDefaults,
      field: 'electron',
      kind: 'antiparticle' as const
    }
  }

  return {
    ...photonDefaults,
    field: 'photon',
    kind: 'boson' as const
  }
}

export const spawnExcitation = (
  state: SimulationState,
  tool: 'spawn-electron' | 'spawn-positron' | 'spawn-photon',
  field: 'electron' | 'photon',
  position: Vec2,
  momentum: Vec2
): SimulationState => {
  const template = buildSpawnTemplate(tool)

  if (template.field !== field) {
    return state
  }

  const newParticle = {
    ...makeExcitation({
      id: String(state.nextId),
      field: template.field,
      kind: template.kind,
      charge: template.charge,
      spinLabel: template.spinLabel,
      helicity: template.helicity,
      mass: template.mass,
      position,
      momentum,
      amplitude: 1,
      phase: 0
    }),
    selected: true
  }

  return {
    ...state,
    time: state.time,
    nextId: state.nextId + 1,
    lastAnnihilation: null,
    excitations: [...selectOnly(state.excitations, null), newParticle]
  }
}

export const updateExcitationMomentum = (
  state: SimulationState,
  id: string,
  momentum: Vec2
): SimulationState => ({
  ...state,
  excitations: state.excitations.map((e) =>
    e.id === id
      ? {
          ...e,
          momentum
        }
      : e
  )
})

/**
 * Reposition an excitation without changing any other state. Used by the UI
 * when the user drags a packet around in select mode. The position is wrapped
 * into the unit torus so it stays addressable by the renderer.
 */
export const moveExcitation = (
  state: SimulationState,
  id: string,
  position: Vec2
): SimulationState => ({
  ...state,
  excitations: state.excitations.map((e) =>
    e.id === id
      ? {
          ...e,
          position: {
            x: clamp01(position.x),
            y: clamp01(position.y)
          }
        }
      : e
  )
})

export const clearAll = (state: SimulationState): SimulationState => ({
  ...state,
  time: 0,
  nextId: 1,
  lastAnnihilation: null,
  excitations: []
})
