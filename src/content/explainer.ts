import type { PresetId } from '../types/simulation'

export interface PresetGuide {
  title: string
  objective: string
  steps: string[]
  checks: string[]
}

export const PRESET_ORDER: PresetId[] = ['uniformity', 'mirror', 'annihilation']

export const presetGuides: Record<PresetId, PresetGuide> = {
  uniformity: {
    title: 'Uniformity',
    objective: 'Every electron is the same thing. Only position and momentum differ.',
    steps: [
      'Load Uniformity and press pause.',
      'Click two electrons and compare their readouts.',
      'Drop another electron and give it a different push.'
    ],
    checks: [
      'Mass, charge, and spin are identical.',
      'Nothing tags one electron as different from another.'
    ]
  },
  mirror: {
    title: 'Mirror pair',
    objective: 'An electron and a positron are one field with opposite charge.',
    steps: [
      'Load Mirror pair.',
      'Notice that both packets sit on the electron field.',
      'Click each one and compare the sign of q.'
    ],
    checks: [
      'Charges are equal and opposite.',
      'Mass and spin match.'
    ]
  },
  annihilation: {
    title: 'Annihilation',
    objective: 'An electron and a positron meet. Two photons leave.',
    steps: [
      'Load Annihilation and press play.',
      'Wait for the packets to overlap.',
      'Read the event card.'
    ],
    checks: [
      'The pair leaves the electron field and two photons appear below.',
      'Energy and momentum match before and after.'
    ]
  }
}

export const claims: string[] = [
  'The wavy surface is a drawing of the field, not a measurement of it.',
  'Every electron is the same excitation of one shared field.',
  'A positron is that field with the opposite charge.',
  'Annihilation hands energy to photon excitations. Nothing passes through a "pure energy" state.',
  'Energy and momentum are conserved in the math, and every event is checked.'
]

export const limitations: string[] = [
  'No Pauli exclusion. Electrons overlap freely.',
  'Annihilation fires by rule when an electron and a positron come within 0.075 units. In nature it happens with a probability that depends on energy and spin.',
  'You choose the photon direction, 90 degrees from the incoming line by default. In nature it is random, and at high energy it favors the line the pair came in on.',
  'Photon polarization is not modeled.',
  'No scattering, pair production, or higher-order processes.',
  'Space is a flat square that wraps at its edges, and positions are drawing coordinates.',
  'No field equation is solved. Motion is deterministic, and the picture is an analogy.'
]

export interface Source {
  author: string
  year: number
  title: string
  venue: string
  doi: string
}

export const sources: Source[] = [
  {
    author: 'Dirac, P. A. M.',
    year: 1928,
    title: 'The quantum theory of the electron',
    venue: 'Proceedings of the Royal Society A, 117, 610–624',
    doi: '10.1098/rspa.1928.0023'
  },
  {
    author: 'Anderson, C. D.',
    year: 1933,
    title: 'The positive electron',
    venue: 'Physical Review, 43, 491–494',
    doi: '10.1103/PhysRev.43.491'
  },
  {
    author: 'Feynman, R. P.',
    year: 1949,
    title: 'Space-time approach to quantum electrodynamics',
    venue: 'Physical Review, 76, 769–789',
    doi: '10.1103/PhysRev.76.769'
  }
]
