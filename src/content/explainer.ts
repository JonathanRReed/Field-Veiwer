import type { PresetId } from '../types/simulation'

export interface ExplainSection {
  title: string
  points: string[]
}

export interface PresetGuide {
  title: string
  objective: string
  steps: string[]
  checks: string[]
}

export const explainSections: ExplainSection[] = [
  {
    title: 'What this model gets right',
    points: [
      'Excitations are localized wave packets on one field canvas, not hard particles.',
      'Electrons and positrons are explicit excitations of the same electron field.',
      'Antiparticles are represented with opposite charge and explicit kind field.',
      'Annihilation replaces the pair with two photon packets using a deterministic two-photon transfer rule.',
      'The simulation tracks momentum and energy algebraically at every annihilation event.',
      'Each excitation can be interpreted as a compact four-vector (E, px, py) with explicit covariant bookkeeping.'
    ]
  },
  {
    title: 'What this model simplifies',
    points: [
      'Not a full quantum field equation solver.',
      'Field equations and quantization are not solved exactly; this is a visual map, not a literal numerical method.',
      'No spinor math, polarization dynamics, gauge degrees of freedom, or pair-production channels.',
      'No collision dynamics beyond overlap triggers and deterministic replacement.'
    ]
  },
  {
    title: 'Why electrons are identical',
    points: [
      'Each electron excitation shares the same intrinsic template values in this model.',
      'Only state variables such as position and momentum differ between two electron packets.',
      'This avoids assigning identity labels or hidden per-object traits beyond the required fields.'
    ]
  },
  {
    title: 'What antimatter means here',
    points: [
      'Antiparticles are explicit excitations on the same electron field with opposite charge.',
      'A positron is a distinct excitation state in the same field with opposite charge and kind.',
      'The visual downward packet is a visual convention; the state stores charge, kind, field, and momentum explicitly.'
    ]
  },
  {
    title: 'What annihilation means here',
    points: [
      'When electron and positron overlap within a threshold, both are removed from the electron field.',
      'Two photons are spawned on the photon field with momentum built from the conservation formula.',
      'This is transfer into photon field excitations, not conversion into “abstract energy.”',
      'Momentum and energy are numerically conserved in the post-event check.'
    ]
  },
    {
      title: 'Deeper math in this model',
      points: [
        'All massive packets use relativistic kinematics with c = 1.',
        'Speed is computed from v = |p| / E.',
        'Lorentz factor γ is shown as E / m (for massive packets).',
        'Each excitation contributes a four-vector p = (E, px, py) with E = sqrt(m² + |p|²) for massive packets and E = |p| for photons.',
        'System kinematics are tracked from aggregated energy-momentum: m_inv = sqrt(E² - |P|²), β = |P|/E, γ = 1/sqrt(1-β²), y = 0.5 ln[(1+β)/(1-β)].',
        'Mass-shell consistency is monitored with Δ = (E² - p² - m²).',
        'Rapidity y = 0.5 ln[(1 + β)/(1 - β)] is shown for finite-speed packets.',
        'Annihilation also checks invariant mass m_inv = √(E_tot² - |P_tot|²) for before/after.',
        'The conserved center-of-momentum velocity is β_CM = P_total / E_total. For annihilation, this stays fixed between the packet pair and the emitted photon pair by construction.',
        'For two-photon emission, collinearity is enforced through k1 = ((E + |P|)/2) * P̂ and k2 = -((E - |P|)/2) * P̂, and total (E, P) is matched exactly.',
        'The photon channel also enforces that k1 + k2 = P and |k1| + |k2| = E even after wrap-normalized coordinates.',
        'For the annihilation event, the app can also report Mandelstam invariants s, t, u with the identity s + t + u = Σm² for this 2 → 2 process.'
      ]
    }
  ]

export const presetSummaries: { [key: string]: string[] } = {
  uniformity: [
    'Identical intrinsic entries: same mass 1, same spin 1/2, same field label electron.',
    'Different trajectories and positions show that only state variables differ, not intrinsic species identity.'
  ],
  mirror: [
    'Electron and positron show opposite charge and same mass and spin label.',
    'Visual packets differ for readability only; internal data is explicit and identical mass and spin.'
  ],
  annihilation: [
    'Start with a collision setup, then inspect the conservation summary when overlap triggers conversion.',
    'Total momentum and total energy are checked explicitly at each annihilation event.'
  ]
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
      'Remember: charge is stored, not guessed from which way the packet faces.'
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
  'Motion is deterministic and simplified, not a real field equation.',
  'No backend solver, this is a rendered analogy, not a numerical method.'
]

export const requiredStatements: string[] = [
  'The wavy surface is a metaphor, not a literal field.',
  'Electrons are identical excitations of one shared field.',
  'A positron is just the same field with opposite charge.',
  'Annihilation moves energy into photon excitations, not into “pure energy.”',
  'Energy and momentum are actually conserved in the math.',
  'This app skips Pauli exclusion and many-body statistics.',
  'Real quantum field theory is far more complex than this toy.'
]

export const fieldCatalog = [
  'electron neutrino',
  'W boson',
  'up quark',
  'down quark'
]
