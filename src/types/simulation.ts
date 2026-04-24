import type { AnnihilationMode } from './particle'

export interface SimulationOptions {
  annihilationDistance: number
  annihilationMode?: AnnihilationMode
  annihilationScatteringAngle?: number
}

export type PresetId = 'uniformity' | 'mirror' | 'annihilation'

export interface SimulationControlsState {
  running: boolean
  timeScale: number
  showGrid: boolean
  showTraces: boolean
  showLabels: boolean
}

export interface SpawnTemplate {
  field: 'electron' | 'photon'
  kind: 'particle' | 'antiparticle' | 'boson'
  charge: number
  spinLabel: number
  mass: number
}
