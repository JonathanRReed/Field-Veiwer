# Field Viewer

Field Viewer is a client-side physics visualization for inspecting electron, positron, and photon packets and checking the conservation math behind annihilation events.

It is intentionally not a full quantum field theory solver. The value proposition is clarity: explicit assumptions, visible state, and a compact interface that makes the model easy to explain in an interview.

## Why this project reads well in a portfolio

- Strong visual demo with a browser canvas and immediate feedback.
- Honest scope: the README states what the model does and does not do.
- Tests cover the core math and rendering helpers.
- Static, deployable, client-only app with no accounts or backend dependencies.
- Clear metadata and social preview assets for sharing.

## Features

- Canvas-rendered electron and photon field panels.
- Tools for selecting, placing, steering, and clearing packets.
- Electron, positron, and photon packet types.
- Three presets: Uniformity, Mirror Excitations, and Annihilation.
- Play, pause, step, reset, time scale, and trace controls.
- Selected-packet inspector with charge, mass, spin label, energy, momentum, kinetic energy, gamma, direction, and speed.
- Annihilation event panel with before and after energy and momentum values.
- Client-side only runtime, no backend, accounts, database, analytics, or external runtime data.
- Static deployment output for Cloudflare Pages or any static host.

## Quick start

```bash
bun install
bun run dev
```

## Controls

- Select: inspect a packet and drag to move it.
- Electron, positron, photon: drag on the matching field to create a packet.
- Space: play or pause.
- S: step one frame when paused.
- R: reset.
- 1, 2, 3, 4: switch tools.
- Escape: close the settings panel or clear selection.

## Model scope

Field Viewer uses normalized simulation units:

- Speed of light: `c = 1`
- Electron mass: `m = 1`
- Photon mass: `0`

The model treats electrons and positrons as localized packets on an electron field panel. Positrons carry the same mass and opposite charge. Electron-positron annihilation triggers when packets overlap within the configured threshold and produces two photon packets.

The default annihilation path builds the photon pair in the center-of-momentum frame, then boosts it into the lab frame. A simplified collinear mode is also available in settings.

## Limits

- Field panels are visual surfaces, not literal spacetime.
- Packet coordinates are drawing coordinates for localized packets, not full relativistic position observables.
- Motion is deterministic and simplified for inspection.
- The app does not model gauge-field interactions, full spinor formalism, pair production, many-body fermion statistics, scattering channels, polarization dynamics, or higher-order QED processes.

See [docs/math-accuracy-audit-2026-04-15.md](docs/math-accuracy-audit-2026-04-15.md) for the math audit and upgrade notes.

## Project structure

```text
src/
  App.tsx                    App shell, controls, overlays, and about page
  components/FieldStage.tsx  Canvas stage wrapper and pointer handling surface
  content/                   Explainer and preset copy
  rendering/                 Canvas drawing logic
  simulation/                Constants, presets, physics, and update engine
  types/                     Particle and simulation types
  utils/                     Vector math, formatting, and stats helpers
tests/                       Vitest coverage for math, rendering, presets, and stats
public/                      Static metadata, icon, social card, sitemap, and headers
docs/                        Model notes and accuracy audit
```

## Requirements

- Bun `>= 1.3.0`
- Node `>= 22.12.0`, used by Vite and TypeScript tooling

## Quality checks

```bash
bun run check
```

That script runs:

```bash
bun run lint
bun run typecheck
bun run test
bun run build
```

## Preview production build

```bash
bun run build
bun run preview
```

## Static deployment

For Cloudflare Pages or another static host:

- Build command: `bun run build`
- Output directory: `dist`

The app ships with `public/_headers`, `public/robots.txt`, `public/sitemap.xml`, `public/favicon.svg`, `public/og-card.svg`, and `public/site.webmanifest`.

## License

MIT, see [LICENSE](LICENSE).
