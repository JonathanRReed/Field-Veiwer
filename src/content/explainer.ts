import type { PresetId } from '../types/simulation'

export interface PresetGuide {
  title: string
  objective: string
  steps: string[]
  checks: string[]
}

export const presetGuides: Record<PresetId, PresetGuide> = {
  uniformity: {
    title: 'Uniformity',
    objective:
      'Every electron is the same thing. Only position and momentum differ.',
    steps: [
      'Load Uniformity.',
      'Pause and step through to inspect each packet.',
      'Select different electrons and check their mass, charge, spin.',
      'Drop another electron and give it a different push.'
    ],
    checks: [
      'All electrons share the same mass, charge, and spin.',
      'Only momentum and position change between them.',
      'No hidden "identity" tag, just state variables.'
    ]
  },
  mirror: {
    title: 'Mirror Excitations',
    objective: 'Electron and positron are the same field, opposite charge.',
    steps: [
      'Load Mirror Excitations.',
      'Check that both sit on the electron field.',
      'Select each one and compare values in the inspector.',
      'Charge is stored in the packet state, so which way it faces tells you nothing.'
    ],
    checks: [
      'Opposite charges, equal magnitude.',
      'Same mass and spin.',
      'Both on the electron field.'
    ]
  },
  annihilation: {
    title: 'Annihilation',
    objective: 'Watch an electron and positron disappear and two photons appear.',
    steps: [
      'Load Annihilation and press play.',
      'Wait for the overlap.',
      'Read the conservation panel when they meet.',
      'Try spawning photons by hand to see the difference.'
    ],
    checks: [
      'The pair disappears from the electron field.',
      'Two photons show up in the photon field.',
      'Before and after energy and momentum match.'
    ]
  }
}

export const limitationStatements: string[] = [
  'No Pauli exclusion, electrons can overlap freely.',
  'No scattering, polarization, pair production, or higher-order processes.',
  'No field equation is solved. Motion is deterministic and everything on screen is a rendered analogy.'
]

export const requiredStatements: string[] = [
  'The wavy surface is a drawing metaphor for the field.',
  'Electrons are identical excitations of one shared field.',
  'A positron is just the same field with opposite charge.',
  'Annihilation moves energy into photon excitations; there is no “pure energy” step.',
  'Energy and momentum are actually conserved in the math.'
]
