# Field Viewer Math Accuracy Audit

Date: 2026-04-15

## Scope

This note audits the math currently used in Field Viewer and identifies the next changes that would improve physical fidelity without misrepresenting the app as a full QFT solver.

## Accurate now

These pieces are mathematically sound for a simplified relativistic particle-kinematics layer:

- Natural-unit convention `c = 1` and four-vector bookkeeping.
- Massive-particle energy relation `E = sqrt(m^2 + |p|^2)`.
- Photon energy relation `E = |p|`.
- Velocity rule `v = p / E`, interpreted as group velocity from the dispersion relation.
- Invariant mass bookkeeping `m_inv^2 = E_tot^2 - |P_tot|^2`.
- Lorentz boost bookkeeping through `beta = P / E`.
- Proper-time rate for massive packets via `d tau / d t = 1 / gamma`.
- Two-body center-of-mass momentum checks through the Kallen function.
- Mandelstam `s, t, u` tracking for the annihilation event.
- Center-of-momentum two-photon annihilation is now the default path. The app builds back-to-back photon momenta in COM, then boosts them into the lab frame.
- Photon helicity tags are represented as `+1` and `-1` on emitted photons.

## Honest, but simplified

These parts are acceptable for this visual model, but they are not the physically generic or fully quantum description:

- Packet positions are visualization coordinates on a field panel. In quantum field theory, the field argument is a spacetime label, not a literal relativistic single-particle position observable.
- The simulation treats excitations as localized packets with deterministic trajectories. This is a simplified wave-packet model, not full quantum evolution.
- Electron-positron annihilation is triggered by overlap. Real annihilation is an interaction amplitude and rate, not a geometric contact rule.
- The collinear two-photon final state remains available as a simplified mode. It conserves four-momentum exactly, but it picks one special member of the full physically allowed two-body final-state family.
- Photon helicity is represented as a tag for the two emitted photons, but polarization dynamics are not modeled.

## Most important next upgrades

### 1. Keep COM annihilation as the default and make it easier to operate

Current behavior:

- the default annihilation mode builds the final state in COM, then boosts it to the lab frame
- exact four-momentum conservation is covered by tests
- the user can choose COM or collinear mode in settings

Better behavior:

- keep selected packets steerable after placement
- expose momentum magnitude and angle directly in the inspector
- make the first-run preset demonstrate annihilation rather than only static electron uniformity

Benefit:

- still exact conservation
- physically stronger default behavior
- easier user control over whether packets actually meet

### 2. Add an explicit annihilation-mode selector

Recommended modes:

- `Collinear mode`, current deterministic choice
- `Full COM mode`, angularly generic two-body kinematics

Benefit:

- keeps the app stable and predictable
- adds a more faithful mode without hiding the simplification

### 3. Keep photon helicity visible and avoid overclaiming polarization

Recommended state addition:

- `helicity: +1 | -1 | null` is present in state

Benefit:

- better reflects a massless spin-1 particle, which has two physical propagating helicity states
- prepares the UI for polarization-aware explanations

### 4. Make the status text more explicit about what coordinates mean

Recommended wording:

- "Panel coordinates are visualization coordinates for a localized field packet."
- "They are not literal relativistic particle position observables."

Benefit:

- improves conceptual accuracy
- aligns the app with field-theory language

## Changes to avoid unless the model is upgraded further

- Do not add a hard Pauli-exclusion collision rule in plain position space. The real restriction is about occupation of the same quantum state, not simply being nearby in the panel.
- Do not add a QED-inspired annihilation probability from a high-energy differential cross-section unless the app also defines the regime and units clearly. The common Born-level high-energy formula for `e+ e- -> gamma gamma` is not the right default near threshold.
- Do not market packet phase as a literal observable quantum phase of a measured particle trajectory.

## Source-backed guidance

- PDG kinematics review supports the current four-vector, invariant-mass, Lorentz-boost, and two-body phase-space formulas.
- MIT QFT lecture material supports the field-first interpretation and the caution that relativistic fixed-particle wave equations are only approximate and that the field coordinate is a label, not a literal particle-position observable.
- CERN antimatter references support the statement that the positron is the electron's antiparticle with the same mass and opposite charge.
- LEP `e+ e- -> gamma gamma` analyses confirm that the process has a nontrivial differential cross-section, so a single collinear final-state choice should be described as a simplification, not as the unique physical outcome.

## Priority order

1. Full COM annihilation mode
2. Helicity state for photons
3. Better coordinate-language in the UI
4. Optional angular visualizations and 3D-aware diagnostics
