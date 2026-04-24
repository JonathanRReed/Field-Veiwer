import type { Vec2 } from '../types/particle'

export const SIM_C = 1
export const ELECTRON_MASS_SIM = 1
export const PHOTON_MASS_SIM = 0
export const ELECTRON_FIELD_COLOR = '#72e8ff'
export const ELECTRON_PARTICLE_COLOR = '#ff3f56'
export const POSITRON_PARTICLE_COLOR = '#ff1d45'
export const PHOTON_COLOR = '#ffd56a'

export const DEFAULT_SIMULATION_STEP = 1 / 60
export const DEFAULT_ANNIHILATION_DISTANCE = 0.075
export const DEFAULT_ANNIHILATION_MODE = 'center-of-momentum'
export const DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE = Math.PI / 2
export const DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE_DEGREES = 90

export const UNIT_MAGNITUDE_REFERENCE = {
  electronMass: '9.109 × 10^-31 kg',
  electronCharge: '1.602 × 10^-19 C',
  electronPositronSpin: 'ħ/2'
}

export const STABLE_AXIS: Vec2 = { x: 1, y: 0 }
