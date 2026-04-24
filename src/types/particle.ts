export type FieldType = 'electron' | 'photon'
export type ExcitationKind = 'particle' | 'antiparticle' | 'boson'
export type PhotonHelicity = -1 | 1 | null
export type AnnihilationMode = 'collinear' | 'center-of-momentum'

export interface Vec2 {
  x: number
  y: number
}

export interface Excitation {
  id: string
  field: FieldType
  kind: ExcitationKind
  charge: number
  spinLabel: number
  helicity?: PhotonHelicity
  mass: number
  position: Vec2
  momentum: Vec2
  amplitude: number
  phase: number
  alive: boolean
  selected: boolean
}

export interface RelativisticKinematics {
  energy: number
  momentum: Vec2
  invariantMass: number
  invariantMassSquared: number
  betaVector: Vec2
  speed: number
  gamma: number
  rapidity: number
}

export interface FourVector {
  energy: number
  momentum: Vec2
}

export interface FourVectorResidual {
  energy: number
  momentum: Vec2
  invariantMassSquared: number
}

export interface AnnihilationResidual {
  momentum: Vec2
  energy: number
  invariantMass: number
  invariantMassSquared: number
  photonCollinearity?: number
  photonAntiparallelError?: number
}

export interface AnnihilationDiagnosticFlags {
  energyResidualPass: boolean
  momentumResidualPass: boolean
  invariantMassSqResidualPass: boolean
  comResidualPass: boolean
  photonAntiparallelPass: boolean
  photonAntiparallelTarget: number
}

export interface AnnihilationChecks {
  diagnostics: AnnihilationDiagnosticFlags
  momentumResidualMagnitude: number
  energyResidualMagnitude: number
  invariantMassSqResidual: number
  invariantMassResidual: number
  comMomentumResidual: number
  comEnergyBefore: number
  comEnergyAfter: number
  photonRestEnergyAsymmetry: number
  comPhotonEnergySpread: number
  collinearity: number
  antiParallelError: number
  collinearityCom: number
}

export interface AnnihilationScattering {
  mode: AnnihilationMode
  s: number
  t: number
  u: number
  sqrtS: number
  thresholdOffset: number
  sumRuleResidual: number
  comBetaVector: Vec2
  comGamma: number
  incomingMomentumCm: number
  outgoingMomentumCm: number
  expectedIncomingMomentumCm: number
  expectedOutgoingMomentumCm: number
  incomingMomentumCmResidual: number
  outgoingMomentumCmResidual: number
  electronEnergyCm: number
  positronEnergyCm: number
  photonEnergyCm: readonly [number, number]
  photonHelicities: readonly [PhotonHelicity, PhotonHelicity]
  targetScatteringAngleCm: number
  scatteringAngleCm: number
  photonOpeningAngleLab: number
  photonOpeningAngleCm: number
}

export interface AnnihilationSummary {
  eventId: string
  time: number
  mode: AnnihilationMode
  incoming: {
    electron: { id: string; momentum: Vec2 }
    positron: { id: string; momentum: Vec2 }
  }
  photonMomenta: readonly Vec2[]
  beforeMomentum: Vec2
  afterMomentum: Vec2
  beforeEnergy: number
  afterEnergy: number
  beforeInvariantMass: number
  afterInvariantMass: number
  residual?: AnnihilationResidual
  beforeKinematics: RelativisticKinematics
  afterKinematics: RelativisticKinematics
  checks?: AnnihilationChecks
  scattering?: AnnihilationScattering
  spawnPosition: Vec2
}

export interface SimulationState {
  excitations: Excitation[]
  nextId: number
  time: number
  lastAnnihilation: AnnihilationSummary | null
}

export interface DragPreview {
  panel: FieldType
  start: Vec2
  end: Vec2
}
