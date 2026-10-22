import type { Vec2 } from '../types/particle'

export const SIM_C = 1
export const ELECTRON_MASS_SIM = 1
export const PHOTON_MASS_SIM = 0

export const DEFAULT_ANNIHILATION_DISTANCE = 0.075
export const DEFAULT_ANNIHILATION_MODE = 'center-of-momentum'
export const DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE = Math.PI / 2
export const DEFAULT_COM_ANNIHILATION_SCATTERING_ANGLE_DEGREES = 90

export const STABLE_AXIS: Vec2 = { x: 1, y: 0 }
