# User stories and review log

Each story names a person, what they want, and how we check that Field Viewer gives it to them. The review log at the end records what the adversarial pass found.

## Stories

### 1. The curious newcomer

I know nothing about physics. I opened the link to see what it is.

- Within ten seconds I can tell there are two fields and that things move on them.
- The hint on the stage tells me to press Space, and what to do to add my own packet.
- When a pair vanishes, a plain sentence says what happened and whether the totals matched.
- If I want to know what a bump, a dip, or an arrow means, the About page says so.

### 2. The physics student

I want to read real numbers and trust them.

- Every readout has a symbol I recognize (E, p, K, γ, β, λ) and a stated unit system (c = ħ = mₑ = 1).
- The mass, charge, and spin of the electron, positron, and photon match the accepted values.
- Energy, momentum, and √s on the event card agree with a hand calculation.
- A pair at rest gives two photons of energy 1 (511 keV each in real units), back to back.

### 3. The skeptical physicist

I want to know what is faked before I trust anything else.

- The About page lists what the model skips, including the annihilation rule, the photon direction, polarization, and Pauli exclusion.
- The page says the conservation checks test the bookkeeping, not the law.
- The app never shows a quantity it did not compute, such as a photon helicity it invented.
- No state is reachable that breaks physics the app claims to respect, such as a photon at rest.

### 4. The teacher

I have five minutes and a projector.

- Three experiments with steps and things to confirm, each with a button that loads it in the lab.
- Keyboard shortcuts for play, pause, step, and reset so I can drive it from the front of the room.
- The demo on the About page loops without me touching anything.

### 5. The keyboard and screen reader user

- Every control is reachable with Tab and has a visible focus ring.
- Icon buttons have names, and sighted mouse users get tooltips that include the shortcut.
- Settings is a real dialog. Focus moves in, Tab stays inside, Escape closes it.
- The canvas has a text alternative, and the About page and the HTML summary cover the same ground.

### 6. The phone user

- The top bar, dock, and cards fit a 390 px screen without sideways scrolling.
- One card shows at a time, so the stage stays visible.
- Touch drag launches a packet the same way a mouse drag does.

### 7. The tinkerer

I want to set up my own collision.

- Picking Electron or Positron says what a drag does, and that a longer drag is a faster packet.
- I can aim two packets at each other, steer them after placing them, and watch the event card.
- Settings explains the two annihilation modes and what the angle controls.

## Review log

### Physics findings, fixed

| Finding | Why it mattered | Fix |
| --- | --- | --- |
| The rest-frame angle θ* read 0° for a pair at rest, even when set to 60° or 90°. | The card contradicted the setting. The reference direction was undefined when the incoming momentum was zero. | Use the same fallback axis the photons are built from. |
| A photon dropped with a click and no drag was created with zero momentum. | A photon at rest has no direction and cannot exist. It sat there with zero energy. | A photon needs at least 0.05 momentum to be created. Steering one down stops at that floor. |
| The two annihilation photons were tagged helicity +1 and −1. | Two back-to-back photons from a spin-zero state would need equal helicities, and in fact neither has a definite one. The tag was wrong, and the card displayed it. | The tags are now undefined, the card does not show helicity, and it says polarization is not modeled. |
| Arrows near the field edge were clipped, so their length stopped matching momentum. | A longer arrow is supposed to mean more momentum. | Arrows are no longer clamped. |

### Physics checks that passed

- Energy and momentum are conserved for every combination of seven momenta, both modes, and five angles from 0° to 180°.
- Total energy and momentum of the whole state are unchanged over 6,000 steps with twelve random packets and several annihilations.
- Two electrons, two positrons, and a photon crossing an electron never annihilate.
- A positron meeting two electrons annihilates with exactly one.
- Parallel packets at the same speed never meet.
- Each photon's momentum equals its energy.

These are in `tests/adversarial.test.ts`.

### Comprehension findings, fixed

| Finding | Fix |
| --- | --- |
| Nothing said what a bump, a dip, or an arrow means. | The About page now says: a bump is an electron, a dip is a positron, an arrow points along the motion and its length follows momentum. |
| The lab showed numbers with no units. | Both cards say c = ħ = mₑ = 1, and the About page says energy is in mₑc² and momentum in mₑc. |
| The event card was all symbols. | A plain sentence now leads, and says when the totals do not match. |
| Icon buttons had no tooltip. | They have titles that include the shortcut. |
| The tool hint did not say how drag length maps to speed. | It does now. |
| The About page did not say what the conservation checks prove. | It says they test the bookkeeping, not the law. |
| The limits list left out the photon direction, the annihilation rule, and polarization. | All three are listed. |

### Second pass, fixed

| Finding | Fix |
| --- | --- |
| Field +y pointed toward the viewer, so a drag up and to the right read as 311° and p_y was negative. | Field +y now points away from the viewer. The same drag reads 49°, and 90° runs up the slab. The presets were mirrored so they look the same. |
| Heights ignored perspective, so a packet at the back edge poked out of the canvas and its marker went off screen. | Heights shrink with depth like widths do, and the back inset grew from 0.16 to 0.19. |
| A dragged packet jumped so its center sat under the cursor. | It keeps the offset where you grabbed it. |
| A cancelled touch left a half-drawn launch preview. | Cancel now drops the gesture. |
| The speed and scattering angle sliders had no accessible name, because the label's first labelable child was the output. | Both have an aria-label. |
| The event card could not be closed and covered the photon slab. | It has a close button and returns on the next event. |
| The event card angle labels were ambiguous. | They read "angle between photons, lab" and "θ*, photon from incoming line, rest frame". |
| The limits list did not say the readout wavelength is not drawn to scale. | It does now. |

### Known limits, not changed

- The default Annihilation preset is symmetric, so its total momentum is zero and the photons leave at exactly 180°. The Mirror pair preset and your own launches show boosted cases.
- Photon direction is chosen by the user, not sampled from the real angular distribution.
- Annihilation is a distance rule, not a cross section.
