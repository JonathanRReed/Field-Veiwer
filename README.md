# Field Viewer

Inspect electron, positron, and photon packets in your browser. Place and steer packets, trigger electron-positron annihilation, and check the energy and momentum residuals in the event panel.

This is not a quantum field theory solver. It implements relativistic energy-momentum, Lorentz boosts, and two-body annihilation with the simplifications listed below. It runs entirely in the browser, without accounts, a backend, analytics, or external runtime data.

## Run locally

Requires Bun 1.3.0+ and Node 22.12.0+.

```bash
bun install
bun run dev
```

## Controls

| Control | Action |
| --- | --- |
| Select tool | Inspect a packet; drag to move it |
| Electron, positron, or photon tool | Drag on the matching field to create a packet |
| Space | Play or pause |
| S | Step one frame while paused |
| R | Reset |
| 1, 2, 3, 4 | Switch tools |
| Escape | Close settings or clear selection |

Start with Uniformity, Mirror Excitations, or Annihilation. Time-scale and trace controls help inspect motion.

The packet inspector shows mass, charge, spin, energy, momentum, kinetic energy, gamma, beta, de Broglie wavelength, and photon helicity. The annihilation panel shows energy and momentum before and after the event, √s, photon opening angle, center-of-momentum scattering angle, and conservation residuals.

## Model and limits

Simulation units use `c = 1`, electron mass `m = 1`, and photon mass `0`. Electrons and positrons are localized packets with equal mass and opposite charge. Overlap within the configured threshold triggers annihilation into two photons.

The default path creates the photons in the center-of-momentum frame, then boosts them to the lab frame. Settings also offers a simplified collinear mode.

Field panels are drawings, not literal spacetime. Packet coordinates are drawing coordinates, not full relativistic position observables. Motion is deterministic and simplified for inspection.

The app does not model gauge-field interactions, full spinor formalism, pair production, many-body fermion statistics, scattering channels, polarization dynamics, or higher-order QED processes. See the [math audit](docs/math-accuracy-audit-2026-04-15.md).

## Develop and deploy

```bash
bun run check
```

This runs lint, type checks, Vitest, and the production build. To preview:

```bash
bun run build
bun run preview
```

For Cloudflare Pages or another static host, build with `bun run build` and publish `dist`.

| Path | Contents |
| --- | --- |
| `src/App.tsx` | Controls, overlays, and about page |
| `src/components/FieldStage.tsx` | Canvas stage and pointer handling |
| `src/content/` | Explainers and preset copy |
| `src/rendering/` | Canvas drawing |
| `src/simulation/` | Constants, presets, physics, and update loop |
| `src/types/`, `src/utils/` | Types, vector math, formatting, and statistics |
| `tests/` | Math, rendering, preset, and statistics tests |
| `public/` | Headers, metadata, icons, social card, sitemap, and manifest |
| `docs/` | Model notes and accuracy audit |

## License

[MIT](LICENSE).
