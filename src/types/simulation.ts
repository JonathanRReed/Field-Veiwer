import type { AnnihilationMode } from './particle'

export interface SimulationOptions {
  annihilationDistance: number
  annihilationMode?: AnnihilationMode
  annihilationScatteringAngle?: number
}

export type PresetId = 'uniformity' | 'mirror' | 'annihilation'
