import type { PresetId } from '../types/simulation'
import type { SimulationState } from '../types/particle'
import { makeExcitation } from './engine'
import {
  electronDefaults,
  positronDefaults,
  buildTwoPhotonMomenta
} from './physics'

export interface PresetStateMeta {
  id: PresetId
  name: string
  description: string
  state: SimulationState
}

export const presetSummaries: { [key: string]: string[] } = {
  uniformity: [
    'All electrons share the same mass, spin, and field label.',
    'Only position and momentum differ between them.'
  ],
  mirror: [
    'Electron and positron have opposite charge, same mass and spin.',
    'The way the packet faces is just for looks — charge is stored in the data.'
  ],
  annihilation: [
    'Crash an electron into a positron and read the conservation panel.',
    'Energy and momentum before and after are checked every time.'
  ]
}

const uniformity = (): PresetStateMeta => {
  const excitations = [
    makeExcitation({
      id: '1',
      field: 'electron',
      kind: electronDefaults.kind,
      charge: electronDefaults.charge,
      spinLabel: electronDefaults.spinLabel,
      mass: electronDefaults.mass,
      position: { x: 0.2, y: 0.22 },
      momentum: { x: 0.45, y: 0.06 },
      amplitude: 1,
      phase: 0
    }),
    makeExcitation({
      id: '2',
      field: 'electron',
      kind: electronDefaults.kind,
      charge: electronDefaults.charge,
      spinLabel: electronDefaults.spinLabel,
      mass: electronDefaults.mass,
      position: { x: 0.47, y: 0.44 },
      momentum: { x: -0.35, y: 0.02 },
      amplitude: 1,
      phase: 1
    }),
    makeExcitation({
      id: '3',
      field: 'electron',
      kind: electronDefaults.kind,
      charge: electronDefaults.charge,
      spinLabel: electronDefaults.spinLabel,
      mass: electronDefaults.mass,
      position: { x: 0.71, y: 0.27 },
      momentum: { x: 0.19, y: -0.33 },
      amplitude: 1,
      phase: 2
    }),
    makeExcitation({
      id: '4',
      field: 'electron',
      kind: electronDefaults.kind,
      charge: electronDefaults.charge,
      spinLabel: electronDefaults.spinLabel,
      mass: electronDefaults.mass,
      position: { x: 0.33, y: 0.66 },
      momentum: { x: -0.12, y: -0.21 },
      amplitude: 1,
      phase: 3
    }),
    makeExcitation({
      id: '5',
      field: 'electron',
      kind: electronDefaults.kind,
      charge: electronDefaults.charge,
      spinLabel: electronDefaults.spinLabel,
      mass: electronDefaults.mass,
      position: { x: 0.85, y: 0.74 },
      momentum: { x: 0.08, y: 0.27 },
      amplitude: 1,
      phase: 4
    })
  ]

  return {
    id: 'uniformity',
    name: 'Uniformity',
    description: 'Several electrons with identical mass, charge, and spin. Only position and momentum differ.',
    state: {
      time: 0,
      nextId: excitations.length + 1,
      lastAnnihilation: null,
      excitations
    }
  }
}

const mirror = (): PresetStateMeta => {
  const excitations = [
    makeExcitation({
      id: '1',
      field: 'electron',
      kind: electronDefaults.kind,
      charge: electronDefaults.charge,
      spinLabel: electronDefaults.spinLabel,
      mass: electronDefaults.mass,
      position: { x: 0.33, y: 0.48 },
      momentum: { x: 0.32, y: 0 },
      phase: 0
    }),
    makeExcitation({
      id: '2',
      field: 'electron',
      kind: positronDefaults.kind,
      charge: positronDefaults.charge,
      spinLabel: positronDefaults.spinLabel,
      mass: positronDefaults.mass,
      position: { x: 0.66, y: 0.48 },
      momentum: { x: -0.32, y: 0 },
      phase: 0
    })
  ]

  return {
    id: 'mirror',
    name: 'Mirror Excitations',
    description: 'Electron and positron carry opposite charge, same mass and spin.',
    state: {
      time: 0,
      nextId: excitations.length + 1,
      lastAnnihilation: null,
      excitations
    }
  }
}

const annihilation = (): PresetStateMeta => {
  const eMomentum = { x: 0.7, y: 0.13 }
  const pMomentum = { x: -0.7, y: -0.13 }
  buildTwoPhotonMomenta(eMomentum, pMomentum)

  const excitations = [
    makeExcitation({
      id: '1',
      field: 'electron',
      kind: electronDefaults.kind,
      charge: electronDefaults.charge,
      spinLabel: electronDefaults.spinLabel,
      mass: electronDefaults.mass,
      position: { x: 0.28, y: 0.46 },
      momentum: eMomentum,
      phase: 0
    }),
    makeExcitation({
      id: '2',
      field: 'electron',
      kind: positronDefaults.kind,
      charge: positronDefaults.charge,
      spinLabel: positronDefaults.spinLabel,
      mass: positronDefaults.mass,
      position: { x: 0.72, y: 0.54 },
      momentum: pMomentum,
      phase: 0
    })
  ]

  return {
    id: 'annihilation',
    name: 'Annihilation',
    description:
      'An electron and positron heading for each other. When they meet, they turn into two photons with conserved energy and momentum.',
    state: {
      time: 0,
      nextId: excitations.length + 1,
      lastAnnihilation: null,
      excitations
    }
  }
}

const PRESET_FACTORIES = {
  uniformity,
  mirror,
  annihilation
}

export const presets: PresetStateMeta[] = [
  PRESET_FACTORIES.uniformity(),
  PRESET_FACTORIES.mirror(),
  PRESET_FACTORIES.annihilation()
]

export const getPreset = (id: PresetId): PresetStateMeta =>
  presets.find((preset) => preset.id === id) ?? PRESET_FACTORIES.uniformity()

export const defaultPresetId: PresetId = 'annihilation'
